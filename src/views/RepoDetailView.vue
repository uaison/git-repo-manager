<template>
  <div class="repo-detail gl-app">
    <!-- ========== 顶部工具栏（菜单栏） ========== -->
    <header class="detail-top">
      <button class="btn-back" @click="$emit('back')">← 仓库列表</button>
      <div class="repo-breadcrumb">
        <span class="owner">{{ repo.owner?.login || repo.full_name?.split('/')[0] }}</span>
        <span class="sep">/</span>
        <strong class="name">{{ repo.name }}</strong>
        <span
          v-if="repo.private === true || repo.private === false"
          class="vis-badge"
          :class="repo.private ? 'is-private' : 'is-public'"
        >{{ repo.private ? '私有' : '公开' }}</span>
        <a class="open-gh" @click="openOnGithub" title="在 GitHub 网页打开">🔗</a>
      </div>

      <!-- 分支选择 + 管理 -->
      <div class="branch-group" v-if="!repo._isLocal">
        <span class="label">分支</span>
        <BranchDropdown v-model="selectedBranch" :branches="branchOptions" variant="header" @change="onBranchChange" />
        <div class="branch-popover-wrap" v-if="canManageBranches">
          <button class="btn-manage" @click="showBranchPanel = !showBranchPanel" title="管理分支">管理 ▾</button>
          <div v-if="showBranchPanel" class="branch-popover" @click.stop>
            <div class="popover-section">
              <div class="popover-title">操作</div>
              <button class="popover-btn" @click="showBranchPanel = false; showCreateBranch = true">➕ 新建分支</button>
              <button class="popover-btn" :disabled="branches.length <= 1" @click="showBranchPanel = false; showDeleteBranch = true">🗑️ 删除当前分支</button>
              <button class="popover-btn" @click="showBranchPanel = false; switchTab('tags')">🏷️ 管理标签</button>
              <button class="popover-btn" @click="showBranchPanel = false; switchTab('commits')">📜 提交历史</button>
            </div>
            <div class="popover-section">
              <div class="popover-title">从本地同步</div>
              <button class="popover-btn" @click="showBranchPanel = false; showMerge = true">🔀 合并另一个分支到当前</button>
            </div>
          </div>
        </div>
      </div>

      <div class="top-actions">
        <button
          v-if="isLocalRepo"
          class="btn-action"
          :title="isRemoteLinked ? '已关联远程仓库，点击可修改' : '关联 GitHub 远程仓库后才能拉取/推送'"
          @click="openLinkPanel"
        >🔗 {{ isRemoteLinked ? repo.full_name : '关联远程仓库' }}</button>
        <button class="btn-action" v-if="!isLocalRepo" :disabled="refreshing" @click="refreshRemote" title="重新获取分支、文件与当前标签页数据">
          {{ refreshing ? '刷新中...' : '🔄 刷新' }}
        </button>
        <button
          v-if="!isLocalRepo"
          class="btn-action primary"
          :disabled="pulling"
          title="下载该分支 zip 快照并初始化为本地 Git 仓库"
          @click="showPullPanel = true"
        >{{ pulling ? '下载中...' : '⬇ 下载并初始化' }}</button>
        <button
          v-else
          class="btn-action primary"
          :disabled="pullingLocal || !isRemoteLinked"
          :title="isRemoteLinked ? '执行 git pull（合并/变基）更新本地分支' : '请先关联 GitHub 远程仓库'"
          @click="doLocalPull"
        >{{ pullingLocal ? '更新中...' : '⬇ 更新' }}</button>
        <button class="btn-action primary-ghost" :disabled="!stagedFiles.length" @click="showPushPanel = true">
          🚀 推送 <span v-if="stagedFiles.length" class="count-badge">{{ stagedFiles.length }}</span>
        </button>
      </div>
    </header>

    <div class="gl-body">
      <!-- ================= 左侧导航 ================= -->
      <aside class="gl-sidebar" :class="{ collapsed: sidebarCollapsed }">
        <div class="gl-project-head" v-if="!sidebarCollapsed">
          <span class="gl-project-avatar">{{ projectInitial }}</span>
          <div class="gl-project-meta">
            <div class="gl-project-name" :title="repo.full_name || repo.name">{{ repo.name }}</div>
            <div class="gl-project-path">{{ repo.owner?.login || '本地项目' }}</div>
          </div>
        </div>
        <nav class="gl-nav">
          <a class="gl-nav-item" :class="{ active: activeTab === 'overview' }" @click="switchTab('overview')" :title="'概览'">
            <span class="gl-nav-ico">🏠</span><span class="gl-nav-label" v-if="!sidebarCollapsed">概览</span>
          </a>
          <div class="gl-nav-group" v-if="!sidebarCollapsed">版本库</div>
          <a
            v-for="item in repoNavItems"
            :key="item.key"
            class="gl-nav-item"
            :class="{ active: activeTab === item.key }"
            :title="item.label"
            @click="switchTab(item.key)"
          >
            <span class="gl-nav-ico">{{ item.icon }}</span>
            <span class="gl-nav-label" v-if="!sidebarCollapsed">{{ item.label }}</span>
          </a>
          <a
            v-if="isLocalRepo"
            class="gl-nav-item"
            :class="{ active: activeTab === 'changes' }"
            title="本地改动"
            @click="switchTab('changes')"
          >
            <span class="gl-nav-ico">📝</span>
            <span class="gl-nav-label" v-if="!sidebarCollapsed">本地改动</span>
            <span v-if="hasLocalChanges" class="nav-count-badge">{{ gitChanges.length }}</span>
          </a>
          <a
            v-for="item in otherNavItems"
            :key="item.key"
            class="gl-nav-item"
            :class="{ active: activeTab === item.key }"
            :title="item.label"
            @click="switchTab(item.key)"
          >
            <span class="gl-nav-ico">{{ item.icon }}</span>
            <span class="gl-nav-label" v-if="!sidebarCollapsed">{{ item.label }}</span>
          </a>
        </nav>
        <button class="gl-collapse" @click="sidebarCollapsed = !sidebarCollapsed">
          {{ sidebarCollapsed ? '»' : '« 折叠边栏' }}
        </button>
      </aside>

      <!-- ================= 主内容 ================= -->
      <main class="gl-main">
        <div class="gl-main-inner">
          <!-- 面包屑 -->
          <div class="gl-crumbs-bar">
            <div class="gl-crumbs">
              <span class="gl-crumb" @click="$emit('back')">{{ repo.owner?.login || 'local' }}</span>
              <span class="gl-sep">»</span>
              <span class="gl-crumb" @click="switchTab('overview')">{{ repo.name }}</span>
              <span class="gl-sep">»</span>
              <span class="gl-crumb" @click="switchTab('files')">存储库</span>
              <template v-if="activeTab !== 'overview' && activeTab !== 'files'">
                <span class="gl-sep">»</span>
                <span class="gl-crumb-current">{{ pageTitle }}</span>
              </template>
              <template v-if="activeTab === 'files' && currentDirPart">
                <span class="gl-sep">»</span>
                <span class="gl-crumb-current">{{ currentDirPart }}</span>
              </template>
            </div>
            <a class="gl-open-ext" title="在 GitHub 打开" @click="openOnGithub">🔗</a>
          </div>

          <!-- 分支 / 操作栏 -->
          <div class="gl-toolbar" v-if="showToolbar">
            <div class="gl-toolbar-left" v-if="isLocalRepo">
              <BranchDropdown v-model="selectedBranch" :branches="branchOptions" variant="light" @change="onBranchChange" />
              <span class="gl-repo-path">{{ currentDir || repo.name }}</span>
            </div>
            <div class="gl-toolbar-right">
              <input
                v-if="activeTab === 'commits'"
                v-model="commitFilter"
                class="gl-filter"
                placeholder="按提交消息过滤"
              />
              <input
                v-else-if="activeTab === 'tags'"
                v-model="tagFilter"
                class="gl-filter"
                placeholder="根据标签名称过滤"
              />
              <button v-if="activeTab === 'files'" class="gl-btn" @click="showFileFinder = true">🔍 查找文件</button>
              <button v-if="activeTab === 'files' || activeTab === 'overview'" class="gl-btn" @click="switchTab('commits')">🕘 历史</button>
              <button v-if="activeTab === 'tags' && canManageContent" class="gl-btn gl-btn-primary" @click="openCreateTag">＋ 新建标签</button>
              <button v-if="activeTab === 'releases' && canManageContent" class="gl-btn gl-btn-primary" @click="openCreateRelease">＋ 新建发布</button>
            </div>
          </div>

          <!-- ============ 概览 ============ -->
          <section v-if="activeTab === 'overview'" class="gl-content">
            <div class="gl-card">
              <div class="gl-card-head"><span class="gl-card-title">README</span></div>
              <div v-if="readmeContent" class="markdown-body gl-readme" v-html="renderedReadme"></div>
              <div v-else class="gl-empty">该仓库暂无 README 文件</div>
            </div>
            <div class="gl-card">
              <div class="gl-card-head"><span class="gl-card-title">项目信息</span></div>
              <div class="gl-info-grid">
                <div><span class="gl-info-k">仓库</span>{{ repo.full_name || '(本地项目)' }}</div>
                <div><span class="gl-info-k">当前分支</span>{{ selectedBranch }}</div>
                <div><span class="gl-info-k">提交数</span>{{ commits.length || '—' }}</div>
                <div><span class="gl-info-k">标签数</span>{{ tags.length || '—' }}</div>
              </div>
            </div>
          </section>

          <!-- ============ 文件 ============ -->
          <section v-else-if="activeTab === 'files'" class="gl-content">
            <!-- 远程文件查看 -->
            <template v-if="selectedFile && !selectedFile._local">
              <div class="gl-card gl-file-head">
                <div class="gl-file-title">
                  <button class="gl-back-inline" title="返回目录" @click="closeFileView">←</button>
                  <span class="gl-file-name">{{ currentPath }}</span>
                  <span class="gl-file-size" v-if="selectedFile.size">{{ fileSize(selectedFile.size) }}</span>
                  <span v-if="selectedFile.sha" class="gl-file-sha">{{ selectedFile.sha.slice(0, 7) }}</span>
                </div>
                <div class="gl-file-actions">
                  <div class="gl-seg" v-if="!isLargeFile && !isImage">
                    <button :class="['gl-seg-btn', viewMode === 'preview' ? 'active' : '']" @click="viewMode = 'preview'">显示源文件</button>
                    <button :class="['gl-seg-btn', viewMode === 'edit' ? 'active' : '']" @click="viewMode = 'edit'">编辑</button>
                  </div>
                  <span v-if="isLargeFile" class="gl-muted">文件过大，只读</span>
                  <button class="gl-btn" @click="openFileHistory">🕘 历史</button>
                  <button class="gl-btn" @click="openRemoteFileInGithub">🔗 在 GitHub 打开</button>
                  <button v-if="isDirty" class="gl-btn" @click="discardChanges">丢弃</button>
                  <button
                    v-if="viewMode === 'edit' && !isLargeFile"
                    class="gl-btn gl-btn-green"
                    :disabled="!isDirty || saving"
                    @click="saveRemoteFile"
                  >{{ saving ? '提交中...' : '保存并提交' }}</button>
                </div>
              </div>
              <div class="gl-code-card">
                <template v-if="viewMode === 'preview'">
                  <div v-if="isImage" class="image-view">
                    <img v-if="imageDataUrl" :src="imageDataUrl" :alt="currentPath" />
                    <p v-else class="image-loading">{{ imageLoading ? '图片加载中...' : '无法加载图片' }}</p>
                  </div>
                  <div v-else-if="isMarkdown" class="markdown-body gl-readme" v-html="renderedMarkdown"></div>
                  <div v-else class="gl-code-view">
                    <div class="gl-code-gutter">
                      <div v-for="n in codeLineCount" :key="n">{{ n }}</div>
                    </div>
                    <pre class="gl-code-pre"><code class="hljs" v-html="highlightedCode"></code></pre>
                  </div>
                </template>
                <textarea
                  v-else
                  v-model="editorContent"
                  class="code-editor gl-editor"
                  :readonly="isLargeFile"
                  spellcheck="false"
                ></textarea>
              </div>
            </template>

            <!-- 本地文件查看 -->
            <template v-else-if="currentLocalPath">
              <div class="gl-card gl-file-head">
                <div class="gl-file-title">
                  <button class="gl-back-inline" title="返回目录" @click="closeFileView">←</button>
                  <span class="gl-file-name">{{ currentLocalPath }}</span>
                  <span class="gl-file-size">本地</span>
                  <span class="gl-file-sha" :title="localDir">{{ localDir }}</span>
                </div>
                <div class="gl-file-actions">
                  <div class="gl-seg" v-if="!isLargeFile && !isLocalImage">
                    <button :class="['gl-seg-btn', localViewMode === 'preview' ? 'active' : '']" @click="localViewMode = 'preview'">显示源文件</button>
                    <button :class="['gl-seg-btn', localViewMode === 'edit' ? 'active' : '']" @click="localViewMode = 'edit'">编辑</button>
                  </div>
                  <button class="gl-btn" @click="openFileHistory">🕘 历史</button>
                  <button v-if="isLocalDirty && !isLocalImage" class="gl-btn" @click="localEditorContent = localOriginalContent">丢弃</button>
                  <button v-if="!isLocalImage" class="gl-btn gl-btn-green" :disabled="!isLocalDirty || localSaving" @click="saveLocalFile">
                    {{ localSaving ? '保存中...' : '保存' }}
                  </button>
                </div>
              </div>
              <div class="gl-code-card">
                <template v-if="localViewMode === 'preview'">
                  <div v-if="isLocalImage" class="image-view">
                    <img v-if="localImageDataUrl" :src="localImageDataUrl" :alt="currentLocalPath" />
                    <p v-else class="image-loading">无法加载图片</p>
                  </div>
                  <div v-else-if="isLocalMarkdown" class="markdown-body gl-readme" v-html="renderedLocalMarkdown"></div>
                  <div v-else class="gl-code-view">
                    <div class="gl-code-gutter">
                      <div v-for="n in localCodeLineCount" :key="n">{{ n }}</div>
                    </div>
                    <pre class="gl-code-pre"><code class="hljs" v-html="highlightedLocalCode"></code></pre>
                  </div>
                </template>
                <textarea v-else v-model="localEditorContent" class="code-editor gl-editor" spellcheck="false"></textarea>
              </div>
            </template>

            <!-- 目录列表 -->
            <template v-else>
              <!-- 最新提交 -->
              <div v-if="latestCommit" class="gl-latest-commit" @click="switchTab('commits')">
                <span class="gl-commit-avatar">{{ commitIcon(latestCommit) }}</span>
                <div class="gl-latest-main">
                  <div class="gl-latest-msg">
                    <b>{{ latestCommit.commit?.author?.name }}</b>
                    {{ firstLine(latestCommit.commit?.message) }}
                  </div>
                  <div class="gl-latest-sub">
                    <b>{{ latestCommit.commit?.author?.name }}</b> authored {{ relativeTime(latestCommit.commit?.author?.date) }}
                  </div>
                </div>
                <div class="gl-latest-right">
                  <span class="gl-sha">{{ (latestCommit.sha || '').slice(0, 8) }}</span>
                  <button class="gl-copy" title="复制 SHA" @click.stop="copyText(latestCommit.sha)">⧉</button>
                </div>
              </div>

              <!-- 文件表格 -->
              <div class="gl-card gl-file-table-card">
                <table class="gl-file-table">
                  <thead>
                    <tr>
                      <th class="col-name">名称</th>
                      <th class="col-commit">最后提交</th>
                      <th class="col-time">最后更新</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="treeLoading">
                      <td colspan="3" class="gl-empty"><span class="spinner"></span> 加载中...</td>
                    </tr>
                    <template v-else>
                      <tr v-if="currentDir" class="gl-row" @click="goUpDir">
                        <td class="gl-name-cell" colspan="3"><span class="gl-fico">↩</span><span class="gl-row-name">..</span></td>
                      </tr>
                      <tr v-for="item in dirItems" :key="item.path" class="gl-row" @click="onRowClick(item)">
                        <td class="gl-name-cell">
                          <span class="gl-fico">{{ item.isDir ? '📁' : fileIcon(item.name) }}</span>
                          <span class="gl-row-name">{{ item.name }}</span>
                        </td>
                        <td class="gl-commit-cell">
                          <span v-if="fileCommitOf(item.path)" class="gl-row-msg">{{ fileCommitOf(item.path).message }}</span>
                          <span v-else class="gl-muted">—</span>
                        </td>
                        <td class="gl-time-cell">
                          {{ fileCommitOf(item.path) ? relativeTime(fileCommitOf(item.path).date) : '—' }}
                        </td>
                      </tr>
                      <tr v-if="!dirItems.length">
                        <td colspan="3" class="gl-empty">此目录为空</td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <div v-if="!currentDir && readmeContent" class="gl-card">
                <div class="gl-card-head"><span class="gl-card-title">README</span></div>
                <div class="markdown-body gl-readme" v-html="renderedReadme"></div>
              </div>
            </template>
          </section>

          <!-- ============ 本地改动 ============ -->
          <section v-else-if="activeTab === 'changes'" class="gl-content changes-workspace">
            <!-- 顶部工具栏：分支切换 / 同步状态 / 拉取推送 -->
            <div class="changes-toolbar">
              <BranchDropdown v-model="selectedBranch" :branches="branchOptions" variant="light" @change="onBranchChange" />
              <span v-if="behindCount !== null && behindCount > 0" class="changes-sync-chip behind" title="落后远端提交数">↓ {{ behindCount }}</span>
              <span v-if="aheadCount !== null && aheadCount > 0" class="changes-sync-chip ahead" title="领先远端提交数">↑ {{ aheadCount }}</span>
              <span class="changes-spacer"></span>
              <button class="gl-btn" :disabled="fetchingLocal" @click="doLocalFetch" title="只下载远端最新信息，不修改工作区文件">{{ fetchingLocal ? '获取中...' : '🔍 获取' }}</button>
              <button class="gl-btn" :disabled="pullingLocal" @click="doLocalPull" title="下载并合并远端到当前分支（会更新工作区，执行前确认）">{{ pullingLocal ? '拉取中...' : '⬇ 拉取' }}</button>
              <button class="gl-btn gl-btn-primary" :disabled="pushingLocal || aheadCount === 0" @click="doLocalPush" title="确认待推送提交后再推送">{{ pushingLocal ? '推送中...' : '⬆ 推送' }}</button>
              <button class="gl-btn" @click="refreshGitStatus">🔄 刷新</button>
              <button class="gl-btn" @click="showCreateBranch = true">➕ 分支</button>
            </div>

            <div v-if="!gitAvailable" class="gl-alert">未检测到 Git 仓库或系统未安装 Git，无法展示本地改动。</div>

            <div class="changes-body">
              <!-- 左：文件列表（分组 + 勾选暂存） -->
              <div class="changes-file-list">
                <template v-if="!hasLocalChanges">
                  <div class="changes-empty">工作区干净，没有本地改动 🎉</div>
                </template>
                <template v-else>
                  <!-- 已暂存 -->
                  <div v-if="stagedFiles.length" class="change-group staged-group">
                    <div class="group-header">
                      <span class="group-title">✅ 已暂存 ({{ stagedFiles.length }})</span>
                      <span class="group-submit-hint">待提交</span>
                    </div>
                    <div
                      v-for="f in stagedFiles"
                      :key="'cs-' + f.path"
                      class="change-item staged"
                      :class="{ selected: selectedChangePath === f.path }"
                      @click="selectChange(f)"
                    >
                      <input type="checkbox" class="change-check" :checked="true" @click.stop @change="unstageFile(f)" />
                      <span class="change-badge st-staged">{{ stagedStatusIcon(f) }}</span>
                      <span class="change-path">{{ f.path }}</span>
                      <span class="change-actions">
                        <span class="mini-btn action-unstage" title="取消暂存 (git reset HEAD)" @click.stop="unstageFile(f)">⬅</span>
                      </span>
                    </div>
                  </div>

                  <!-- 未暂存（已修改） -->
                  <div v-if="unstagedFiles.length" class="change-group unstaged-group">
                    <div class="group-header">
                      <span class="group-title">📝 已修改 ({{ unstagedFiles.length }})</span>
                      <button class="group-add-all" @click="stageAllFiles(unstagedFiles)">+ 全部暂存</button>
                    </div>
                    <div
                      v-for="f in unstagedFiles"
                      :key="'cw-' + f.path"
                      class="change-item unstaged"
                      :class="{ selected: selectedChangePath === f.path }"
                      @click="selectChange(f)"
                    >
                      <input type="checkbox" class="change-check" :checked="false" @click.stop @change="stageFile(f)" />
                      <span class="change-badge st-unstaged">{{ unstagedStatusIcon(f) }}</span>
                      <span class="change-path">{{ f.path }}</span>
                      <span class="change-actions">
                        <span class="mini-btn action-stage" title="暂存 (git add)" @click.stop="stageFile(f)">+</span>
                        <span class="change-revert" title="撤销改动" @click.stop="discardGitChange(f)">↩</span>
                      </span>
                    </div>
                  </div>

                  <!-- 未跟踪 -->
                  <div v-if="untrackedFiles.length" class="change-group untracked-group">
                    <div class="group-header">
                      <span class="group-title">❓ 未追踪 ({{ untrackedFiles.length }})</span>
                      <button class="group-add-all" @click="stageAllFiles(untrackedFiles)">+ 全部暂存</button>
                    </div>
                    <div
                      v-for="f in untrackedFiles"
                      :key="'cu-' + f.path"
                      class="change-item untracked"
                      :class="{ selected: selectedChangePath === f.path }"
                      @click="selectChange(f)"
                    >
                      <input type="checkbox" class="change-check" :checked="false" @click.stop @change="stageFile(f)" />
                      <span class="change-badge st-untracked">?</span>
                      <span class="change-path">{{ f.path }}</span>
                      <span class="change-actions">
                        <span class="mini-btn action-stage" title="暂存 (git add)" @click.stop="stageFile(f)">+</span>
                      </span>
                    </div>
                  </div>
                </template>
              </div>

              <!-- 右：内联 diff（复用 side-by-side 渲染） -->
              <div class="changes-diff-pane">
                <template v-if="!selectedChangePath">
                  <div class="changes-diff-empty">选择左侧文件查看差异</div>
                </template>
                <template v-else>
                  <div class="changes-diff-head">
                    <span class="mono changes-diff-path">{{ diffPath }}</span>
                    <span class="changes-diff-mode">
                      {{ diffMode === 'staged' ? '已暂存' : diffMode === 'unstaged' ? '已修改' : '未追踪' }}
                    </span>
                    <span v-if="!diffLoading && !diffError" class="diff-sbs-stats">
                      <span class="stat-add">+{{ diffMeta.added }}</span>
                      <span class="stat-del">-{{ diffMeta.removed }}</span>
                    </span>
                  </div>
                  <div v-if="diffLoading" class="panel-loading"><span class="spinner"></span> 加载 diff...</div>
                  <div v-else-if="diffError" class="diff-error">⚠️ {{ diffError }}</div>
                  <div v-else class="diff-sbs-container changes-sbs">
                    <div class="sbs-col sbs-left">
                      <div class="sbs-col-header">HEAD ({{ diffMeta.oldLines }}行)</div>
                      <div class="sbs-lines">
                        <div v-for="(row, idx) in diffRows" :key="'CL' + idx" class="sbs-row" :class="row.leftClass">
                          <span class="sbs-line-num">{{ row.leftLine || '·' }}</span>
                          <pre class="sbs-line" :class="row.leftClass">{{ row.leftText }}</pre>
                        </div>
                      </div>
                    </div>
                    <div class="sbs-col sbs-right">
                      <div class="sbs-col-header">当前 ({{ diffMeta.newLines }}行)</div>
                      <div class="sbs-lines">
                        <div v-for="(row, idx) in diffRows" :key="'CR' + idx" class="sbs-row" :class="row.rightClass">
                          <span class="sbs-line-num">{{ row.rightLine || '·' }}</span>
                          <pre class="sbs-line" :class="row.rightClass">{{ row.rightText }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- 底部：提交表单 -->
            <div class="commit-box">
              <input
                v-model="commitSubject"
                class="commit-subject"
                type="text"
                placeholder="摘要（必填）—— 概括本次改动"
                @keyup.enter="doLocalCommit"
              />
              <textarea
                v-model="commitBody"
                class="commit-body"
                rows="3"
                placeholder="描述（可选）—— 补充改动原因与细节"
              ></textarea>
              <div class="commit-box-row">
                <span class="commit-count">已暂存 <b>{{ stagedFiles.length }}</b> 个文件</span>
                <button class="mini-btn" @click="generateSuggestedCommit">✨ 自动生成</button>
                <span class="commit-spacer"></span>
                <button
                  class="btn-primary"
                  :disabled="committing || !stagedFiles.length || !(commitSubject || '').trim()"
                  @click="doLocalCommit"
                >{{ committing ? '提交中...' : '✅ 提交到 ' + selectedBranch }}</button>
              </div>
              <div v-if="commitResult" class="commit-result">{{ commitResult }}</div>
              <div v-if="pushLocalLog" class="push-log"><pre>{{ pushLocalLog }}</pre></div>
            </div>
          </section>

          <!-- ============ 提交 ============ -->
          <section v-else-if="activeTab === 'commits'" class="gl-content">
            <!-- 提交详情 -->
            <template v-if="commitDetail">
              <button class="gl-btn gl-back-btn" @click="commitDetail = null">← 返回提交列表</button>
              <div class="gl-card gl-detail-card">
                <div class="gl-detail-head">
                  <span class="gl-commit-avatar">{{ commitIcon(commitDetail) }}</span>
                  <div class="gl-detail-meta">
                    <div class="gl-detail-title">
                      提交 {{ (commitDetail.sha || '').slice(0, 8) }}
                      <span class="gl-muted">authored {{ relativeTime(commitDetail.commit?.author?.date) }}</span>
                    </div>
                    <div class="gl-muted gl-small">作者: {{ commitDetail.commit?.author?.name }} &lt;{{ commitDetail.commit?.author?.email }}&gt;</div>
                  </div>
                  <div class="gl-detail-actions">
                    <span class="gl-sha">{{ (commitDetail.sha || '').slice(0, 8) }}</span>
                    <button class="gl-btn" @click="browseCommitTree(commitDetail)">浏览文件</button>
                    <button class="gl-btn" @click="openCommitOnGithub(commitDetail)">在 GitHub 打开</button>
                  </div>
                </div>
                <h2 class="gl-detail-msg">{{ commitDetail.commit?.message }}</h2>
                <div class="gl-parent-pill" v-if="commitDetail.parents?.length">
                  上级 {{ (commitDetail.parents[0].sha || '').slice(0, 8) }}
                </div>
              </div>

              <div v-if="commitFilesLoading" class="gl-loading"><span class="spinner"></span> 加载 diff...</div>
              <div v-else-if="commitFilesError" class="gl-alert danger">⚠️ {{ commitFilesError }}</div>
              <template v-else>
                <div class="gl-diff-summary" v-if="commitFiles.length">
                  <span>正在显示 {{ commitFiles.length }} 个修改的文件 · 包含</span>
                  <span class="stat-add">{{ detailAdded }} 行增加</span>
                  <span>和</span>
                  <span class="stat-del">{{ detailRemoved }} 行删除</span>
                  <div class="gl-view-toggle">
                    <button :class="{ active: commitDiffMode === 'inline' }" @click="commitDiffMode = 'inline'">内联</button>
                    <button :class="{ active: commitDiffMode === 'side' }" @click="commitDiffMode = 'side'">并排</button>
                  </div>
                </div>
                <div v-else class="gl-empty">此提交没有文件变更信息</div>

                <div v-for="f in commitFiles" :key="f.filename" class="gl-card gl-file-diff">
                  <div class="gl-file-diff-head">
                    <span class="gl-fico">📄</span>
                    <span class="gl-file-diff-name">{{ f.filename }}</span>
                    <span class="gl-diff-stat">
                      <span class="stat-add">+{{ f.added }}</span>
                      <span class="stat-del">-{{ f.removed }}</span>
                    </span>
                    <button class="gl-btn gl-btn-sm" @click="openBlobAt(f.filename, commitDetail.sha)">
                      浏览文件 @ {{ (commitDetail.sha || '').slice(0, 8) }}
                    </button>
                  </div>
                  <div v-if="!f.patch" class="gl-muted gl-pad">二进制文件或 diff 过大，无法显示</div>
                  <div v-else-if="commitDiffMode === 'side'" class="diff-sbs-container gl-sbs">
                    <div class="sbs-col sbs-left">
                      <div class="sbs-col-header">旧版本</div>
                      <div class="sbs-lines">
                        <div v-for="(row, idx) in f.rows" :key="'L' + idx" class="sbs-row" :class="row.leftClass">
                          <span class="sbs-line-num">{{ row.leftLine || '·' }}</span>
                          <pre class="sbs-line" :class="row.leftClass">{{ row.leftText }}</pre>
                        </div>
                      </div>
                    </div>
                    <div class="sbs-col sbs-right">
                      <div class="sbs-col-header">新版本</div>
                      <div class="sbs-lines">
                        <div v-for="(row, idx) in f.rows" :key="'R' + idx" class="sbs-row" :class="row.rightClass">
                          <span class="sbs-line-num">{{ row.rightLine || '·' }}</span>
                          <pre class="sbs-line" :class="row.rightClass">{{ row.rightText }}</pre>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else class="gl-inline-diff">
                    <div v-for="(row, idx) in inlineRowsOf(f.rows)" :key="idx" class="gl-inline-row" :class="'il-' + row.type">
                      <span class="gl-inline-ln">{{ row.l || '' }}</span>
                      <span class="gl-inline-ln">{{ row.r || '' }}</span>
                      <span class="gl-inline-sign">{{ row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' ' }}</span>
                      <pre class="gl-inline-code">{{ row.text }}</pre>
                    </div>
                  </div>
                </div>
              </template>
            </template>

            <!-- 提交列表 -->
            <template v-else>
              <div v-if="commitsLoading" class="gl-loading"><span class="spinner"></span> 加载提交记录...</div>
              <div v-else-if="!filteredCommits.length" class="gl-empty-card">暂无提交记录</div>
              <div v-else class="gl-commit-groups">
                <div v-for="g in groupedCommits" :key="g.key" class="gl-commit-group">
                  <div class="gl-group-head">
                    <span class="gl-group-date">{{ g.label }}</span>
                    <span class="gl-group-count">{{ g.items.length }} 次提交</span>
                  </div>
                  <div v-for="c in g.items" :key="c.sha" class="gl-commit-row" @click="openCommitDetail(c)">
                    <span class="gl-commit-ico" :title="c.parents?.length > 1 ? '合并提交' : '提交'">{{ commitIcon(c) }}</span>
                    <div class="gl-commit-main">
                      <div class="gl-commit-msg">{{ firstLine(c.commit?.message) }}</div>
                      <div class="gl-commit-sub">
                        <b>{{ c.commit?.author?.name || c.author?.login }}</b> authored {{ relativeTime(c.commit?.author?.date) }}
                      </div>
                    </div>
                    <div class="gl-commit-right">
                      <span class="gl-sha">{{ (c.sha || '').slice(0, 7) }}</span>
                      <button class="gl-btn gl-btn-sm" @click.stop="browseCommitTree(c)">📄 浏览文件</button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </section>

          <!-- ============ 分支 ============ -->
          <section v-else-if="activeTab === 'branches'" class="gl-content">
            <div v-if="branchesLoading" class="gl-loading"><span class="spinner"></span> 加载分支...</div>
            <div v-else-if="!branches.length" class="gl-empty-card">暂无分支</div>
            <div v-else class="gl-card gl-plain-card">
              <div v-for="b in branches" :key="b.name" class="gl-branch-row" :class="{ active: b.name === selectedBranch }">
                <div class="gl-branch-info">
                  <span class="gl-branch-ico">🌿</span>
                  <span class="gl-branch-name">{{ b.name }}</span>
                  <span v-if="b.name === selectedBranch" class="gl-pill">当前</span>
                </div>
                <div class="gl-branch-actions">
                  <button class="gl-btn gl-btn-sm" :disabled="b.name === selectedBranch" @click="switchToBranch(b.name)">切换</button>
                  <button
                    v-if="!isLocalRepo && canManageRemote"
                    class="gl-btn gl-btn-sm danger"
                    :disabled="b.name === selectedBranch || branches.length <= 1"
                    @click="deleteBranchByName(b.name)"
                  >删除</button>
                </div>
              </div>
              <div v-if="isLocalRepo" class="gl-tip">
                本地仓库分支列表取自远程 <code>origin</code>，可在这里切换查看。
                <button class="gl-link" v-if="canManageRemote" @click="showCreateBranch = true">➕ 新建远程分支</button>
              </div>
            </div>
          </section>

          <!-- ============ 标签 ============ -->
          <section v-else-if="activeTab === 'tags'" class="gl-content">
            <div v-if="tagsLoading" class="gl-loading"><span class="spinner"></span> 加载标签...</div>
            <div v-else-if="!filteredTags.length" class="gl-empty-card">暂无标签</div>
            <div v-else class="gl-tag-list">
              <div v-for="t in filteredTags" :key="t.name" class="gl-tag-row clickable" @click="openTagDetail(t)">
                <span class="gl-tag-ico">🏷️</span>
                <div class="gl-tag-main">
                  <div class="gl-tag-name">{{ t.name }}</div>
                  <div class="gl-tag-sub">
                    <span class="gl-tag-dot">o-</span>
                    <span class="mono">{{ (t.commit?.sha || '').slice(0, 8) }}</span>
                  </div>
                </div>
                <div class="gl-tag-actions">
                  <button class="gl-icon-act" title="复制 SHA" @click.stop="copyText(t.commit?.sha)">⧉</button>
                  <button v-if="canManageContent" class="gl-icon-act danger" title="删除标签" @click.stop="deleteTag(t)">🗑</button>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 发布（Releases） ============ -->
          <section v-else-if="activeTab === 'releases'" class="gl-content">
            <div v-if="releasesLoading" class="gl-loading"><span class="spinner"></span> 加载发布...</div>
            <div v-else-if="!releases.length" class="gl-empty-card">暂无发布</div>
            <div v-else class="gl-tag-list">
              <div v-for="r in releases" :key="r.id" class="gl-tag-row clickable" @click="openReleaseDetail(r)">
                <span class="gl-tag-ico">🚀</span>
                <div class="gl-tag-main">
                  <div class="gl-release-title">
                    <span class="gl-tag-name">{{ r.name || r.tag_name }}</span>
                    <span v-if="r.draft" class="gl-badge">草稿</span>
                    <span v-else-if="r.prerelease" class="gl-badge warn">预发布</span>
                  </div>
                  <div class="gl-tag-sub">
                    <span class="gl-tag-dot">🏷️</span>
                    <span class="mono">{{ r.tag_name }}</span>
                    <template v-if="r.published_at"> · {{ formatDate(r.published_at) }}发布</template>
                  </div>
                  <div v-if="releaseSummary(r.body)" class="gl-release-body">{{ releaseSummary(r.body) }}</div>
                </div>
                <div class="gl-tag-actions">
                  <button class="gl-icon-act" title="在 GitHub 打开" @click.stop="openReleasePage(r)">🔗</button>
                  <button v-if="canManageContent" class="gl-icon-act danger" title="删除发布" @click.stop="deleteRelease(r)">🗑</button>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 贡献者 ============ -->
          <section v-else-if="activeTab === 'contributors'" class="gl-content">
            <div v-if="contributorsLoading" class="gl-loading"><span class="spinner"></span> 加载贡献者...</div>
            <div v-else-if="!contributors.length" class="gl-empty-card">暂无贡献者数据</div>
            <div v-else class="gl-card gl-plain-card">
              <div v-for="u in contributors" :key="u.id || u.login" class="gl-contributor-row">
                <img v-if="u.avatar_url" :src="u.avatar_url" class="gl-contributor-avatar" />
                <span v-else class="gl-contributor-avatar">{{ (u.login || '?').slice(0, 1).toUpperCase() }}</span>
                <span class="gl-contributor-name">{{ u.login }}</span>
                <span class="gl-contributor-count">{{ u.contributions }} 次提交</span>
              </div>
            </div>
          </section>

          <!-- ============ 活动 ============ -->
          <section v-else-if="activeTab === 'activity'" class="gl-content">
            <div v-if="activityLoading" class="gl-loading"><span class="spinner"></span> 加载活动...</div>
            <div v-else-if="!activity.length" class="gl-empty-card">暂无活动记录</div>
            <div v-else class="gl-card gl-plain-card">
              <div
                v-for="e in activity"
                :key="e.id"
                class="gl-activity-row"
                :class="{ clickable: canViewActivityDetail(e) }"
                @click="canViewActivityDetail(e) && openActivityDetail(e)"
              >
                <span class="gl-activity-type">{{ eventIcon(e.type) }}</span>
                <div class="gl-activity-main">
                  <div class="gl-activity-title">{{ eventTitle(e) }}</div>
                  <div class="gl-activity-time">{{ relativeTime(e.created_at) }}</div>
                </div>
              </div>
            </div>
          </section>

          <!-- ============ 占位页 ============ -->
          <section v-else class="gl-content">
            <div class="gl-card gl-placeholder">
              <div class="gl-ph-icon">{{ pageIcon }}</div>
              <h3>{{ pageTitle }}</h3>
              <p class="gl-muted">该功能暂未实现，后续版本会逐步对齐 GitLab。</p>
              <button
                v-if="['issues', 'merges', 'wiki', 'snippets', 'ci', 'settings', 'network', 'graphs'].includes(activeTab)"
                class="gl-btn"
                @click="openGithubPage(activeTab)"
              >🔗 在 GitHub 打开</button>
            </div>
          </section>
        </div>
      </main>
    </div>

    <!-- ========== 各类弹窗 ========== -->

    <!-- 查找文件 -->
    <div v-if="showFileFinder" class="modal-mask" @click.self="showFileFinder = false">
      <div class="modal gl-finder-modal">
        <h3>🔍 查找文件</h3>
        <input v-model="fileQuery" class="gl-finder-input" placeholder="输入文件名或路径进行过滤…" autofocus />
        <div class="gl-finder-list">
          <div
            v-for="f in fileQueryResults"
            :key="f.path"
            class="gl-finder-item"
            @click="jumpToFile(f)"
          ><span class="gl-fico">{{ fileIcon(f.name) }}</span>{{ f.path }}</div>
          <div v-if="!fileQueryResults.length" class="gl-empty">
            {{ fileQuery.trim() ? '无匹配文件' : '输入关键字开始查找' }}
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showFileFinder = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 关联远程仓库 -->
    <div v-if="showLinkPanel" class="modal-mask" @click.self="showLinkPanel = false">
      <div class="modal">
        <h3>🔗 关联 GitHub 远程仓库</h3>
        <p class="modal-desc">
          本地目录本身不带远程地址。填写它对应的 GitHub 仓库后，才能<b>拉取</b>和<b>推送</b>；<br>
          提交仍然是把编辑内容保存到本地磁盘。
        </p>
        <div class="pull-form">
          <label>远程仓库（owner/repo）</label>
          <input
            v-model="linkRepoInput"
            list="link-repo-options"
            placeholder="从下拉选择，或直接输入，例如 octocat/Hello-World"
            @change="onLinkRepoPicked"
          />
          <datalist id="link-repo-options">
            <option v-for="r in linkRepoOptions" :key="r.full_name" :value="r.full_name"></option>
          </datalist>
          <p v-if="linkRepoLoading" class="modal-tip">正在读取你的仓库列表...</p>
          <p v-else-if="linkRepoOptions.length" class="modal-tip">可从下拉选择（共 {{ linkRepoOptions.length }} 个），也可直接手动输入。</p>
          <p v-else class="modal-tip">未读取到仓库列表，可直接手动输入。</p>
          <label>默认分支</label>
          <input v-model="linkBranchInput" placeholder="main" />
          <p class="modal-tip">需要该 Token 拥有此仓库的 <code>Contents: Read and write</code> 权限。</p>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showLinkPanel = false">取消</button>
          <button class="btn-primary" @click="linkRemote">保存关联</button>
        </div>
      </div>
    </div>

    <!-- 拉取向导 -->
    <div v-if="showPullPanel" class="modal-mask" @click.self="showPullPanel = false">
      <div class="modal">
        <h3>⬇ 下载并初始化本地仓库</h3>
        <p class="modal-desc">下载该分支的 zip 快照并解压，随后自动初始化 Git 仓库、关联远程分支，并加入「本地仓库」列表。<br>选择目标目录：</p>
        <div class="pull-form">
          <label>远程仓库</label>
          <div class="static-line">{{ repo.owner?.login }}/{{ repo.name }} @ {{ selectedBranch }}</div>
          <label>目标目录</label>
          <div class="dir-picker">
            <input :value="pullTargetDir || '(请选择)'" readonly />
            <button class="btn-browse" @click="choosePullDir">浏览...</button>
          </div>
          <p v-if="pullTargetDir" class="pull-preview">将解压到：<code>{{ pullTargetDir }}</code></p>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showPullPanel = false">取消</button>
          <button class="btn-primary" :disabled="!pullTargetDir || pulling" @click="doPull">
            {{ pulling ? '下载中...' : '开始下载' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 文件历史 -->
    <div v-if="showFileHistory" class="modal-mask" @click.self="showFileHistory = false">
      <div class="modal file-history-modal">
        <h3>🕘 文件历史</h3>
        <p class="modal-desc"><code>{{ fileHistoryTarget }}</code></p>
        <div class="fh-list">
          <div v-if="fileHistoryLoading" class="fh-empty"><span class="spinner"></span> 加载中...</div>
          <div v-else-if="!fileHistoryItems.length" class="fh-empty">该文件暂无提交历史</div>
          <div v-for="c in fileHistoryItems" :key="c.sha" class="fh-item">
            <span class="fh-sha">{{ c.sha.slice(0, 7) }}</span>
            <div class="fh-main">
              <div class="fh-msg">{{ c.message }}</div>
              <div class="fh-sub">{{ c.author }} · {{ relativeTime(c.date) }}</div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showFileHistory = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 推送面板 -->
    <div v-if="showPushPanel" class="modal-mask" @click.self="showPushPanel = false">
      <div class="modal push-modal">
        <h3>🚀 提交并推送到远程</h3>
        <p class="modal-desc">
          检测到 <strong>{{ pendingFiles.length }}</strong> 个已暂存文件，
          勾选需要推送的并填写提交信息。
        </p>

        <div v-if="headInfo" class="head-info">
          <span class="hi-label">🔗 基于:</span>
          <span class="hi-sha mono">{{ headInfo.sha.slice(0, 7) }}</span>
          <span class="hi-msg">{{ headInfo.message }}</span>
        </div>

        <div class="commit-form">
          <div class="cf-row">
            <input
              v-model="commitSubject"
              class="commit-subject"
              placeholder="简短描述这次改动（必填）"
              maxlength="72"
              @keydown.ctrl.enter="doPush"
            />
            <span class="cf-counter">{{ (commitSubject || '').length }}/72</span>
          </div>
          <textarea
            v-model="commitBody"
            class="commit-body"
            placeholder="详细说明（可选）\n- 为什么做这个改动？\n- 怎么实现的？\n- 影响哪些模块？"
            rows="5"
          ></textarea>
          <button class="btn-suggest" @click="generateSuggestedCommit">✨ 自动生成建议信息</button>
        </div>

        <div class="changed-files">
          <div class="cf-header">
            <label class="cf-select-all">
              <input type="checkbox" :checked="pushFiles.length === pendingFiles.length" @change="toggleSelectAll($event)" />
              全选
            </label>
            <span class="cf-summary">已选 <strong>{{ pushFiles.length }}</strong> / {{ pendingFiles.length }}</span>
          </div>
          <div
            v-for="f in pendingFiles"
            :key="f.path"
            class="changed-item"
            :class="{ selected: pushFiles.includes(f.path) }"
          >
            <label class="ci-main">
              <input type="checkbox" :value="f.path" v-model="pushFiles" />
              <span class="ci-status" :class="'ci-st-' + (f.status || f.changeType)">{{ f.status || f.changeType }}</span>
              <span class="ci-path">{{ f.path }}</span>
            </label>
            <button
              class="ci-diff"
              title="查看这个文件的 Diff"
              :disabled="f.status === 'D' || f.changeType === 'D'"
              @click="openDiffForFileInPush(f.path)"
            >📋 Diff</button>
          </div>
          <div v-if="!pendingFiles.length" class="empty-tip">无已暂存文件 — 先把改动加入暂存区</div>
        </div>

        <div v-if="pushError" class="push-error">⚠️ {{ pushError }}</div>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showPushPanel = false">取消</button>
          <button
            class="btn-primary"
            :disabled="pushFiles.length === 0 || !(commitSubject || '').trim() || pushing"
            @click="doPush"
          >
            {{ pushing ? '推送中...' : `🚀 推送到 origin/${selectedBranch} (${pushFiles.length})` }}
          </button>
        </div>

        <div v-if="pushLog" class="push-log"><pre>{{ pushLog }}</pre></div>
      </div>
    </div>

    <!-- Diff 弹窗（WebStorm 风格 side-by-side） -->
    <div v-if="diffShow" class="modal-mask" @click.self="diffShow = false">
      <div class="modal large diff-sbs-modal">
        <h3 class="diff-sbs-title">
          📝 Side-by-Side Diff: <span class="mono">{{ diffPath }}</span>
          <span class="diff-sbs-mode">
            {{ diffMode === 'staged' ? '已暂存' : diffMode === 'unstaged' ? '已修改' : '未追踪' }}
          </span>
          <span class="diff-sbs-stats">
            <span class="stat-add">+{{ diffMeta.added }}</span>
            <span class="stat-del">-{{ diffMeta.removed }}</span>
          </span>
        </h3>
        <div v-if="diffLoading" class="panel-loading"><span class="spinner"></span> 加载 diff...</div>
        <div v-else-if="diffError" class="diff-error">⚠️ {{ diffError }}</div>
        <div v-else class="diff-sbs-container">
          <div class="sbs-col sbs-left">
            <div class="sbs-col-header">HEAD ({{ diffMeta.oldLines }}行)</div>
            <div class="sbs-lines">
              <div
                v-for="(row, idx) in diffRows"
                :key="'L' + idx"
                class="sbs-row"
                :class="row.leftClass"
              >
                <span class="sbs-line-num">{{ row.leftLine || '·' }}</span>
                <pre class="sbs-line" :class="row.leftClass">{{ row.leftText }}</pre>
              </div>
            </div>
          </div>
          <div class="sbs-col sbs-right">
            <div class="sbs-col-header">当前 ({{ diffMeta.newLines }}行)</div>
            <div class="sbs-lines">
              <div
                v-for="(row, idx) in diffRows"
                :key="'R' + idx"
                class="sbs-row"
                :class="row.rightClass"
              >
                <span class="sbs-line-num">{{ row.rightLine || '·' }}</span>
                <pre class="sbs-line" :class="row.rightClass">{{ row.rightText }}</pre>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="diffShow = false">关闭</button>
          <button class="btn-secondary" @click="openLocalFile(diffPath); diffShow = false">打开文件</button>
          <button class="btn-primary" v-if="diffMode !== 'untracked'" @click="diffShow = false; openPushPanel()">🚀 去推送</button>
          <button class="btn-primary" v-else @click="diffShow = false; stageFile({ path: diffPath })">✅ 暂存这个文件</button>
        </div>
      </div>
    </div>

    <!-- 新建分支 -->
    <div v-if="showCreateBranch" class="modal-mask" @click.self="showCreateBranch = false">
      <div class="modal small">
        <h3>➕ 新建分支</h3>
        <label>新分支名</label>
        <input v-model="newBranchName" placeholder="feature/my-branch" />
        <label>基于</label>
        <select v-model="sourceBranch">
          <option v-for="b in branches" :key="b.name" :value="b.name">{{ b.name }}</option>
        </select>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreateBranch = false">取消</button>
          <button class="btn-primary" :disabled="!newBranchName.trim() || creating" @click="createBranch">
            {{ creating ? '创建中...' : '创建并切换' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除分支 -->
    <div v-if="showDeleteBranch" class="modal-mask" @click.self="showDeleteBranch = false">
      <div class="modal small">
        <h3>🗑️ 删除分支 {{ selectedBranch }}</h3>
        <p class="modal-desc">此操作不可恢复。确认删除远程分支 <code>{{ selectedBranch }}</code>？</p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showDeleteBranch = false">取消</button>
          <button class="btn-danger" :disabled="deleting" @click="deleteBranch">
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 拉取更新（类似 WebStorm Update Project） -->
    <div v-if="showPullDialog" class="modal-mask" @click.self="showPullDialog = false">
      <div class="modal pull-update-modal">
        <h3>🔄 拉取更新</h3>
        <p class="modal-desc">
          分支 <code>{{ selectedBranch }}</code>
          <template v-if="behindCount !== null"> · 落后远端 {{ behindCount }} 个提交</template>
          <template v-if="aheadCount"> · 领先远端 {{ aheadCount }} 个提交</template>
        </p>

        <label class="pull-option">
          <input v-model="pullStrategy" type="radio" value="merge" />
          <span>
            <b>合并传入的改动到当前分支</b>
            <em>保留分叉历史，生成一个合并提交（git pull）</em>
          </span>
        </label>
        <label class="pull-option">
          <input v-model="pullStrategy" type="radio" value="rebase" />
          <span>
            <b>把当前分支变基到传入改动之上</b>
            <em>历史保持线性，会重写本地未推送提交（git pull --rebase）</em>
          </span>
        </label>

        <p v-if="hasLocalChanges" class="pull-warn">
          ⚠️ 当前有 {{ gitChanges.length }} 个未提交改动；若与远端修改同一文件，可能产生冲突需手动解决。
        </p>
        <p class="modal-desc">不会丢弃未提交改动，也不会删除本地提交。</p>

        <label class="pull-dontask">
          <input v-model="pullDontAsk" type="checkbox" />
          不再询问（记住本次选择）
        </label>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showPullDialog = false">取消</button>
          <button class="btn-primary" :disabled="pullingLocal" @click="confirmLocalPull">
            {{ pullingLocal ? '拉取中...' : '确定' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 提交确认 -->
    <div v-if="showCommitDialog" class="modal-mask" @click.self="showCommitDialog = false">
      <div class="modal small">
        <h3>✅ 确认提交</h3>
        <p class="modal-desc">
          将向分支 <code>{{ selectedBranch }}</code> 提交 <b>{{ stagedFiles.length }}</b> 个已暂存文件。
        </p>
        <div class="commit-confirm-subject">{{ commitSubject }}</div>
        <pre v-if="commitBody" class="commit-confirm-body">{{ commitBody }}</pre>
        <div class="commit-confirm-files">
          <div v-for="f in stagedFiles" :key="'cf-' + f.path" class="commit-confirm-file">
            <span class="change-badge st-staged">{{ stagedStatusIcon(f) }}</span>
            <span class="change-path">{{ f.path }}</span>
          </div>
        </div>
        <p class="modal-desc">提交后可用顶部「⬆ 推送」同步到远端。</p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCommitDialog = false">再看看</button>
          <button class="btn-primary" :disabled="committing" @click="confirmLocalCommit">
            {{ committing ? '提交中...' : '确认提交' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 推送确认：列出待推送提交（类似 WebStorm Push Commits） -->
    <div v-if="showPushDialog" class="modal-mask" @click.self="showPushDialog = false">
      <div class="modal push-dialog">
        <h3>⬆ 推送提交到 {{ selectedBranch }}</h3>
        <div class="push-branch-line">
          <code>{{ selectedBranch }}</code>
          <span class="push-arrow">→</span>
          <code>origin : {{ selectedBranch }}</code>
          <span v-if="!unpushedHasUpstream" class="push-new-tag">新分支</span>
        </div>

        <div v-if="unpushedLoading" class="panel-loading"><span class="spinner"></span> 读取待推送提交...</div>
        <div v-else-if="unpushedError" class="diff-error">⚠️ {{ unpushedError }}</div>
        <div v-else-if="!unpushedCommits.length" class="push-empty">没有待推送的提交</div>
        <div v-else class="push-commit-list">
          <div v-for="c in unpushedCommits" :key="c.sha" class="push-commit-row">
            <span class="push-commit-sha">{{ (c.sha || '').slice(0, 7) }}</span>
            <div class="push-commit-main">
              <div class="push-commit-subject">{{ c.subject }}</div>
              <div class="push-commit-meta">{{ c.author }} · {{ relativeTime(c.date) }}</div>
            </div>
          </div>
        </div>

        <p class="modal-desc">
          共 <b>{{ unpushedCommits.length }}</b> 个提交待推送<template v-if="!unpushedHasUpstream">（远端尚无该分支，将新建并推送）</template>。
        </p>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showPushDialog = false">取消</button>
          <button
            class="btn-primary"
            :disabled="pushingLocal || unpushedLoading || !unpushedCommits.length"
            @click="confirmLocalPush"
          >{{ pushingLocal ? '推送中...' : '推送 (' + unpushedCommits.length + ')' }}</button>
        </div>
      </div>
    </div>

    <!-- 新建标签 -->
    <div v-if="showCreateTag" class="modal-mask" @click.self="showCreateTag = false">
      <div class="modal small">
        <h3>🏷️ 新建标签</h3>
        <p class="modal-desc">标签会创建在所选分支的最新提交上。</p>
        <label>标签名</label>
        <input v-model="newTagName" placeholder="例如 v1.0.0" />
        <label>基于分支</label>
        <select v-model="newTagRef">
          <option v-for="b in branches" :key="b.name" :value="b.name">{{ b.name }}</option>
        </select>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreateTag = false">取消</button>
          <button class="btn-primary" :disabled="!newTagName.trim() || creatingTag" @click="createTag">
            {{ creatingTag ? '创建中...' : '创建标签' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 新建发布 -->
    <div v-if="showCreateRelease" class="modal-mask" @click.self="showCreateRelease = false">
      <div class="modal">
        <h3>🚀 新建发布</h3>
        <p class="modal-desc">基于标签创建 Release；若标签不存在，GitHub 会在默认分支的最新提交上自动创建。</p>
        <label>标签名</label>
        <input v-model="newReleaseTag" placeholder="例如 v1.0.0" />
        <label>发布标题（可选）</label>
        <input v-model="newReleaseName" placeholder="默认与标签名相同" />
        <label>发布说明（可选，支持 Markdown）</label>
        <textarea v-model="newReleaseBody" rows="6" placeholder="本次更新内容..."></textarea>
        <label class="modal-check"><input type="checkbox" v-model="newReleasePre" /> 标记为预发布</label>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreateRelease = false">取消</button>
          <button class="btn-primary" :disabled="!newReleaseTag.trim() || creatingRelease" @click="createRelease">
            {{ creatingRelease ? '发布中...' : '创建发布' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 合并分支 -->
    <div v-if="showMerge" class="modal-mask" @click.self="showMerge = false">
      <div class="modal small">
        <h3>🔀 合并分支</h3>
        <p class="modal-desc">将指定分支合并到当前分支 <code>{{ selectedBranch }}</code></p>
        <label>源分支</label>
        <select v-model="mergeSource">
          <option v-for="b in branches.filter(x => x.name !== selectedBranch)" :key="b.name" :value="b.name">{{ b.name }}</option>
        </select>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showMerge = false">取消</button>
          <button class="btn-primary" :disabled="!mergeSource || merging" @click="doMerge">
            {{ merging ? '合并中...' : '开始合并' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 标签 / 发布 / 活动详情 -->
    <div v-if="detailItem" class="modal-mask" @click.self="detailItem = null">
      <div class="modal detail-modal">
        <!-- 发布详情 -->
        <template v-if="detailItem.kind === 'release'">
          <h3>🚀 {{ detailItem.data.name || detailItem.data.tag_name }}</h3>
          <div class="detail-meta">
            <span>🏷️ <span class="mono">{{ detailItem.data.tag_name }}</span></span>
            <span v-if="detailItem.data.draft" class="gl-badge">草稿</span>
            <span v-else-if="detailItem.data.prerelease" class="gl-badge warn">预发布</span>
            <span v-if="detailItem.data.published_at">发布于 {{ formatDateTime(detailItem.data.published_at) }}</span>
            <span v-if="detailItem.data.author?.login">作者 {{ detailItem.data.author.login }}</span>
          </div>
          <div v-if="detailItem.data.body" class="markdown-body detail-markdown" v-html="detailReleaseHtml"></div>
          <p v-else class="modal-desc">该发布没有填写说明。</p>
          <div v-if="detailItem.data.assets?.length" class="detail-assets">
            <div class="detail-section-title">附件（{{ detailItem.data.assets.length }}）</div>
            <div v-for="a in detailItem.data.assets" :key="a.id" class="detail-asset">
              <span class="detail-asset-name">{{ a.name }}</span>
              <span class="detail-asset-size">{{ releaseAssetSize(a.size) }} · {{ a.download_count }} 次下载</span>
              <button
                class="detail-asset-download"
                :disabled="downloadingAsset === a.id"
                @click="downloadReleaseAsset(a)"
              >{{ downloadingAsset === a.id ? '下载中...' : '⬇ 下载' }}</button>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" @click="detailItem = null">关闭</button>
            <button class="btn-primary" @click="openReleasePage(detailItem.data)">在 GitHub 打开</button>
          </div>
        </template>

        <!-- 标签详情 -->
        <template v-else-if="detailItem.kind === 'tag'">
          <h3>🏷️ {{ detailItem.data.name }}</h3>
          <div class="detail-meta">
            <span>目标提交</span>
            <span class="mono detail-break">{{ detailItem.data.commit?.sha || '—' }}</span>
            <span v-if="detailItem.data.commit?.sha" class="gl-badge">短 SHA {{ detailItem.data.commit.sha.slice(0, 8) }}</span>
          </div>
          <div v-if="detailItem.data.commit?.url" class="detail-meta">
            <span class="detail-break">{{ detailItem.data.commit.url }}</span>
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" @click="detailItem = null">关闭</button>
            <button class="btn-secondary" @click="copyText(detailItem.data.commit?.sha)">复制 SHA</button>
            <button class="btn-primary" @click="openTagOnGithub(detailItem.data)">在 GitHub 打开</button>
          </div>
        </template>

        <!-- 活动详情 -->
        <template v-else>
          <h3>{{ eventIcon(detailItem.data.type) }} {{ eventTitle(detailItem.data) }}</h3>
          <div class="detail-meta">
            <span>事件类型 <span class="mono">{{ detailItem.data.type }}</span></span>
            <span v-if="detailItem.data.actor?.login">操作人 {{ detailItem.data.actor.login }}</span>
            <span v-if="detailItem.data.created_at">{{ formatDateTime(detailItem.data.created_at) }}</span>
            <span v-if="detailItem.data.payload?.ref">分支 <span class="mono">{{ detailItem.data.payload.ref }}</span></span>
          </div>
          <div v-if="detailItem.data.payload?.pull_request" class="detail-meta">
            <span>
              PR #{{ detailItem.data.payload.pull_request.number }}
              {{ detailItem.data.payload.pull_request.title }}
            </span>
            <span v-if="detailItem.data.payload.pull_request.merged" class="gl-badge">已合并</span>
            <span v-if="detailItem.data.payload.pull_request.merged_at">
              合并于 {{ formatDateTime(detailItem.data.payload.pull_request.merged_at) }}
            </span>
            <span v-if="detailItem.data.payload.pull_request.merge_commit_sha" class="mono">
              合并提交 {{ detailItem.data.payload.pull_request.merge_commit_sha.slice(0, 8) }}
            </span>
          </div>
          <div v-if="activityCommits(detailItem.data).length" class="detail-assets">
            <div class="detail-section-title">提交（{{ activityCommits(detailItem.data).length }}）</div>
            <div v-for="c in activityCommits(detailItem.data)" :key="c.sha" class="detail-commit-row">
              <span class="mono">{{ (c.sha || '').slice(0, 8) }}</span>
              <span class="detail-commit-msg">{{ String(c.message || '').split('\n')[0] }}</span>
              <span v-if="c.author?.name" class="detail-commit-author">{{ c.author.name }}</span>
            </div>
          </div>
          <p v-else-if="!detailItem.data.payload?.pull_request" class="modal-desc">该活动没有提交明细。</p>
          <div class="modal-actions">
            <button class="btn-primary" @click="detailItem = null">关闭</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import {
  listBranches, getRepo, getTree, getFile, createOrUpdateFile,
  deleteFile, getContents, listCommits, getUserRepos
} from '../api/github.js'
import BranchDropdown from '../components/BranchDropdown.vue'

const props = defineProps({
  repo: { type: Object, required: true }
})
const emit = defineEmits(['back'])

// ========== 本地仓库 / 远程关联状态 ==========
const isLocalRepo = computed(() => !!props.repo?._isLocal)
const isRemoteLinked = computed(() =>
  isLocalRepo.value && !!props.repo?.full_name && !String(props.repo.full_name).startsWith('local/')
)

// ========== base64 编解码（渲染进程无 Node Buffer，用浏览器 API） ==========
function b64ToUtf8 (b64) {
  const clean = (b64 || '').replace(/\s/g, '')
  const bin = atob(clean)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function utf8ToB64 (text) {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

// ========== 全局状态 ==========
const branches = ref([])
const branchesLoading = ref(false)
const selectedBranch = ref('main')
const treeData = ref([])             // 扁平 list
const treeRoot = ref({ path: '', type: 'tree', name: '', children: [] })
const treeLoading = ref(false)
const currentPath = ref('')
const expandedDirs = ref(new Set())  // 记录哪些目录当前展开

const selectedFile = ref(null)
const editorContent = ref('')
const originalContent = ref('')
const isDirty = ref(false)
const saving = ref(false)
const viewMode = ref('preview')

const readmeContent = ref('')
const pulling = ref(false)
const refreshing = ref(false)
const localDir = ref('')
const localFiles = ref([])
const currentLocalPath = ref('')
const localEditorContent = ref('')
const localOriginalContent = ref('')
const isLocalDirty = computed(() => localEditorContent.value !== localOriginalContent.value)
const localSaving = ref(false)
const localDirtyFiles = ref([])
const localViewMode = ref('preview')

// ===== 本地 Git 改动检测（WebStorm 风格）=====
const gitChanges = ref([])
const gitAvailable = ref(true)
const gitError = ref('')

// 三组拆分
const stagedFiles = computed(() => gitChanges.value.filter(f => f.staged))
const unstagedFiles = computed(() => gitChanges.value.filter(f => !f.staged && f.unstaged))
const untrackedFiles = computed(() => gitChanges.value.filter(f => f.untracked))

// 状态图标（从 indexStatus / worktreeStatus 取真实字符）
function stagedStatusIcon (f) {
  const s = f.indexStatus
  if (s === 'A') return 'A'
  if (s === 'D') return 'D'
  if (s === 'R') return 'R'
  if (s === 'M') return 'M'
  return s || '+'
}
function unstagedStatusIcon (f) {
  const s = f.worktreeStatus
  if (s === 'M') return 'M'
  if (s === 'D') return 'D'
  if (s === 'A') return 'A'
  return s || '~'
}

// 暂存一个文件
async function stageFile (f) {
  const res = await window.electronAPI.gitAdd(localDir.value, f.path)
  if (!res.ok) { alert('暂存失败: ' + res.message); return }
  await refreshGitStatus()
}

// 取消暂存（git reset HEAD）
async function unstageFile (f) {
  const res = await window.electronAPI.gitResetPath(localDir.value, f.path)
  if (!res.ok) { alert('取消暂存失败: ' + res.message); return }
  await refreshGitStatus()
}

// 批量暂存
async function stageAllFiles (list) {
  for (const f of list) {
    await window.electronAPI.gitAdd(localDir.value, f.path)
  }
  await refreshGitStatus()
}

// 待推送文件：Git 可用时仅取 staged 的，否则退回应用内编辑记录
const pendingFiles = computed(() => {
  if (isLocalRepo.value && gitAvailable.value) {
    return stagedFiles.value.map(f => {
      // 用 indexStatus 作为 changeType（A/D/M）
      const t = f.indexStatus === 'A' ? 'A' : f.indexStatus === 'D' ? 'D' : 'M'
      return { path: f.path, changeType: t, status: t }
    })
  }
  return localDirtyFiles.value
})
const pendingCount = computed(() => pendingFiles.value.length)

// 文件历史
const showFileHistory = ref(false)
const fileHistoryLoading = ref(false)
const fileHistoryItems = ref([])
const fileHistoryTarget = ref('')

async function openFileHistory () {
  const path = isLocalRepo.value ? currentLocalPath.value : currentPath.value
  if (!path) return
  fileHistoryTarget.value = path
  fileHistoryItems.value = []
  showFileHistory.value = true
  fileHistoryLoading.value = true
  try {
    if (isLocalRepo.value && localDir.value) {
      const res = await window.electronAPI.gitLog(localDir.value, { file: path, count: 50 })
      fileHistoryItems.value = (res.items || []).map(c => ({
        sha: c.sha,
        message: c.subject || c.message,
        author: c.author,
        date: c.date
      }))
    } else {
      const login = props.repo.owner?.login || (props.repo.full_name || '').split('/')[0]
      const list = await listCommits(login, props.repo.name, path, selectedBranch.value, 50)
      fileHistoryItems.value = (Array.isArray(list) ? list : []).map(c => ({
        sha: c.sha,
        message: (c.commit?.message || '').split('\n')[0],
        author: c.commit?.author?.name,
        date: c.commit?.author?.date
      }))
    }
  } catch {
    fileHistoryItems.value = []
  } finally {
    fileHistoryLoading.value = false
  }
}

const showPullPanel = ref(false)
const pullTargetDir = ref('')

// ===== 关联远程仓库（本地仓库）=====
const showLinkPanel = ref(false)
const linkRepoInput = ref('')
const linkBranchInput = ref('main')
const linkRepoOptions = ref([])
const linkRepoLoading = ref(false)

async function loadLinkRepoOptions () {
  if (linkRepoOptions.value.length || linkRepoLoading.value) return
  linkRepoLoading.value = true
  try {
    const list = await getUserRepos(1, 100)
    linkRepoOptions.value = (Array.isArray(list) ? list : [])
      .filter(r => r && r.full_name)
      .map(r => ({ full_name: r.full_name, default_branch: r.default_branch || 'main' }))
  } catch {
    linkRepoOptions.value = []
  } finally {
    linkRepoLoading.value = false
  }
}

// 选中下拉项时，自动带出该仓库的默认分支
function onLinkRepoPicked () {
  const hit = linkRepoOptions.value.find(r => r.full_name === (linkRepoInput.value || '').trim())
  if (hit && hit.default_branch) linkBranchInput.value = hit.default_branch
}

function openLinkPanel () {
  linkRepoInput.value = isRemoteLinked.value ? props.repo.full_name : ''
  linkBranchInput.value = selectedBranch.value || 'main'
  showLinkPanel.value = true
  loadLinkRepoOptions()
}

async function linkRemote () {
  const raw = (linkRepoInput.value || '').trim()
  const m = raw.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (!m) { alert('请填写 owner/repo 格式，例如 octocat/Hello-World'); return }
  await applyRemote(m[1], m[2], (linkBranchInput.value || 'main').trim())
  showLinkPanel.value = false
  await loadBranches()
  await refreshGitStatus()
}

// 写入远程信息并持久化（手动关联 / 从 git remote 自动识别共用）
async function applyRemote (owner, name, branch) {
  props.repo.owner = { login: owner }
  props.repo.name = name
  props.repo.full_name = `${owner}/${name}`
  if (branch) selectedBranch.value = branch
  try {
    const cfg = await window.electronAPI.getConfig()
    const list = cfg.repositories || []
    const idx = list.findIndex(r => r.id === props.repo.id)
    if (idx >= 0) {
      list[idx] = { ...list[idx], owner: { login: owner }, name, full_name: `${owner}/${name}` }
      await window.electronAPI.setConfig('repositories', list)
    }
  } catch { /* 忽略持久化失败 */ }
}

// 扫描本地工作区改动（git status），并自动识别 origin
async function refreshGitStatus () {
  if (!isLocalRepo.value || !localDir.value) return
  try {
    const res = await window.electronAPI.gitStatus(localDir.value)
    if (!res || !res.ok) {
      gitAvailable.value = false
      gitError.value = res?.message || 'git status 执行失败'
      gitChanges.value = []
      aheadCount.value = null
      behindCount.value = null
      localBranches.value = []
      return
    }
    gitAvailable.value = true
    gitError.value = ''
    gitChanges.value = res.files || []
    aheadCount.value = typeof res.ahead === 'number' ? res.ahead : null
    behindCount.value = typeof res.behind === 'number' ? res.behind : null
    localBranches.value = res.branches || []
    const curBr = (res.branches || []).find(b => b.current)
    if (curBr) selectedBranch.value = curBr.name

    // 从 .git/config 自动识别 GitHub 远程，无需手动填写
    if (res.remoteUrl && !isRemoteLinked.value) {
      const m = res.remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i)
      if (m) {
        await applyRemote(m[1], m[2], res.branch && res.branch !== 'HEAD' ? res.branch : 'main')
        await loadBranches()
      }
    } else if (res.branch && res.branch !== 'HEAD') {
      selectedBranch.value = res.branch
    }
  } catch (e) {
    gitAvailable.value = false
    gitError.value = e.message
    aheadCount.value = null
    behindCount.value = null
    localBranches.value = []
  }
}

async function discardGitChange (file) {
  if (!window.confirm(`撤销对「${file.path}」的本地改动？`)) return
  const res = await window.electronAPI.gitRestore(localDir.value, file.path)
  if (!res.ok) { alert('撤销失败: ' + res.message); return }
  await refreshGitStatus()
  await loadLocalRepoTree()
}
const showPushPanel = ref(false)
const commitSubject = ref('')
const commitBody = ref('')
const pushFiles = ref([])
const pushing = ref(false)
const pushLog = ref('')
const headInfo = ref(null)   // { sha, message, author, date }
const pushError = ref('')
const selectedFileForDiff = ref('')   // 推送面板中点击"查看 diff"的文件

// ===== 本地改动工作区（changes tab）=====
const aheadCount = ref(null)          // 领先远端提交数（null = 无跟踪分支）
const behindCount = ref(null)         // 落后远端提交数
const localBranches = ref([])         // [{ name, current, upstream }]
const selectedChangePath = ref('')    // 右侧内联 diff 当前选中文件

// 分支下拉数据：本地仓库用真实分支信息，远程仓库退回 branches 列表
const branchOptions = computed(() => {
  const src = localBranches.value.length
    ? localBranches.value
    : branches.value.map(b => ({ name: b.name }))
  return src.map(b => ({ name: b.name, current: !!b.current, upstream: b.upstream || '' }))
})
const committing = ref(false)
const commitResult = ref('')
const pushingLocal = ref(false)
const pushLocalLog = ref('')
const pushLocalError = ref('')
const pullingLocal = ref(false)
const fetchingLocal = ref(false)
// 拉取策略（类似 WebStorm Update Project）：merge = 合并，rebase = 变基
const showPullDialog = ref(false)
const pullStrategy = ref(localStorage.getItem('ghd-pull-strategy') || 'merge')
const pullDontAsk = ref(localStorage.getItem('ghd-pull-skip-dialog') === '1')
// 提交确认弹窗
const showCommitDialog = ref(false)
// 推送确认弹窗（列出待推送提交）
const showPushDialog = ref(false)
const unpushedCommits = ref([])
const unpushedLoading = ref(false)
const unpushedError = ref('')
const unpushedHasUpstream = ref(true)

function openPushPanel () {
  commitSubject.value = ''
  commitBody.value = ''
  pushError.value = ''
  pushLog.value = ''
  selectedFileForDiff.value = ''
  pushFiles.value = pendingFiles.value.map(f => f.path)

  // 如果有本地 git，用 HEAD commit 作为推荐 base
  if (isLocalRepo.value && gitAvailable.value && localDir.value) {
    window.electronAPI.gitHeadInfo(localDir.value).then(res => {
      if (res?.ok) headInfo.value = res
      else headInfo.value = null
    }).catch(() => { headInfo.value = null })
  } else {
    headInfo.value = null
  }

  showPushPanel.value = true
}

function generateSuggestedCommit () {
  if (!pendingFiles.value.length) { commitSubject.value = ''; return }
  const stat = { M: 0, A: 0, D: 0 }
  pendingFiles.value.forEach(f => { const t = f.changeType || f.status; if (t) stat[t] = (stat[t] || 0) + 1 })
  const types = []
  if (stat.M) types.push(`${stat.M} 个修改`)
  if (stat.A) types.push(`${stat.A} 个新增`)
  if (stat.D) types.push(`${stat.D} 个删除`)
  commitSubject.value = `更新 ${pendingFiles.value.length} 个文件 (${types.join(', ')})`
}

// 拼装完整 commit message
function fullCommitMessage () {
  const s = (commitSubject.value || '').trim()
  const b = (commitBody.value || '').trim()
  if (b) return `${s}\n\n${b}`
  return s
}

// ===== 本地真实 Git 提交 / 推送 / 拉取（改动工作区）=====
// 点击「提交」：先校验并弹出确认弹窗
function doLocalCommit () {
  const msg = fullCommitMessage()
  if (!msg.trim()) { commitResult.value = '⚠️ 请填写提交摘要'; return }
  if (!stagedFiles.value.length) { commitResult.value = '⚠️ 请先暂存至少一个文件'; return }
  commitResult.value = ''
  showCommitDialog.value = true
}

async function confirmLocalCommit () {
  showCommitDialog.value = false
  committing.value = true
  try {
    const res = await window.electronAPI.gitCommit(localDir.value, fullCommitMessage())
    if (!res.ok) {
      commitResult.value = res.nothingToCommit
        ? '⚠️ 没有可提交的改动（请先暂存文件）'
        : ('⚠️ ' + (res.message || '提交失败'))
      return
    }
    const short = res.sha ? res.sha.slice(0, 7) : ''
    commitSubject.value = ''
    commitBody.value = ''
    commitResult.value = `✅ 已提交${short ? ' ' + short : ''}`
    selectedChangePath.value = ''
    await refreshGitStatus()
    await fetchCommits()
    await loadContent()
  } catch (e) {
    commitResult.value = '⚠️ 提交失败: ' + e.message
  } finally {
    committing.value = false
  }
}

// 点击「推送」：先拉取待推送提交清单并弹窗确认（类似 WebStorm Push Commits）
async function doLocalPush () {
  showPushDialog.value = true
  unpushedLoading.value = true
  unpushedError.value = ''
  unpushedCommits.value = []
  try {
    const res = await window.electronAPI.gitUnpushed(localDir.value, selectedBranch.value)
    if (!res.ok) { unpushedError.value = res.message || '获取待推送提交失败'; return }
    unpushedHasUpstream.value = !!res.hasUpstream
    unpushedCommits.value = res.items || []
  } catch (e) {
    unpushedError.value = e.message
  } finally {
    unpushedLoading.value = false
  }
}

async function confirmLocalPush () {
  showPushDialog.value = false
  pushingLocal.value = true
  pushLocalLog.value = ''
  pushLocalError.value = ''
  try {
    const res = await window.electronAPI.gitPush(localDir.value, selectedBranch.value)
    if (!res.ok) {
      pushLocalError.value = res.message || '推送失败'
      pushLocalLog.value += '❌ ' + pushLocalError.value + '\n'
      return
    }
    pushLocalLog.value += '✅ 推送成功\n' + (res.output || '')
  } catch (e) {
    pushLocalError.value = e.message
    pushLocalLog.value += '❌ ' + e.message + '\n'
  } finally {
    pushingLocal.value = false
    await refreshGitStatus()
  }
}

// 「获取」：只下载远端最新信息，不修改工作区文件（可通过 ↓ 徽标查看落后数量，安全）
async function doLocalFetch () {
  fetchingLocal.value = true
  pushLocalLog.value = ''
  pushLocalError.value = ''
  try {
    const res = await window.electronAPI.gitFetch(localDir.value)
    if (!res.ok) {
      pushLocalError.value = res.message || '获取失败'
      pushLocalLog.value += '❌ ' + pushLocalError.value + '\n'
      return
    }
    await refreshGitStatus()
    pushLocalLog.value += (behindCount.value && behindCount.value > 0)
      ? `ℹ️ 获取完成：远端领先 ${behindCount.value} 个提交（未修改任何本地文件）\n`
      : '✅ 获取完成：本地已是最新（未修改任何本地文件）\n'
  } catch (e) {
    pushLocalError.value = e.message
    pushLocalLog.value += '❌ ' + e.message + '\n'
  } finally {
    fetchingLocal.value = false
  }
}

// 点击「拉取」：默认弹出策略选择（merge / rebase），勾选"不再询问"后直接按记忆策略执行
function doLocalPull () {
  if (pullDontAsk.value) { runLocalPull(); return }
  showPullDialog.value = true
}

async function confirmLocalPull () {
  localStorage.setItem('ghd-pull-strategy', pullStrategy.value)
  localStorage.setItem('ghd-pull-skip-dialog', pullDontAsk.value ? '1' : '0')
  showPullDialog.value = false
  await runLocalPull()
}

async function runLocalPull () {
  const rebase = pullStrategy.value === 'rebase'
  pullingLocal.value = true
  pushLocalLog.value = ''
  pushLocalError.value = ''
  try {
    const res = await window.electronAPI.gitPull(localDir.value, selectedBranch.value, rebase)
    if (!res.ok) {
      pushLocalError.value = res.message || '拉取失败'
      pushLocalLog.value += '❌ ' + pushLocalError.value + '\n'
      return
    }
    pushLocalLog.value += `✅ 拉取成功（${rebase ? '变基 rebase' : '合并 merge'}）\n` + (res.output || '')
    await loadContent()
  } catch (e) {
    pushLocalError.value = e.message
    pushLocalLog.value += '❌ ' + e.message + '\n'
  } finally {
    pullingLocal.value = false
    await refreshGitStatus()
  }
}

// 推送面板中打开某个文件的 diff（复用现有 showDiff）
function openDiffForFileInPush (path) {
  const f = pendingFiles.value.find(x => x.path === path)
  if (f) {
    selectedFileForDiff.value = path
    showDiff(f)
  }
}

// 全选/取消全选
function toggleSelectAll (e) {
  pushFiles.value = e.target.checked
    ? pendingFiles.value.map(f => f.path)
    : []
}

const showBranchPanel = ref(false)
const showCreateBranch = ref(false)
const showDeleteBranch = ref(false)
const showTags = ref(false)
const showCommits = ref(false)
const showMerge = ref(false)

const newBranchName = ref('')
const sourceBranch = ref('main')
const creating = ref(false)
const deleting = ref(false)
const mergeSource = ref('')
const merging = ref(false)

// ===== 右侧 TAB =====
const activeTab = ref('files')
const commits = ref([])
const commitsLoading = ref(false)
const tags = ref([])
const tagsLoading = ref(false)
const activity = ref([])
const activityLoading = ref(false)

function tabLabel (t) {
  return { files: '📁 文件', branches: '🌿 分支', commits: '📜 提交', tags: '🏷️ 标签', releases: '🚀 发布', activity: '⚡ 活动' }[t] || t
}

watch(activeTab, async (t) => {
  if (t === 'branches') await loadBranches()
  else if (t === 'commits') await fetchCommits()
  else if (t === 'tags') await fetchTags()
  else if (t === 'releases') await fetchReleases()
  else if (t === 'activity') await fetchActivity()
  else if (t === 'contributors') await fetchContributors()
  else if (t === 'files') loadDirFileCommits()
  else if (t === 'changes') { await refreshGitStatus(); selectedChangePath.value = '' }
})

// ===== GitLab 风格界面 =====
const sidebarCollapsed = ref(false)
const currentDir = ref('')
const showFileFinder = ref(false)
const fileQuery = ref('')
const commitFilter = ref('')
const tagFilter = ref('')
const contributors = ref([])
const contributorsLoading = ref(false)
const showCreateTag = ref(false)
const newTagName = ref('')
const newTagRef = ref('')
const creatingTag = ref(false)
const releases = ref([])
const releasesLoading = ref(false)
const showCreateRelease = ref(false)
const newReleaseTag = ref('')
const newReleaseName = ref('')
const newReleaseBody = ref('')
const newReleasePre = ref(false)
const creatingRelease = ref(false)
const commitDetail = ref(null)
const commitFiles = ref([])
const commitFilesLoading = ref(false)
const commitFilesError = ref('')
const commitDiffMode = ref('side')
const fileCommits = ref({})
let dirCommitToken = 0

const repoOwner = () => props.repo.owner?.login || props.repo.full_name?.split('/')[0] || ''
const canUseApi = computed(() => {
  if (!repoOwner() || !props.repo.name) return false
  if (isLocalRepo.value && !isRemoteLinked.value) return false
  return true
})
const projectInitial = computed(() => String(props.repo.name || 'P').slice(0, 1).toUpperCase())

// ========== 仓库管理权限 ==========
// 仅对仓库有 push / maintain / admin 权限时才允许管理发布、标签与分支
const repoPermissions = ref(null)
const canManageRemote = computed(() => {
  const p = repoPermissions.value || props.repo?.permissions
  return !!(p && (p.admin || p.maintain || p.push))
})
// 标签 / 发布均为远程资源，需同时具备 API 可用性与权限
const canManageContent = computed(() => canUseApi.value && canManageRemote.value)
// 本地仓库的分支操作走本地 git，不受远程权限限制
const canManageBranches = computed(() => isLocalRepo.value || canManageRemote.value)

async function loadRepoPermissions () {
  if (!canUseApi.value) return
  try {
    const data = await getRepo(repoOwner(), props.repo.name)
    if (data?.permissions) repoPermissions.value = data.permissions
  } catch { /* 探测失败时回退到列表数据中的 permissions */ }
}
const latestCommit = computed(() => commits.value[0] || null)
const hasLocalChanges = computed(() =>
  !!(stagedFiles.value.length || unstagedFiles.value.length || untrackedFiles.value.length)
)
const showToolbar = computed(() =>
  ['files', 'commits', 'branches', 'tags', 'releases', 'contributors'].includes(activeTab.value)
)
const currentDirPart = computed(() => currentDir.value)
const pageTitle = computed(() => ({
  files: '存储库', commits: '提交', branches: '分支', tags: '标签', contributors: '贡献者', releases: '发布',
  network: '分支图', compare: '比较', graphs: '统计图', issues: '问题', merges: '合并请求',
  ci: 'CI/CD', wiki: '维基', snippets: '代码片段', settings: '设置', activity: '活动'
}[activeTab.value] || ''))
const pageIcon = computed(() => ({
  network: '🔀', compare: '⚖️', graphs: '📊', issues: '🐛', merges: '🔀',
  ci: '⚙️', wiki: '📖', snippets: '✂️', settings: '🛠️'
}[activeTab.value] || '📄'))

const repoNavItems = computed(() => [
  { key: 'files', icon: '📄', label: '文件' },
  { key: 'commits', icon: '🕘', label: '提交' },
  { key: 'branches', icon: '🌿', label: '分支' },
  { key: 'tags', icon: '🏷️', label: '标签' },
  { key: 'releases', icon: '🚀', label: '发布' },
  { key: 'contributors', icon: '👥', label: '贡献者' }
])
const otherNavItems = computed(() => [
  { key: 'activity', icon: '⚡', label: '活动' }
])

// 当前目录下的条目
const dirItems = computed(() => {
  const prefix = currentDir.value ? currentDir.value + '/' : ''
  const out = []
  for (const t of treeData.value) {
    if (!t.path.startsWith(prefix)) continue
    const rest = t.path.slice(prefix.length)
    if (!rest || rest.includes('/')) continue
    out.push({ path: t.path, name: rest, isDir: t.type === 'tree', size: t.size || 0, sha: t.sha })
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, 'zh-CN') : a.isDir ? -1 : 1))
  return out
})

const fileQueryResults = computed(() => {
  const q = fileQuery.value.trim().toLowerCase()
  if (!q) return []
  return treeData.value
    .filter(t => t.type === 'blob' && t.path.toLowerCase().includes(q))
    .slice(0, 60)
    .map(t => ({ path: t.path, name: t.path.split('/').pop(), sha: t.sha, size: t.size || 0 }))
})

function switchTab (t) {
  activeTab.value = t
  if (t !== 'commits') commitDetail.value = null
  if (t === 'files') {
    selectedFile.value = null
    currentLocalPath.value = ''
    currentDir.value = ''
    showFileFinder.value = false
  }
}

function onRowClick (item) {
  if (item.isDir) {
    currentDir.value = item.path
    showFileFinder.value = false
    return
  }
  if (isLocalRepo.value) { openLocalFile(item.path); return }
  currentPath.value = item.path
  openRemoteFile(item)
}

function goUpDir () {
  currentDir.value = currentDir.value.includes('/')
    ? currentDir.value.slice(0, currentDir.value.lastIndexOf('/'))
    : ''
}

function jumpToFile (f) {
  const idx = f.path.lastIndexOf('/')
  currentDir.value = idx === -1 ? '' : f.path.slice(0, idx)
  showFileFinder.value = false
  if (isLocalRepo.value) openLocalFile(f.path)
  else { currentPath.value = f.path; openRemoteFile(f) }
}

function closeFileView () {
  selectedFile.value = null
  currentLocalPath.value = ''
}

async function onBranchChange () {
  // 本地仓库：执行真实 git switch，失败则回滚选择
  if (isLocalRepo.value && localDir.value) {
    const ok = await switchLocalBranch(selectedBranch.value)
    if (!ok) {
      const cur = localBranches.value.find(b => b.current)
      if (cur) selectedBranch.value = cur.name
      return
    }
    return
  }
  currentDir.value = ''
  selectedFile.value = null
  currentLocalPath.value = ''
  commitDetail.value = null
  fileCommits.value = {}
  await loadContent()
  await fetchCommits()
}

// 本地仓库真实切换分支（git switch），成功后刷新所有数据
async function switchLocalBranch (name) {
  const res = await window.electronAPI.gitSwitchBranch(localDir.value, name)
  if (!res.ok) { alert('切换分支失败: ' + (res.message || '')); return false }
  selectedBranch.value = name
  currentDir.value = ''
  selectedFile.value = null
  currentLocalPath.value = ''
  commitDetail.value = null
  selectedChangePath.value = ''
  await refreshGitStatus()
  await loadBranches()
  await loadContent()
  await fetchCommits()
  return true
}

// 本地仓库新建并切换分支（git checkout -b）
async function createLocalBranch () {
  const name = newBranchName.value.trim()
  if (!name) return
  creating.value = true
  try {
    const from = sourceBranch.value || undefined
    const res = await window.electronAPI.gitCreateBranch(localDir.value, name, from)
    if (!res.ok) { alert('创建分支失败: ' + (res.message || '')); return }
    selectedBranch.value = name
    await refreshGitStatus()
    await loadBranches()
    await loadContent()
    showCreateBranch.value = false
    newBranchName.value = ''
  } finally { creating.value = false }
}

// 本地仓库删除分支（git branch -d，未合并则询问是否 -D）
async function deleteLocalBranch () {
  if (localBranches.value.length <= 1) { alert('至少保留一个分支'); return }
  const target = selectedBranch.value
  deleting.value = true
  try {
    let res = await window.electronAPI.gitDeleteBranch(localDir.value, target, false)
    if (!res.ok) {
      if (!confirm(`分支「${target}」包含未合并提交，是否强制删除？`)) return
      res = await window.electronAPI.gitDeleteBranch(localDir.value, target, true)
      if (!res.ok) { alert('删除失败: ' + (res.message || '')); return }
    }
    showDeleteBranch.value = false
    await refreshGitStatus()
    await loadBranches()
    const first = localBranches.value.find(b => b.name !== target)
    if (first) {
      selectedBranch.value = first.name
      await loadContent()
    }
  } finally { deleting.value = false }
}

// ===== 相对时间（中文）=====
function relativeTime (iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const sec = Math.max(0, (Date.now() - t) / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `约 ${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 星期前`
  if (days < 365) return `${Math.floor(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}

function firstLine (msg) {
  return String(msg || '').split('\n')[0]
}

function commitIcon (c) {
  return (c?.parents && c.parents.length > 1) ? '⤳' : '●'
}

// ===== 每个文件的最后提交（按目录懒加载）=====
function fileCommitOf (path) {
  return fileCommits.value[`${selectedBranch.value}:${path}`] || null
}

async function loadDirFileCommits () {
  const token = ++dirCommitToken
  if (!canUseApi.value) return
  const owner = repoOwner()
  const prefix = `${selectedBranch.value}:`
  const targets = dirItems.value
    .filter(i => !i.isDir && !fileCommits.value[prefix + i.path])
    .slice(0, 40)
  for (let i = 0; i < targets.length; i += 5) {
    if (token !== dirCommitToken) return
    await Promise.all(targets.slice(i, i + 5).map(async (it) => {
      try {
        const res = await window.electronAPI.apiRequest({
          method: 'GET',
          path: `/repos/${owner}/${props.repo.name}/commits?sha=${encodeURIComponent(selectedBranch.value)}&path=${encodeURIComponent(it.path)}&per_page=1`
        })
        const c = Array.isArray(res) ? res[0] : null
        if (c && token === dirCommitToken) {
          fileCommits.value[prefix + it.path] = {
            message: firstLine(c.commit?.message),
            author: c.commit?.author?.name || c.author?.login || '',
            date: c.commit?.author?.date || c.commit?.committer?.date || ''
          }
        }
      } catch { /* 单文件失败忽略 */ }
    }))
  }
}

// ===== 提交详情 =====
const detailAdded = computed(() => commitFiles.value.reduce((s, f) => s + (f.added || 0), 0))
const detailRemoved = computed(() => commitFiles.value.reduce((s, f) => s + (f.removed || 0), 0))

async function openCommitDetail (c) {
  commitDetail.value = c
  commitFiles.value = []
  commitFilesError.value = ''
  if (!canUseApi.value) {
    commitFilesError.value = '未关联可访问的 GitHub 仓库，无法获取提交 diff'
    return
  }
  commitFilesLoading.value = true
  try {
    const res = await window.electronAPI.apiRequest({
      method: 'GET',
      path: `/repos/${repoOwner()}/${props.repo.name}/commits/${c.sha}`
    })
    commitFiles.value = (res?.files || []).map(f => {
      const parsed = sbsFromPatch(f.patch || '')
      return {
        filename: f.filename,
        patch: f.patch || '',
        rows: parsed.rows,
        added: typeof f.additions === 'number' ? f.additions : parsed.added,
        removed: typeof f.deletions === 'number' ? f.deletions : parsed.removed
      }
    })
  } catch (e) {
    commitFilesError.value = e.message || '加载提交详情失败'
  }
  commitFilesLoading.value = false
}

function inlineRowsOf (rows) {
  const out = []
  for (const r of rows || []) {
    if (r.leftClass === 'd-eq') out.push({ type: 'ctx', l: r.leftLine, r: r.rightLine, text: r.leftText })
    else if (r.leftClass === 'd-del' || r.leftClass === 'd-mod-old') out.push({ type: 'del', l: r.leftLine, text: r.leftText })
    else if (r.rightClass === 'd-add' || r.rightClass === 'd-mod-new') out.push({ type: 'add', r: r.rightLine, text: r.rightText })
  }
  return out
}

function browseCommitTree (c) {
  if (!repoOwner() || !c?.sha) return
  window.electronAPI.openExternal(`https://github.com/${repoOwner()}/${props.repo.name}/tree/${c.sha}`)
}

function openBlobAt (path, sha) {
  if (!repoOwner() || !sha) return
  window.electronAPI.openExternal(`https://github.com/${repoOwner()}/${props.repo.name}/blob/${sha}/${path}`)
}

// ===== 贡献者 / 徽章 =====
async function fetchContributors () {
  if (contributors.value.length || !canUseApi.value) return
  contributorsLoading.value = true
  try {
    const res = await window.electronAPI.apiRequest({
      method: 'GET',
      path: `/repos/${repoOwner()}/${props.repo.name}/contributors?per_page=50`
    })
    contributors.value = Array.isArray(res) ? res : []
  } catch (e) { console.error('fetchContributors', e); contributors.value = [] }
  contributorsLoading.value = false
}

// ===== 标签操作 =====
const filteredTags = computed(() => {
  const q = tagFilter.value.trim().toLowerCase()
  if (!q) return tags.value
  return tags.value.filter(t => String(t.name).toLowerCase().includes(q))
})

function openCreateTag () {
  newTagName.value = ''
  newTagRef.value = selectedBranch.value
  showCreateTag.value = true
}

async function createTag () {
  const name = newTagName.value.trim()
  if (!name || !canUseApi.value) return
  creatingTag.value = true
  try {
    const ref = await window.electronAPI.apiRequest({
      method: 'GET',
      path: `/repos/${repoOwner()}/${props.repo.name}/git/ref/heads/${encodeURIComponent(newTagRef.value || selectedBranch.value)}`
    })
    await window.electronAPI.apiRequest({
      method: 'POST',
      path: `/repos/${repoOwner()}/${props.repo.name}/git/refs`,
      body: { ref: `refs/tags/${name}`, sha: ref.object.sha }
    })
    showCreateTag.value = false
    tags.value = []
    await fetchTags()
  } catch (e) {
    alert('创建标签失败: ' + (e.message || JSON.stringify(e)))
  } finally {
    creatingTag.value = false
  }
}

async function deleteTag (t) {
  if (!window.confirm(`确认删除标签「${t.name}」？`)) return
  try {
    await window.electronAPI.apiRequest({
      method: 'DELETE',
      path: `/repos/${repoOwner()}/${props.repo.name}/git/refs/tags/${encodeURIComponent(t.name)}`
    })
    tags.value = tags.value.filter(x => x.name !== t.name)
  } catch (e) {
    alert('删除标签失败: ' + (e.message || JSON.stringify(e)))
  }
}

// ===== 发布（GitHub Releases）=====
async function fetchReleases () {
  if (!canUseApi.value) { releases.value = []; return }
  releasesLoading.value = true
  try {
    const res = await window.electronAPI.apiRequest({
      method: 'GET',
      path: `/repos/${repoOwner()}/${props.repo.name}/releases?per_page=30`
    })
    releases.value = res || []
  } catch (e) {
    console.error('fetchReleases', e)
    releases.value = []
  } finally {
    releasesLoading.value = false
  }
}

function openCreateRelease () {
  newReleaseTag.value = ''
  newReleaseName.value = ''
  newReleaseBody.value = ''
  newReleasePre.value = false
  showCreateRelease.value = true
}

async function createRelease () {
  const tag = newReleaseTag.value.trim()
  if (!tag || !canUseApi.value) return
  creatingRelease.value = true
  try {
    const created = await window.electronAPI.apiRequest({
      method: 'POST',
      path: `/repos/${repoOwner()}/${props.repo.name}/releases`,
      body: {
        tag_name: tag,
        name: newReleaseName.value.trim() || tag,
        body: newReleaseBody.value,
        draft: false,
        prerelease: newReleasePre.value
      }
    })
    releases.value = [created, ...releases.value]
    showCreateRelease.value = false
  } catch (e) {
    alert('创建发布失败: ' + (e.message || JSON.stringify(e)))
  } finally {
    creatingRelease.value = false
  }
}

async function deleteRelease (r) {
  if (!window.confirm(`确认删除发布「${r.name || r.tag_name}」？标签本身不会被删除。`)) return
  try {
    await window.electronAPI.apiRequest({
      method: 'DELETE',
      path: `/repos/${repoOwner()}/${props.repo.name}/releases/${r.id}`
    })
    releases.value = releases.value.filter(x => x.id !== r.id)
  } catch (e) {
    alert('删除发布失败: ' + (e.message || JSON.stringify(e)))
  }
}

function openReleasePage (r) {
  const url = r.html_url || `https://github.com/${repoOwner()}/${props.repo.name}/releases/tag/${encodeURIComponent(r.tag_name)}`
  window.electronAPI.openExternal(url)
}

function releaseSummary (body) {
  const line = String(body || '')
    .split('\n')
    .map(s => s.trim())
    .find(s => s && !s.startsWith('#'))
  if (!line) return ''
  return line.length > 120 ? line.slice(0, 120) + '…' : line
}

// ===== 列表详情 =====
const detailItem = ref(null)   // { kind: 'release' | 'tag' | 'activity', data }
function openReleaseDetail (r) { detailItem.value = { kind: 'release', data: r } }
function openTagDetail (t) { detailItem.value = { kind: 'tag', data: t } }
function openActivityDetail (e) { detailItem.value = { kind: 'activity', data: e } }

function tagCommitUrl (t) {
  const sha = t?.commit?.sha
  return sha ? `https://github.com/${repoOwner()}/${props.repo.name}/commit/${sha}` : ''
}

function openTagOnGithub (t) {
  const url = tagCommitUrl(t) || `https://github.com/${repoOwner()}/${props.repo.name}/tags`
  window.electronAPI.openExternal(url)
}

function activityCommits (e) {
  return Array.isArray(e?.payload?.commits) ? e.payload.commits : []
}

// 仅推送（含提交）与已合并的 PR 提供详情，其余活动不可点击
function canViewActivityDetail (e) {
  if (!e) return false
  if (e.type === 'PushEvent') return activityCommits(e).length > 0 || pushCommitCount(e) > 0
  if (e.type === 'PullRequestEvent') return e.payload?.pull_request?.merged === true
  return false
}

const downloadingAsset = ref(null)
async function downloadReleaseAsset (a) {
  if (downloadingAsset.value !== null) return
  downloadingAsset.value = a.id
  try {
    const res = await window.electronAPI.downloadReleaseAsset({ asset: a })
    if (res?.canceled) return
    if (!res?.success) {
      alert('下载附件失败: ' + (res?.message || '未知错误'))
      return
    }
    alert(`附件已保存到：${res.filePath}`)
  } catch (e) {
    alert('下载附件失败: ' + (e.message || e))
  } finally {
    downloadingAsset.value = null
  }
}

const detailReleaseHtml = computed(() => {
  if (detailItem.value?.kind !== 'release') return ''
  return marked.parse(detailItem.value.data.body || '')
})

function formatDateTime (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN')
}

function releaseAssetSize (size) {
  const n = Number(size) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

// ===== 提交分组 / 过滤 =====
const filteredCommits = computed(() => {
  const q = commitFilter.value.trim().toLowerCase()
  if (!q) return commits.value
  return commits.value.filter(c =>
    `${c.commit?.message || ''} ${c.commit?.author?.name || ''} ${(c.sha || '')}`.toLowerCase().includes(q)
  )
})

const groupedCommits = computed(() => {
  const groups = []
  const map = new Map()
  for (const c of filteredCommits.value) {
    const iso = c.commit?.author?.date || c.commit?.committer?.date
    const d = iso ? new Date(iso) : new Date()
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let g = map.get(key)
    if (!g) {
      g = { key, label: `${d.getDate()} ${d.getMonth() + 1}月, ${d.getFullYear()}`, items: [] }
      map.set(key, g)
      groups.push(g)
    }
    g.items.push(c)
  }
  return groups
})

const codeLineCount = computed(() => Math.max(1, (editorContent.value || '').split('\n').length))
const localCodeLineCount = computed(() => Math.max(1, (localEditorContent.value || '').split('\n').length))

// ===== 其它小工具 =====
function copyText (text) {
  if (!text) return
  navigator.clipboard.writeText(text).catch(() => {})
}

function openGithubPage (tab) {
  if (!repoOwner()) return
  const map = {
    issues: 'issues', merges: 'pulls', wiki: 'wiki', snippets: 'snippets',
    ci: 'actions', settings: 'settings', network: 'network', graphs: 'graphs'
  }
  const suffix = map[tab]
  if (!suffix) return
  window.electronAPI.openExternal(`https://github.com/${repoOwner()}/${props.repo.name}/${suffix}`)
}

watch(currentDir, () => { loadDirFileCommits() })

// ===== Side-by-Side Diff（WebStorm 风格）=====
const diffShow = ref(false)
const diffPath = ref('')
const diffLoading = ref(false)
const diffError = ref('')
const diffMode = ref('unstaged')   // staged / unstaged / untracked
const diffRows = ref([])           // [{ leftLine, leftText, leftClass, rightLine, rightText, rightClass }]
const diffMeta = ref({ oldLines: 0, newLines: 0, added: 0, removed: 0 })

// LCS 最长公共子序列 → 行级 diff
function computeLCS (a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  // backtrack
  const ops = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ type: 'equal', oldIdx: i - 1, newIdx: j - 1 })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ type: 'add', newIdx: j - 1 }); j--
    } else {
      ops.unshift({ type: 'del', oldIdx: i - 1 }); i--
    }
  }
  return ops
}

// 把 OLD/NEW 内容按行生成 side-by-side rows（纯函数，支持起始行号）
function makeSbsRows (oldText, newText, startOld = 1, startNew = 1) {
  const oldLines = oldText === '' ? [] : oldText.split('\n')
  const newLines = newText === '' ? [] : newText.split('\n')
  const ops = computeLCS(oldLines, newLines)

  const rows = []
  let leftLineNum = startOld - 1
  let rightLineNum = startNew - 1
  let added = 0, removed = 0

  for (const op of ops) {
    if (op.type === 'equal') {
      leftLineNum++
      rightLineNum++
      rows.push({
        leftLine: leftLineNum,
        leftText: oldLines[op.oldIdx],
        leftClass: 'd-eq',
        rightLine: rightLineNum,
        rightText: newLines[op.newIdx],
        rightClass: 'd-eq'
      })
    } else if (op.type === 'del') {
      leftLineNum++
      removed++
      rows.push({
        leftLine: leftLineNum,
        leftText: oldLines[op.oldIdx],
        leftClass: 'd-del',
        rightLine: '',
        rightText: '',
        rightClass: 'd-empty'
      })
    } else if (op.type === 'add') {
      rightLineNum++
      added++
      rows.push({
        leftLine: '',
        leftText: '',
        leftClass: 'd-empty',
        rightLine: rightLineNum,
        rightText: newLines[op.newIdx],
        rightClass: 'd-add'
      })
    }
  }

  // 把相邻的 del + add 合并为 modified
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].leftClass === 'd-del' && rows[i + 1].rightClass === 'd-add'
        && rows[i].leftText.trim() && rows[i + 1].rightText.trim()) {
      rows[i].leftClass = 'd-mod-old'
      rows[i + 1].rightClass = 'd-mod-new'
    }
  }

  return { rows, added, removed, oldLines: oldLines.length, newLines: newLines.length }
}

function buildSideBySideRows (oldText, newText) {
  const r = makeSbsRows(oldText, newText)
  diffMeta.value = { oldLines: r.oldLines, newLines: r.newLines, added: r.added, removed: r.removed }
  return r.rows
}

// 解析 GitHub commit API 返回的 unified patch → side-by-side rows
function sbsFromPatch (patch) {
  if (!patch) return { rows: [], added: 0, removed: 0 }
  const hunks = []
  let cur = null
  for (const raw of patch.split('\n')) {
    const m = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (m) {
      cur = { oldStart: Number(m[1]), newStart: Number(m[2]), entries: [] }
      hunks.push(cur)
      continue
    }
    if (!cur) continue
    if (raw.startsWith('\\')) continue          // \ No newline at end of file
    const c = raw[0]
    if (c === ' ') cur.entries.push({ t: 'ctx', s: raw.slice(1) })
    else if (c === '-') cur.entries.push({ t: 'del', s: raw.slice(1) })
    else if (c === '+') cur.entries.push({ t: 'add', s: raw.slice(1) })
  }

  const rows = []
  let added = 0, removed = 0
  for (const h of hunks) {
    const oldArr = h.entries.filter(e => e.t !== 'add').map(e => e.s)
    const newArr = h.entries.filter(e => e.t !== 'del').map(e => e.s)
    if (!oldArr.length && !newArr.length) continue
    const r = makeSbsRows(oldArr.length ? oldArr.join('\n') : '', newArr.length ? newArr.join('\n') : '', h.oldStart, h.newStart)
    rows.push(...r.rows)
    added += r.added
    removed += r.removed
  }
  return { rows, added, removed }
}

// 加载某个文件的 diff 到 diffRows（不弹窗），供内联面板与弹窗共用
async function loadDiff (file, mode) {
  diffPath.value = file.path
  diffMode.value = mode || 'unstaged'
  diffLoading.value = true
  diffError.value = ''
  diffRows.value = []

  try {
    let oldText = ''
    let newText = ''
    const st = file.indexStatus || file.status

    if (diffMode.value === 'untracked' || st === 'A' || st === 'U') {
      // 全新文件：old = 空，new = 文件内容
      const res = await window.electronAPI.gitReadUntrackedFile(localDir.value, file.path)
      newText = res?.content || ''
      oldText = ''
    } else if (diffMode.value === 'staged') {
      // 暂存区 diff：OLD = HEAD，NEW = 暂存区版本（简化：刚 git add 后工作区通常不再改，读磁盘即可）
      const headRes = await window.electronAPI.gitShowHEAD(localDir.value, file.path)
      oldText = headRes?.ok ? headRes.content : ''
      const diskRes = await window.electronAPI.readFileText(localDir.value + '/' + file.path)
      newText = diskRes || ''
    } else {
      // 工作区 diff：OLD = HEAD，NEW = 磁盘文件
      const headRes = await window.electronAPI.gitShowHEAD(localDir.value, file.path)
      oldText = headRes?.ok ? headRes.content : ''
      const diskRes = await window.electronAPI.readFileText(localDir.value + '/' + file.path)
      newText = diskRes || ''
    }

    diffRows.value = buildSideBySideRows(oldText, newText)
    if (!diffRows.value.length && !oldText && !newText) {
      diffError.value = '文件为空或无法读取'
    }
  } catch (e) {
    diffError.value = e.message || '加载失败'
  }
  diffLoading.value = false
}

async function showDiff (file, mode) {
  diffShow.value = true
  await loadDiff(file, mode)
}

// 在改动工作区中选中一个文件 → 右侧内联展示 diff
function selectChange (f) {
  selectedChangePath.value = f.path
  const mode = f.staged ? 'staged' : (f.untracked ? 'untracked' : 'unstaged')
  loadDiff(f, mode)
}

// fetchCommits / fetchTags / fetchActivity
// 把本地 git log 条目映射成 GitHub commit 结构，供 commits 面板 & 活动面板共用
function mapLocalCommit (c) {
  return {
    sha: c.sha,
    parents: (c.parents || []).map(p => ({ sha: p })),
    commit: {
      message: c.message ? `${c.subject}\n\n${c.message}` : c.subject,
      author: { name: c.author, email: c.email, date: c.date }
    },
    author: { login: c.author }
  }
}

async function fetchCommits (force = false) {
  if (!force && commits.value.length && !isLocalRepo) return
  commitsLoading.value = true
  try {
    if (isLocalRepo.value && localDir.value && gitAvailable.value) {
      const res = await window.electronAPI.gitLog(localDir.value, { count: 50, ref: selectedBranch.value })
      commits.value = (res?.items || []).map(mapLocalCommit)
    } else {
      const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
      if (!owner || !props.repo.name) { commits.value = []; return }
      const res = await window.electronAPI.apiRequest({
        method: 'GET', path: `/repos/${owner}/${props.repo.name}/commits?sha=${selectedBranch.value}&per_page=30`
      })
      commits.value = res || []
    }
  } catch (e) { console.error('fetchCommits', e); commits.value = [] }
  commitsLoading.value = false
}

async function fetchTags () {
  if (tags.value.length && !isLocalRepo) return
  tagsLoading.value = true
  try {
    const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
    if (!owner || !props.repo.name) { tags.value = []; return }
    const res = await window.electronAPI.apiRequest({
      method: 'GET', path: `/repos/${owner}/${props.repo.name}/tags`
    })
    tags.value = res || []
  } catch (e) { console.error('fetchTags', e); tags.value = [] }
  tagsLoading.value = false
}

async function fetchActivity () {
  activityLoading.value = true
  try {
    if (isLocalRepo.value && localDir.value && gitAvailable.value) {
      // 本地仓库：用最近提交模拟活动流（每 1 次提交 = 1 条"推送"）
      const res = await window.electronAPI.gitLog(localDir.value, { count: 30, ref: selectedBranch.value })
      const authorSet = new Set((res?.items || []).map(c => c.author).filter(Boolean))
      const fakeUser = authorSet.size === 1 ? [...authorSet][0] : '你'
      activity.value = (res?.items || []).map(c => ({
        id: 'local-' + c.sha,
        type: 'PushEvent',
        created_at: c.date,
        actor: { login: fakeUser },
        payload: { size: 1, commits: [c] }
      }))
    } else {
      const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
      if (!owner || !props.repo.name) { activity.value = []; return }
      const res = await window.electronAPI.apiRequest({
        method: 'GET', path: `/repos/${owner}/${props.repo.name}/events?per_page=30`
      })
      // 过滤掉分支删除等场景产生的 0 提交推送记录
      activity.value = (res || []).filter(e => e.type !== 'PushEvent' || pushCommitCount(e) > 0)
    }
  } catch (e) { console.error('fetchActivity', e); activity.value = [] }
  activityLoading.value = false
}

function switchToBranch (name) {
  if (isLocalRepo.value && localDir.value) {
    selectedBranch.value = name
    switchLocalBranch(name)
    return
  }
  selectedBranch.value = name
  activeTab.value = 'files'
  currentDir.value = ''
  selectedFile.value = null
  currentLocalPath.value = ''
  loadContent()
}

function deleteBranchByName (name) {
  if (!window.confirm(`确认删除远程分支 ${name} ？`)) return
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  window.electronAPI.apiRequest({ method: 'DELETE', path: `/repos/${owner}/${props.repo.name}/git/refs/heads/${name}` })
    .then(() => { branches.value = branches.value.filter(b => b.name !== name) })
}

function openCommitOnGithub (c) {
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  openLink(`https://github.com/${owner}/${props.repo.name}/commit/${c.sha}`)
}

function openLink (url) { window.electronAPI.openExternal(url).catch(() => {}) }

function pushCommitCount (e) {
  const pl = e?.payload || {}
  return typeof pl.size === 'number'
    ? pl.size
    : (Array.isArray(pl.commits) ? pl.commits.length : 0)
}
function eventIcon (t) {
  return { PushEvent: '📨', CreateEvent: '✨', DeleteEvent: '🗑️', PullRequestEvent: '🔀', IssuesEvent: '🐛', WatchEvent: '⭐', ForkEvent: '🍴' }[t] || '⚡'
}
function eventTitle (e) {
  const u = e.actor?.login || ''
  const pl = e.payload || {}
  if (e.type === 'PushEvent') {
    // payload.size 是 GitHub PushEvent 规范字段，表示真实推送的提交总数
    return `${u} 推送 ${pushCommitCount(e)} 个提交`
  }
  if (e.type === 'CreateEvent') return `${u} 创建 ${pl.ref_type} ${pl.ref || ''}`
  if (e.type === 'WatchEvent') return `${u} Star 了仓库`
  if (e.type === 'ForkEvent') return `${u} Fork 了仓库`
  if (e.type === 'PullRequestEvent') return `${u} PR: ${pl.pull_request?.title || ''}`
  if (e.type === 'IssuesEvent') return `${u} Issue: ${pl.issue?.title || ''}`
  return `${u} ${e.type}`
}

const isLargeFile = computed(() => {
  const f = selectedFile.value
  if (!f) return false
  if (isImagePath(f.path)) return false   // 图片走二进制预览，不受文本大小限制
  return f.size > 900000
})
const isMarkdown = computed(() => /\.md$|\.markdown$|\.mdx$/i.test(currentPath.value))
const isLocalMarkdown = computed(() => /\.md$|\.markdown$|\.mdx$/i.test(currentLocalPath.value))

// ========== 图片预览 ==========
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'avif']
const MIME_MAP = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
  ico: 'image/x-icon', avif: 'image/avif'
}

function isImagePath (p) {
  const ext = String(p || '').split('.').pop().toLowerCase()
  return IMAGE_EXTS.includes(ext)
}

function mimeOf (p) {
  const ext = String(p || '').split('.').pop().toLowerCase()
  return MIME_MAP[ext] || 'application/octet-stream'
}

const imageDataUrl = ref('')
const imageLoading = ref(false)
const localImageDataUrl = ref('')
const isImage = computed(() => isImagePath(currentPath.value))
const isLocalImage = computed(() => isImagePath(currentLocalPath.value))

// ========== 代码高亮 ==========
function getLang (path) {
  const ext = (path.split('.').pop() || '').toLowerCase()
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    vue: 'xml',
    wxml: 'xml', axml: 'xml', swan: 'xml', ttml: 'xml',
    html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml',
    css: 'css', wxss: 'css', acss: 'css', ttss: 'css',
    scss: 'scss', less: 'less',
    json: 'json', jsonc: 'json', yml: 'yaml', yaml: 'yaml',
    py: 'python', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp',
    rb: 'ruby', php: 'php', swift: 'swift', sh: 'bash', bash: 'bash', zsh: 'bash',
    wxs: 'javascript', sjs: 'javascript',
    md: 'markdown', markdown: 'markdown',
    sql: 'sql', dockerfile: 'dockerfile', makefile: 'makefile',
    toml: 'toml', ini: 'ini', conf: 'ini'
  }
  return map[ext] || ext
}

// 已注册的语言才直接高亮，否则自动识别（避免未知语言抛错）
function highlightSafe (code, path) {
  if (!code) return ''
  const lang = getLang(path)
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
  } catch { /* fallthrough */ }
  try {
    return hljs.highlightAuto(code).value
  } catch {
    return escapeHtml(code)
  }
}

function escapeHtml (s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const highlightedCode = computed(() => highlightSafe(editorContent.value, currentPath.value))
const highlightedLocalCode = computed(() => highlightSafe(localEditorContent.value, currentLocalPath.value))

// marked 渲染：代码块交给 highlight.js 着色（wxml/wxss 等按别名映射）
marked.use({
  renderer: {
    code (code, infostring) {
      const lang = (infostring || '').trim().split(/\s+/)[0]
      let html
      try {
        if (lang && hljs.getLanguage(lang)) {
          html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        } else {
          html = hljs.highlightAuto(code).value
        }
      } catch {
        html = escapeHtml(code)
      }
      return `<pre class="md-code"><code class="hljs">${html}</code></pre>`
    }
  }
})

const renderedMarkdown = computed(() => marked.parse(editorContent.value || ''))
const renderedLocalMarkdown = computed(() => marked.parse(localEditorContent.value || ''))

// README 中的相对路径图片转成 raw.githubusercontent.com 绝对地址
const renderedReadme = computed(() => {
  let html = marked.parse(readmeContent.value || '')
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  const base = `https://raw.githubusercontent.com/${owner}/${props.repo.name}/${selectedBranch.value}/`
  html = html.replace(
    /(<img[^>]+src=")(?!https?:|\/\/|data:)([^"]+)(")/g,
    (_m, pre, src, post) => pre + base + src.replace(/^\.\//, '') + post
  )
  return html
})

function fileIcon (path) {
  const ext = path.split('.').pop().toLowerCase()
  if (['md', 'markdown', 'mdx', 'txt'].includes(ext)) return '📄'
  if (['js', 'ts', 'vue', 'jsx', 'tsx', 'mjs', 'wxs', 'cjs'].includes(ext)) return '📜'
  if (['json', 'yml', 'yaml', 'toml'].includes(ext)) return '⚙️'
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif'].includes(ext)) return '🖼️'
  if (['css', 'scss', 'less', 'wxss'].includes(ext)) return '🎨'
  if (['html', 'htm', 'wxml'].includes(ext)) return '🌐'
  if (['py', 'go', 'rs', 'java', 'kt'].includes(ext)) return '🔧'
  if (['c', 'cpp', 'h', 'cs'].includes(ext)) return '🔧'
  return '📎'
}

function fileSize (bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(2) + ' MB'
}

function formatDate (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = (now - d) / 86400000
  if (diff < 1) return '今天'
  if (diff < 2) return '昨天'
  if (diff < 7) return Math.floor(diff) + ' 天前'
  if (diff < 30) return Math.floor(diff / 7) + ' 周前'
  if (diff < 365) return Math.floor(diff / 30) + ' 个月前'
  return Math.floor(diff / 365) + ' 年前'
}

// ========== 树形构建（嵌套 + 展平 + 缩进）==========
// treeData 是扁平 list<{path, type, sha, size}>，先还原成嵌套树，
// 再按 expandedDirs 做 DFS 展平，保证子节点紧跟在父目录下面。

// 辅助：从 path 切出所有父目录路径（src/utils/a.js → ['src', 'src/utils']）
function allDirPaths (path) {
  const parts = path.split('/')
  const result = []
  for (let i = 1; i < parts.length; i++) {
    result.push(parts.slice(0, i).join('/'))
  }
  return result
}

// 嵌套树（目录在前、同级按名称排序）
const treeRootNode = computed(() => {
  const nodeMap = new Map()
  const root = { path: '', name: '', isDir: true, children: [] }

  // 先按真实条目建节点
  for (const item of treeData.value) {
    const parts = item.path.split('/')
    const node = {
      path: item.path,
      name: parts[parts.length - 1],
      isDir: item.type === 'tree',
      sha: item.sha,
      size: item.size || 0,
      children: []
    }
    nodeMap.set(item.path, node)
  }

  // 补全缺失的中间目录节点
  for (const item of treeData.value) {
    for (const dp of allDirPaths(item.path)) {
      if (!nodeMap.has(dp)) {
        nodeMap.set(dp, {
          path: dp, name: dp.split('/').pop(), isDir: true, sha: '', size: 0, children: []
        })
      }
    }
  }

  // 挂父子关系
  const attach = (parent, child) => {
    if (!parent.children.some(c => c.path === child.path)) parent.children.push(child)
  }
  for (const [p, node] of nodeMap) {
    const idx = p.lastIndexOf('/')
    const parent = idx === -1 ? root : nodeMap.get(p.slice(0, idx))
    attach(parent || root, node)
  }

  // 递归排序：目录优先，再按名称
  const sortRec = (n) => {
    n.children.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh-CN')
    })
    n.children.forEach(sortRec)
  }
  sortRec(root)
  return root
})

// 所有目录 path 集合（用于"全部展开"）
const dirSet = computed(() => {
  const s = new Set()
  const walk = (n) => {
    for (const c of n.children) {
      if (c.isDir) { s.add(c.path); walk(c) }
    }
  }
  walk(treeRootNode.value)
  return s
})

// DFS 展平 —— 只展开 expandedDirs 中记录的目录
const flatTree = computed(() => {
  const out = []
  const walk = (node, depth) => {
    for (const child of node.children) {
      const expanded = expandedDirs.value.has(child.path)
      out.push({
        path: child.path,
        name: child.name,
        isDir: child.isDir,
        sha: child.sha,
        size: child.size,
        depth,
        expanded
      })
      if (child.isDir && expanded) walk(child, depth + 1)
    }
  }
  walk(treeRootNode.value, 0)
  return out
})

function toggleExpand (path) {
  const next = new Set(expandedDirs.value)
  if (next.has(path)) {
    // 收起：自身及所有子目录一并收起
    for (const p of next) {
      if (p === path || p.startsWith(path + '/')) next.delete(p)
    }
  } else {
    next.add(path)
  }
  expandedDirs.value = next
}

function expandAll () {
  expandedDirs.value = new Set(dirSet.value)
}

function collapseAll () {
  expandedDirs.value = new Set()
}

function onTreeItemClick (item) {
  if (item.isDir) {
    toggleExpand(item.path)
    currentPath.value = item.path
    return
  }
  currentPath.value = item.path
  // 本地仓库：直接从磁盘读取，复用本地文件视图
  if (props.repo._isLocal) {
    openLocalFile(item.path)
    return
  }
  openRemoteFile(item)
}

function navigateTo (p) { currentPath.value = p }

// ========== 加载 ==========
async function loadBranches () {
  branchesLoading.value = true
  try {
    // 本地仓库：优先从真实 git 读取分支列表
    if (props.repo._isLocal && localDir.value) {
      const res = await window.electronAPI.gitBranches(localDir.value)
      if (res?.ok) {
        localBranches.value = res.branches || []
        branches.value = (res.branches || []).map(b => ({ name: b.name }))
        const cur = (res.branches || []).find(b => b.current)
        if (cur) selectedBranch.value = cur.name
        return
      }
    }
    if (props.repo._isLocal && !isRemoteLinked.value) {
      branches.value = [{ name: 'main' }, { name: 'master' }]
      if (!branches.value.find(b => b.name === selectedBranch.value)) selectedBranch.value = 'main'
      return
    }
    const data = await listBranches(props.repo.owner?.login || props.repo.full_name?.split('/')[0], props.repo.name)
    branches.value = data
    if (!branches.value.find(b => b.name === selectedBranch.value)) {
      selectedBranch.value = props.repo.default_branch || data[0]?.name || 'main'
    }
  } catch (e) {
    console.error('loadBranches', e)
  } finally {
    branchesLoading.value = false
  }
}

async function loadContent () {
  if (props.repo._isLocal) {
    await loadLocalRepoTree()
    return
  }
  currentPath.value = ''
  selectedFile.value = null
  editorContent.value = ''; originalContent.value = ''; isDirty.value = false
  readmeContent.value = ''
  treeLoading.value = true
  viewMode.value = 'preview'
  try {
    const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
    const ref = await window.electronAPI.apiRequest({
      method: 'GET',
      path: `/repos/${owner}/${props.repo.name}/git/ref/heads/${selectedBranch.value}`
    }).catch(() => null)
    const treeSha = ref?.object?.sha
    if (treeSha) {
      const tree = await window.electronAPI.apiRequest({
        method: 'GET',
        path: `/repos/${owner}/${props.repo.name}/git/trees/${treeSha}?recursive=1`
      })
      treeData.value = (tree.tree || [])
        .filter(t => t.type === 'blob' || t.type === 'tree')
        .map(t => ({ path: t.path, type: t.type, sha: t.sha, size: t.size || 0 }))
      // 默认展开第一层目录，让用户直接看到文件夹内的内容
      const topLevel = new Set()
      for (const d of dirSet.value) {
        if (!d.includes('/')) topLevel.add(d)
      }
      expandedDirs.value = topLevel
      // 兜底：如果没有任何目录（纯文件仓库）也算正常
      if (tree.tree_truncated) console.warn('tree truncated by GitHub API')
    }
    // 依次尝试常见 README 文件名
    const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README.MD', 'README.markdown']
    for (const name of readmeNames) {
      try {
        const readmeData = await getFile(owner, props.repo.name, name, selectedBranch.value)
        if (readmeData?.content) {
          readmeContent.value = b64ToUtf8(readmeData.content)
          break
        }
      } catch { /* try next */ }
    }
  } catch (e) { console.error('loadContent', e) }
  finally { treeLoading.value = false }
  loadDirFileCommits()
  if (!commits.value.length) fetchCommits()
}

// 本地仓库：直接扫描磁盘目录，复用同一套文件树
async function loadLocalRepoTree () {
  currentPath.value = ''
  selectedFile.value = null
  currentLocalPath.value = ''
  editorContent.value = ''; originalContent.value = ''
  readmeContent.value = ''
  treeLoading.value = true
  try {
    localDir.value = props.repo._localPath || ''
    if (!localDir.value) return
    const list = await window.electronAPI.listDir(localDir.value, true)
    treeData.value = list.map(f => ({
      path: f.path,
      type: f.isDir ? 'tree' : 'blob',
      sha: '',
      size: f.size || 0
    }))
    // 本地仓库默认全部收起
    expandedDirs.value = new Set()
    // 读取根目录 README
    const readme = list.find(f => !f.isDir && !f.path.includes('/') && /^readme\.(md|markdown|mdx)$/i.test(f.path))
    if (readme) {
      readmeContent.value = await window.electronAPI.readFileText(localDir.value + '/' + readme.path) || ''
    }
  } catch (e) {
    console.error('loadLocalRepoTree', e)
  } finally {
    treeLoading.value = false
  }
  // 加载完成后扫描真实工作区改动
  await refreshGitStatus()
  loadDirFileCommits()
  if (!commits.value.length) fetchCommits()
}

async function openRemoteFile (item) {
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  selectedFile.value = item
  editorContent.value = ''; originalContent.value = ''; isDirty.value = false
  viewMode.value = 'preview'
  imageDataUrl.value = ''

  // 图片：走二进制路径，转 data URL 展示
  if (isImagePath(item.path)) {
    await loadRemoteImage(item, owner)
    return
  }

  // 阈值：GitHub Contents API base64 后 1MB ≈ 原文件 730KB，留余量设 900KB
  // 超过就跳过 API 读取（避免 GitHub 返回空 content）
  if (item.size > 900000) {
    editorContent.value = `⚠️ 文件过大 (${fileSize(item.size)})，GitHub Contents API 不返回内容。\n请尝试用浏览器访问：https://github.com/${owner}/${props.repo.name}/blob/${selectedBranch.value}/${item.path}`
    return
  }

  // 先试 Contents API（base64 content）
  try {
    const data = await getFile(owner, props.repo.name, item.path, selectedBranch.value)
    if (data?.content) {
      editorContent.value = data.encoding === 'base64'
        ? b64ToUtf8(data.content)
        : data.content
      originalContent.value = editorContent.value
      selectedFile.value.sha = data.sha || item.sha
      selectedFile.value._local = false
      return
    }
  } catch (e) { /* 可能是二进制或编码不对，fallback 到 git/blob */ }

  // Fallback：用 git/blob API 拿（最多 100MB，但 GitHub 也可能限制）
  try {
    const blobSha = item.sha
    if (!blobSha) return
    const blob = await window.electronAPI.apiRequest({
      method: 'GET', path: `/repos/${owner}/${props.repo.name}/git/blobs/${blobSha}`
    })
    if (blob?.content) {
      editorContent.value = b64ToUtf8(blob.content)
      originalContent.value = editorContent.value
      selectedFile.value._local = false
    } else {
      editorContent.value = `无法读取此文件（二进制或编码不支持）`
    }
  } catch (e) {
    editorContent.value = `⚠️ 读取失败: ${e.message || '未知错误'}\n路径: ${item.path}`
  }
}

// 加载远程图片：Contents API(base64) → git/blob 兜底
async function loadRemoteImage (item, owner) {
  imageLoading.value = true
  try {
    const data = await getFile(owner, props.repo.name, item.path, selectedBranch.value)
    if (data?.content) {
      imageDataUrl.value = `data:${mimeOf(item.path)};base64,${String(data.content).replace(/\s/g, '')}`
      selectedFile.value.sha = data.sha || item.sha
      return
    }
    if (item.sha) {
      const blob = await window.electronAPI.apiRequest({
        method: 'GET', path: `/repos/${owner}/${props.repo.name}/git/blobs/${item.sha}`
      })
      if (blob?.content) {
        imageDataUrl.value = `data:${mimeOf(item.path)};base64,${String(blob.content).replace(/\s/g, '')}`
      }
    }
  } catch (e) {
    imageDataUrl.value = ''
    console.error('loadRemoteImage', e)
  } finally {
    imageLoading.value = false
  }
}

watch(editorContent, (v) => { isDirty.value = v !== originalContent.value })

async function saveRemoteFile () {
  if (!isDirty.value || !selectedFile.value) return
  saving.value = true
  try {
    const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
    await createOrUpdateFile(
      owner, props.repo.name, selectedFile.value.path,
      utf8ToB64(editorContent.value),
      `Update ${selectedFile.value.path}`,
      selectedBranch.value, selectedFile.value.sha
    )
    originalContent.value = editorContent.value; isDirty.value = false
    await loadContent()
  } catch (e) { alert('提交失败: ' + (e.message || JSON.stringify(e))) }
  finally { saving.value = false }
}

function discardChanges () { editorContent.value = originalContent.value; isDirty.value = false }

// ========== 本地文件 ==========
// 远程仓库刷新：重新获取分支、文件内容、提交，以及当前标签页数据
async function refreshRemote () {
  if (isLocalRepo.value) return
  refreshing.value = true
  try {
    await loadBranches()
    await loadContent()
    await fetchCommits(true)
    const t = activeTab.value
    if (t === 'branches') await loadBranches()
    else if (t === 'tags') await fetchTags()
    else if (t === 'releases') await fetchReleases()
    else if (t === 'activity') await fetchActivity()
    else if (t === 'contributors') await fetchContributors()
  } catch (e) {
    console.error('refreshRemote', e)
  } finally {
    refreshing.value = false
  }
}

async function choosePullDir () {
  const dir = await window.electronAPI.selectDir()
  if (dir) pullTargetDir.value = dir + '/' + props.repo.name
}

async function doPull () {
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  pulling.value = true
  showPullPanel.value = false
  try {
    const res = await window.electronAPI.repoPull({
      owner, repo: props.repo.name, branch: selectedBranch.value,
      targetDir: pullTargetDir.value
    })
    if (res.success) {
      localDir.value = pullTargetDir.value
      await scanLocalFiles()

      // 下载完成后初始化 Git 并关联远程分支，同时加入本地仓库列表
      const remoteUrl = `https://github.com/${owner}/${props.repo.name}.git`
      const initRes = await window.electronAPI.gitInitRemote(
        pullTargetDir.value, remoteUrl, selectedBranch.value
      )
      if (initRes && initRes.ok) {
        await addPulledToLocalRepos(pullTargetDir.value, owner)
        alert(`下载完成：已解压到 ${pullTargetDir.value}\n已初始化 Git 仓库，关联 origin/${selectedBranch.value}，并加入「本地仓库」列表。`)
      } else {
        alert(`下载完成：已解压到 ${pullTargetDir.value}\n但 Git 初始化失败：${initRes?.message || '未知错误'}`)
      }
    } else {
      alert('拉取失败: ' + res.message)
    }
  } catch (e) { alert('拉取失败: ' + e.message) }
  finally { pulling.value = false; pullTargetDir.value = '' }
}

// 把下载并初始化好的目录登记到「本地仓库」列表（已存在则跳过）
async function addPulledToLocalRepos (dir, owner) {
  try {
    const cfg = await window.electronAPI.getConfig()
    const list = cfg.repositories || []
    if (list.some(r => r._localPath === dir)) return
    list.push({
      id: 'local_' + Date.now(),
      name: props.repo.name,
      full_name: `${owner}/${props.repo.name}`,
      owner: { login: owner },
      description: props.repo.description || '下载自 GitHub',
      _localPath: dir,
      _isLocal: true
    })
    await window.electronAPI.setConfig('repositories', list)
  } catch { /* 记账失败不影响下载结果 */ }
}

async function scanLocalFiles () {
  if (!localDir.value) return
  localFiles.value = await window.electronAPI.listDir(localDir.value, true)
  localDirtyFiles.value = []
}

async function openLocalFile (relPath) {
  currentLocalPath.value = relPath
  localViewMode.value = 'preview'
  localImageDataUrl.value = ''
  const fullPath = localDir.value + '/' + relPath

  if (isImagePath(relPath)) {
    const b64 = await window.electronAPI.readFileBase64(fullPath)
    if (b64) localImageDataUrl.value = `data:${mimeOf(relPath)};base64,${b64}`
    localEditorContent.value = ''
    localOriginalContent.value = ''
    return
  }

  const text = await window.electronAPI.readFileText(fullPath)
  localEditorContent.value = text || ''
  localOriginalContent.value = localEditorContent.value
}

async function saveLocalFile () {
  if (!isLocalDirty.value) return
  localSaving.value = true
  try {
    const fullPath = localDir.value + '/' + currentLocalPath.value
    await window.electronAPI.writeFile(fullPath, localEditorContent.value, 'utf-8')
    localOriginalContent.value = localEditorContent.value
    // 加入 dirty
    const base64 = utf8ToB64(localEditorContent.value)
    const existing = localDirtyFiles.value.find(f => f.path === currentLocalPath.value)
    if (existing) { existing.changeType = 'M'; existing.base64 = base64 }
    else localDirtyFiles.value.push({ path: currentLocalPath.value, changeType: 'M', base64 })
    await refreshGitStatus()
  } finally { localSaving.value = false }
}

// ========== 推送 ==========
async function doPush () {
  const msg = fullCommitMessage()
  if (!pushFiles.value.length || !msg.trim()) {
    pushError.value = '请填写提交信息并至少选择一个文件'
    return
  }
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  pushing.value = true
  pushLog.value = ''
  pushError.value = ''
  try {
    pushLog.value += '📦 获取远程 base tree...\n'
    const ref = await window.electronAPI.apiRequest({
      method: 'GET', path: `/repos/${owner}/${props.repo.name}/git/ref/heads/${selectedBranch.value}`
    })
    const commitSha = ref.object.sha
    pushLog.value += `  parent: ${commitSha.slice(0, 7)}\n`

    const parentCommit = await window.electronAPI.apiRequest({
      method: 'GET', path: `/repos/${owner}/${props.repo.name}/git/commits/${commitSha}`
    })
    const baseTreeSha = parentCommit.tree.sha

    const baseTree = await window.electronAPI.apiRequest({
      method: 'GET', path: `/repos/${owner}/${props.repo.name}/git/trees/${baseTreeSha}?recursive=1`
    })

    const toPush = pendingFiles.value.filter(f => pushFiles.value.includes(f.path))
    const baseFiltered = (baseTree.tree || []).filter(t => !toPush.find(f => f.path === t.path))

    pushLog.value += `\n📝 处理 ${toPush.length} 个文件...\n`
    const newTree = [...baseFiltered]
    for (const f of toPush) {
      if (f.changeType === 'D' || f.status === 'D') { pushLog.value += `  🗑️ del ${f.path}\n`; continue }      // 工作区改动直接读磁盘内容；应用内编辑的用内存中的 base64
      let b64 = f.base64
      if (!b64) {
        b64 = await window.electronAPI.readFileBase64(localDir.value + '/' + f.path)
        if (!b64) { pushLog.value += `  ❌ 读取失败 ${f.path}\n`; continue }
      }
      const blob = await window.electronAPI.apiRequest({
        method: 'POST', path: `/repos/${owner}/${props.repo.name}/git/blobs`,
        body: { content: b64, encoding: 'base64' }
      })
      pushLog.value += `  📜 blob ${f.path} (${blob.sha.slice(0, 7)})\n`
      newTree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
    }

    pushLog.value += '\n🌳 提交 tree...\n'
    const tree = await window.electronAPI.apiRequest({
      method: 'POST', path: `/repos/${owner}/${props.repo.name}/git/trees`,
      body: { tree: newTree }
    })
    pushLog.value += `  tree: ${tree.sha.slice(0, 7)}\n`

    pushLog.value += '\n✍️ 提交 commit...\n'
    const commit = await window.electronAPI.apiRequest({
      method: 'POST', path: `/repos/${owner}/${props.repo.name}/git/commits`,
      body: { message: msg, tree: tree.sha, parents: [commitSha] }
    })
    pushLog.value += `  commit: ${commit.sha.slice(0, 7)}\n`

    pushLog.value += '\n🚀 推进分支引用...\n'
    await window.electronAPI.apiRequest({
      method: 'PATCH', path: `/repos/${owner}/${props.repo.name}/git/refs/heads/${selectedBranch.value}`,
      body: { sha: commit.sha }
    })
    pushLog.value += '✅ 推送完成！\n'

    localDirtyFiles.value = []
    gitChanges.value = []
    pushFiles.value = []
    showPushPanel.value = false
    commitSubject.value = ''
    commitBody.value = ''
    await loadContent()
  } catch (e) {
    pushError.value = e.message || '推送失败'
    pushLog.value += '\n❌ ' + pushError.value + '\n'
  } finally { pushing.value = false }
}

// ========== 分支管理 ==========
async function createBranch () {
  if (isLocalRepo.value && localDir.value) { await createLocalBranch(); return }
  if (!newBranchName.value.trim()) return
  creating.value = true
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  try {
    const ref = await window.electronAPI.apiRequest({
      method: 'GET', path: `/repos/${owner}/${props.repo.name}/git/ref/heads/${sourceBranch.value}`
    })
    await window.electronAPI.apiRequest({
      method: 'POST', path: `/repos/${owner}/${props.repo.name}/git/refs`,
      body: { ref: `refs/heads/${newBranchName.value}`, sha: ref.object.sha }
    })
    selectedBranch.value = newBranchName.value
    await loadBranches(); await loadContent()
    showCreateBranch.value = false; newBranchName.value = ''
  } catch (e) { alert('创建失败: ' + (e.message || JSON.stringify(e))) }
  finally { creating.value = false }
}

async function deleteBranch () {
  if (isLocalRepo.value && localDir.value) { await deleteLocalBranch(); return }
  if (branches.value.length <= 1) { alert('至少保留一个分支'); return }
  deleting.value = true
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  try {
    await window.electronAPI.apiRequest({
      method: 'DELETE', path: `/repos/${owner}/${props.repo.name}/git/refs/heads/${selectedBranch.value}`
    })
    showDeleteBranch.value = false
    await loadBranches()
    selectedBranch.value = branches.value[0]?.name || 'main'
    await loadContent()
  } catch (e) { alert('删除失败: ' + (e.message || JSON.stringify(e))) }
  finally { deleting.value = false }
}

async function doMerge () {
  if (!mergeSource.value) return
  merging.value = true
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  try {
    await window.electronAPI.apiRequest({
      method: 'POST',
      path: `/repos/${owner}/${props.repo.name}/merges`,
      body: { base: selectedBranch.value, head: mergeSource.value, message: `Merge ${mergeSource.value} into ${selectedBranch.value}` }
    })
    showMerge.value = false; await loadContent()
  } catch (e) { alert('合并失败: ' + (e.message || JSON.stringify(e))) }
  finally { merging.value = false }
}

// ========== 其它 ==========
function openOnGithub () {
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  window.electronAPI.openExternal(`https://github.com/${owner}/${props.repo.name}`)
}

function openRemoteFileInGithub () {
  const owner = props.repo.owner?.login || props.repo.full_name?.split('/')[0]
  if (!currentPath.value) { openOnGithub(); return }
  window.electronAPI.openExternal(`https://github.com/${owner}/${props.repo.name}/blob/${selectedBranch.value}/${currentPath.value}`)
}

watch(showTags, (v) => { if (v) fetchTags() })
watch(showCommits, (v) => { if (v) fetchCommits() })

// 本地仓库拉取时，默认解压到当前本地目录
watch(showPullPanel, (v) => {
  if (v && isLocalRepo.value && localDir.value && !pullTargetDir.value) {
    pullTargetDir.value = localDir.value
  }
})

// 持久化待推送改动，供仓库列表展示"待提交"数量
watch(localDirtyFiles, async (list) => {
  try {
    const cfg = await window.electronAPI.getConfig()
    const map = cfg.pendingChanges || {}
    map[props.repo.id] = list.map(f => f.path)
    await window.electronAPI.setConfig('pendingChanges', map)
  } catch { /* 忽略 */ }
}, { deep: true })

onMounted(async () => {
  await loadBranches()
  await loadContent()
  await fetchCommits()
  // 并行探测当前账号对该仓库的管理权限
  loadRepoPermissions()
})
</script>

<style scoped>
/* ============== 通用按钮样式 ============== */
.btn-primary {
  background: var(--success); color: var(--on-accent); border: none; padding: 10px 18px;
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all .15s;
}
.btn-primary:hover:not(:disabled) { background: var(--success-hover); }
.btn-primary:disabled { background: var(--text-muted); cursor: not-allowed; opacity: .7 }
.btn-secondary {
  background: var(--bg-elevated); color: var(--text); border: 1px solid var(--border); padding: 10px 18px;
  border-radius: 8px; font-size: 14px; cursor: pointer;
}
.btn-secondary:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.btn-danger {
  background: var(--danger); color: var(--on-accent); border: none; padding: 10px 18px;
  border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
}
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }

/* ============== 顶部工具栏 ============== */
.detail-top {
  display: flex; align-items: center; gap: 14px; padding: 12px 52px 12px 20px;
  background: var(--header-bg);
  color: var(--header-text); border-bottom: 1px solid var(--border);
}
.btn-back {
  background: var(--header-btn-bg); color: var(--header-text); border: 1px solid var(--header-btn-border); padding: 8px 14px;
  border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;
  transition: background .15s;
}
.btn-back:hover { background: var(--border-strong); border-color: var(--text-muted); }
.repo-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 15px; }
.repo-breadcrumb .owner { color: var(--text-muted); }
.repo-breadcrumb .sep { color: var(--border-strong); }
.repo-breadcrumb .name { color: var(--accent-hover); font-weight: 600; }
.vis-badge {
  padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600;
  white-space: nowrap; line-height: 1.6;
}
.vis-badge.is-public { background: var(--header-btn-bg); border: 1px solid var(--header-btn-border); color: var(--text-secondary); }
.vis-badge.is-private { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); }
.open-gh { margin-left: 6px; cursor: pointer; font-size: 15px; opacity: .6; transition: opacity .15s; }
.open-gh:hover { opacity: 1; }

.branch-group { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.branch-group .label { font-size: 12px; color: var(--text-muted); }
.branch-popover-wrap { position: relative; }
.btn-manage {
  background: var(--border); color: var(--text-secondary); border: 1px solid var(--border-strong); padding: 8px 14px;
  border-radius: 8px; cursor: pointer; font-size: 13px;
}
.btn-manage:hover { background: var(--border-strong); }
.branch-popover {
  position: absolute; right: 0; top: 42px; width: 240px;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 10px;
  box-shadow: 0 8px 24px var(--shadow); z-index: 100; padding: 6px 0;
}
.popover-section { padding: 8px 0; border-bottom: 1px solid var(--bg-inset); }
.popover-section:last-child { border-bottom: none; }
.popover-title {
  font-size: 11px; color: var(--text-muted); padding: 4px 14px;
  text-transform: uppercase; letter-spacing: .5px;
}
.popover-btn {
  display: block; width: 100%; text-align: left;
  background: transparent; color: var(--text-secondary); border: none;
  padding: 8px 14px; font-size: 13px; cursor: pointer;
}
.popover-btn:hover:not(:disabled) { background: var(--bg-inset); color: var(--success); }
.popover-btn:disabled { opacity: .4; cursor: not-allowed; }

.top-actions { display: flex; gap: 10px; margin-left: 20px; }
.btn-action {
  background: var(--border); color: var(--text-secondary); border: 1px solid var(--border-strong); padding: 8px 14px;
  border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;
  transition: all .15s;
}
.btn-action:hover:not(:disabled) { background: var(--border-strong); border-color: var(--text-muted); }
.btn-action.primary { background: var(--success); border-color: var(--success); color: var(--on-accent); }
.btn-action.primary:hover:not(:disabled) { background: var(--success-hover); }
.btn-action.primary-ghost { background: transparent; border-color: var(--success); color: var(--success); }
.btn-action.primary-ghost:hover:not(:disabled) { background: var(--success); color: var(--on-accent); }
.btn-action:disabled { opacity: .5; cursor: not-allowed; }
.count-badge {
  background: var(--danger); color: var(--on-accent); font-size: 11px; font-weight: 600;
  padding: 1px 7px; border-radius: 10px; margin-left: 4px;
}

/* ============== 主体布局 ============== */
/* 关键：撑满父容器的高度链，否则 flex 子项无法产生内部滚动条 */
.repo-detail {
  height: 100%; display: flex; flex-direction: column;
  overflow: hidden; background: var(--bg);
}
.detail-body {
  flex: 1; display: flex; overflow: hidden;
  background: var(--bg); min-height: 0; min-width: 0;
}

/* ============== 左侧文件树 ============== */
.file-tree-panel {
  width: 320px; min-width: 280px; flex: 0 0 320px; background: var(--bg-elevated);
  border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow: hidden;   /* 由内部 .file-tree 负责滚动 */
  min-height: 0;
}
.panel-header-group {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 18px; background: var(--bg); border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.panel-header { color: var(--text-secondary); font-size: 15px; font-weight: 600; }
.panel-tools { display: flex; gap: 6px; }
.mini-btn {
  background: transparent; border: 1px solid var(--border); color: var(--text-muted);
  padding: 6px 10px; border-radius: 6px; font-size: 12px; cursor: pointer;
}
.mini-btn:hover { background: var(--bg-inset); color: var(--text-secondary); }
.panel-loading { padding: 24px; font-size: 14px; color: var(--text-muted); text-align: center; }
.spinner {
  display: inline-block; width: 16px; height: 16px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite;
  vertical-align: middle; margin-right: 8px;
}
@keyframes spin { to { transform: rotate(360deg) } }

.file-tree {
  padding: 6px 0;
  flex: 1 1 auto; overflow-y: auto; overflow-x: hidden;
  min-height: 0; overscroll-behavior: contain;
}
.file-tree::-webkit-scrollbar { width: 10px; }
.file-tree::-webkit-scrollbar-track { background: var(--bg); }
.file-tree::-webkit-scrollbar-thumb { background: var(--border); border-radius: 5px; }
.file-tree::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
.tree-item {
  padding: 9px 12px; cursor: pointer; line-height: 1.7;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: flex; align-items: center; gap: 4px;
  font-size: 16px; color: var(--text-secondary);
  border-left: 2px solid transparent;
  transition: background .1s;
}
.tree-item:hover { background: var(--bg-inset); }
.tree-item.active { background: var(--accent-soft); border-left-color: var(--accent); }
.tree-item.dir { font-weight: 600; color: var(--success); }
.tree-item .arrow {
  width: 18px; text-align: center; color: var(--text-muted); user-select: none;
  flex-shrink: 0; font-size: 14px; transition: color .15s;
}
.tree-item:hover .arrow { color: var(--text-secondary); }
.tree-item .icon { flex-shrink: 0; font-size: 18px; }
.tree-item .name { overflow: hidden; text-overflow: ellipsis; flex: 1; }
.tree-empty { padding: 60px 20px; text-align: center; color: var(--text-muted); font-size: 15px; }

/* 本地仓库改动面板 */
.changes-panel {
  flex: 0 0 auto; max-height: 38%; overflow-y: auto;
  border-bottom: 1px solid var(--border); background: var(--bg-inset);
}
.changes-header {
  position: sticky; top: 0; z-index: 1;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; font-size: 13px; font-weight: 600;
  color: var(--text-secondary); background: var(--bg-inset);
}
.changes-count {
  background: var(--accent-soft); color: var(--accent);
  border-radius: 999px; padding: 1px 9px; font-size: 11px;
}
.change-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 14px; cursor: pointer; font-size: 13px;
}
.change-item:hover { background: var(--bg-elevated); }
.change-badge { width: 16px; text-align: center; font-size: 12px; font-weight: 700; font-family: Consolas, monospace; }
.st-M { color: #d29922; }
.st-A { color: #3fb950; }
.st-D { color: #f85149; }
.change-path {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, Monaco, monospace; color: var(--text);
}
.change-revert { opacity: 0; font-size: 12px; color: var(--text-muted); transition: opacity .15s; }
.change-item:hover .change-revert { opacity: .9; }
.change-revert:hover { color: var(--danger); }
.git-warning {
  padding: 8px 14px; font-size: 12px; line-height: 1.5;
  color: var(--warn-text); background: var(--warn-bg);
  border-bottom: 1px solid var(--border);
}
.btn-link {
  background: transparent; border: none; color: var(--accent); cursor: pointer;
  font-size: 13px; margin-top: 10px;
}
.btn-link:hover { text-decoration: underline; }

/* ============== 中间内容区 ============== */
.main-panel {
  flex: 1; overflow: auto; background: var(--bg);
  min-height: 0; min-width: 0;
}
.empty-view { padding: 100px 40px; text-align: center; color: var(--text-muted); }
.empty-view .emoji { font-size: 56px; margin-bottom: 20px; }
.empty-view h2 { color: var(--text); margin-bottom: 8px; font-size: 22px; }
.empty-view .hint { font-size: 14px; }

.file-tree {
  padding: 6px 0; flex: 1; overflow-y: auto;
}

/* 文件查看头部 */
.file-view { display: flex; flex-direction: column; height: 100%; }
.view-header {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; background: var(--bg-elevated); border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.file-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.file-path {
  font-family: Consolas, Monaco, monospace; font-size: 14px; color: var(--accent-hover); font-weight: 500;
}
.meta-tag {
  background: var(--bg-inset); color: var(--text-muted); padding: 2px 10px; border-radius: 12px;
  font-size: 12px;
}
.meta-tag.mono { font-family: Consolas, Monaco, monospace; }
.view-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; flex-wrap: wrap; }
.view-actions .spacer { flex: 1; }

.mode-switch {
  background: var(--bg-inset); border-radius: 8px; padding: 3px;
  display: flex; gap: 2px;
}
.mode-btn {
  padding: 5px 12px; border: none; background: transparent; color: var(--text-muted);
  border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 500;
}
.mode-btn.active { background: var(--border); color: var(--text); }
.btn-save {
  background: var(--success); color: var(--on-accent); border: none; padding: 7px 14px;
  border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;
}
.btn-save:hover:not(:disabled) { background: var(--success-hover); }
.btn-save:disabled { background: var(--text-muted); cursor: not-allowed; }
.btn-ghost {
  background: transparent; color: var(--text-secondary); border: 1px solid var(--border);
  padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.btn-ghost:hover { background: var(--bg-inset); }
.btn-primary-push {
  background: transparent; color: var(--success); border: 1px solid var(--success);
  padding: 7px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;
}
.btn-primary-push:hover:not(:disabled) { background: var(--success); color: var(--on-accent); }
.btn-primary-push:disabled { opacity: .4; cursor: not-allowed; }

.large-hint { color: var(--warn-text); font-size: 12px; }

/* 预览区域 */
.preview-area { flex: 1; overflow: auto; padding: 28px; background: var(--bg); }
.readme-view { padding: 32px 40px 60px; }
.markdown-body {
  max-width: 900px; margin: 0 auto; color: var(--text-secondary); line-height: 1.75; font-size: 15px;
}

/* 注意：markdown 内容是 v-html 注入的，不带 scoped 属性，
   因此所有后代选择器必须用 :deep() 才能命中。 */
.markdown-body :deep(h1), .markdown-body :deep(h2), .markdown-body :deep(h3) {
  color: var(--text); margin-top: 28px; margin-bottom: 14px;
  border-bottom: 1px solid var(--border); padding-bottom: 6px;
}
.markdown-body :deep(h1) { font-size: 28px; }
.markdown-body :deep(h2) { font-size: 22px; }
.markdown-body :deep(h4), .markdown-body :deep(h5), .markdown-body :deep(h6) {
  color: var(--text); margin: 20px 0 10px;
}
.markdown-body :deep(p) { margin: 12px 0; }
.markdown-body :deep(img) { max-width: 100%; border-radius: 6px; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
.markdown-body :deep(code) {
  background: var(--bg-inset); padding: 2px 8px; border-radius: 4px;
  font-family: Consolas, 'Cascadia Code', monospace; font-size: 13.5px;
  color: var(--success);
}
.markdown-body :deep(pre) {
  background: var(--bg-elevated); padding: 18px 22px; border-radius: 8px;
  border: 1px solid var(--border); overflow-x: auto; margin: 14px 0;
}
.markdown-body :deep(pre code) {
  background: none; padding: 0; color: var(--text-secondary); font-size: 13.5px;
  font-family: Consolas, 'Cascadia Code', monospace; line-height: 1.7;
}
.markdown-body :deep(table) {
  border-collapse: collapse; margin: 16px 0; width: 100%;
}
.markdown-body :deep(th), .markdown-body :deep(td) {
  border: 1px solid var(--border); padding: 8px 14px; text-align: left; font-size: 14px;
}
.markdown-body :deep(th) { background: var(--bg-inset); color: var(--accent-hover); }
.markdown-body :deep(a) { color: var(--accent); }
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--border); padding-left: 14px; color: var(--text-muted);
  margin: 14px 0;
}
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 22px; }
.markdown-body :deep(li) { margin: 6px 0; }

.code-block {
  background: var(--bg); padding: 24px 30px; border-radius: 8px;
  border: 1px solid var(--border); overflow-x: auto; margin: 0;
}
.code-block :deep(code.hljs) {
  background: transparent !important; padding: 0;
  font-family: Consolas, 'Cascadia Code', monospace;
  font-size: 14px; line-height: 1.7; color: var(--text-secondary);
}

/* 图片预览 */
.image-view {
  display: flex; align-items: center; justify-content: center;
  min-height: 300px; padding: 20px;
}
.image-view img {
  max-width: 100%; max-height: calc(100vh - 260px);
  border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg-elevated); object-fit: contain;
}
.image-loading { color: var(--text-muted); font-size: 14px; }

/* 代码编辑器 textarea */
.code-editor {
  flex: 1; border: none; outline: none; padding: 24px 30px;
  font-family: Consolas, 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 14px; line-height: 1.7; resize: none;
  background: var(--bg); color: var(--text-secondary); tab-size: 2;
}

/* ============== Modal 弹窗 ============== */
.modal-mask {
  position: fixed; inset: 0; background: var(--overlay);
  display: flex; align-items: center; justify-content: center; z-index: 999;
  backdrop-filter: blur(4px);
}
.modal {
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 12px;
  padding: 28px 32px; width: 520px; max-height: 85vh; overflow-y: auto;
  box-shadow: 0 20px 60px var(--shadow);
}
.modal.small { width: 420px; }
.modal.pull-update-modal { width: 620px; max-width: 92vw; }
/* 覆盖 .modal label / .modal input 的通用样式：单选、复选框保持原生尺寸并位于文字左侧 */
.modal.pull-update-modal .pull-option {
  display: flex; align-items: flex-start; gap: 10px;
  margin: 0 0 10px; padding: 12px 14px; font-weight: 400;
}
.modal.pull-update-modal .pull-dontask {
  display: flex; align-items: center; gap: 8px;
  margin: 8px 0 0; font-weight: 400;
}
.modal.pull-update-modal .pull-option input[type="radio"],
.modal.pull-update-modal .pull-dontask input[type="checkbox"] {
  width: 16px; height: 16px; padding: 0; margin: 0; flex: 0 0 auto;
  border: none; background: none; accent-color: var(--accent);
}
.modal.pull-update-modal .pull-option input[type="radio"] { margin-top: 2px; }
.modal h3 { color: var(--text); margin-bottom: 8px; font-size: 18px; }
.modal-desc { color: var(--text-muted); font-size: 13px; margin-bottom: 16px; line-height: 1.7; }
.modal label { display: block; color: var(--text-secondary); font-size: 13px; font-weight: 500; margin: 12px 0 6px; }
.modal input, .modal select, .modal textarea {
  width: 100%; padding: 10px 14px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text-secondary); border-radius: 8px;
  font-size: 14px; outline: none; box-sizing: border-box;
}
.modal textarea { resize: vertical; font-family: inherit; line-height: 1.6; }
.modal input:focus, .modal select:focus, .modal textarea:focus { border-color: var(--success); }
.modal-check { display: flex; align-items: center; gap: 8px; font-weight: 400; }
.modal-check input[type="checkbox"] { width: 16px; height: 16px; padding: 0; margin: 0; flex: 0 0 auto; accent-color: var(--accent); }
.static-line {
  background: var(--bg-inset); color: var(--accent-hover); padding: 10px 14px;
  border-radius: 8px; font-family: Consolas, monospace; font-size: 13px;
}
.commit-msg {
  width: 100%; padding: 10px 14px; border: 1px solid var(--border);
  background: var(--bg); color: var(--text-secondary); border-radius: 8px;
  font-size: 14px; resize: vertical; font-family: inherit;
}
.dir-picker { display: flex; gap: 8px; }
.dir-picker input { flex: 1; }
.btn-browse {
  background: var(--bg-inset); color: var(--text-secondary); border: 1px solid var(--border);
  padding: 10px 16px; border-radius: 8px; cursor: pointer; font-size: 13px;
}
.btn-browse:hover { background: var(--border); }
.pull-preview { color: var(--text-muted); font-size: 12px; margin-top: 8px; }
.pull-form input:not([readonly]) {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--text); font-size: 14px; outline: none;
  font-family: Consolas, Monaco, monospace;
}
.pull-form input:not([readonly]):focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.pull-form label { display: block; font-size: 12px; color: var(--text-muted); margin: 10px 0 4px; }
.modal-tip code { background: var(--bg-inset); padding: 1px 6px; border-radius: 3px; font-family: Consolas, monospace; font-size: 11px; }
.pull-preview code { background: var(--bg-inset); padding: 2px 6px; border-radius: 4px; color: var(--success); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

/* 拉取策略选择（Update Project 风格） */
.pull-option {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; margin-bottom: 8px;
  border: 1px solid var(--border); border-radius: 8px; cursor: pointer;
  background: var(--bg); transition: border-color .15s, background .15s;
}
.pull-option:hover { background: var(--bg-hover); }
.pull-option input { margin-top: 3px; accent-color: var(--accent); }
.pull-option b { display: block; font-size: 13px; color: var(--text-strong); font-weight: 600; }
.pull-option em { display: block; font-style: normal; font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.pull-warn {
  font-size: 12px; color: var(--warn-text); background: var(--warn-bg);
  border: 1px solid var(--warn-border); border-radius: 6px; padding: 8px 10px; margin-bottom: 12px;
}
.pull-dontask { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
.pull-dontask input { accent-color: var(--accent); }

/* 提交确认弹窗 */
.commit-confirm-subject {
  padding: 10px 12px; font-size: 14px; font-weight: 600; color: var(--text-strong);
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
  word-break: break-word;
}
.commit-confirm-body {
  margin: 8px 0 0; padding: 10px 12px; font-size: 12px; color: var(--text-secondary);
  background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
  white-space: pre-wrap; word-break: break-word; max-height: 140px; overflow: auto;
}
.commit-confirm-files {
  margin-top: 10px; max-height: 160px; overflow: auto;
  border: 1px solid var(--border); border-radius: 6px; background: var(--bg);
}
.commit-confirm-file {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px;
  border-bottom: 1px solid var(--border); font-size: 12px;
}
.commit-confirm-file:last-child { border-bottom: none; }

/* 推送确认弹窗（WebStorm Push Commits 风格） */
.push-dialog { width: 620px; max-width: 92vw; }
.push-branch-line {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;
}
.push-branch-line code {
  background: var(--bg-inset); padding: 2px 8px; border-radius: 4px;
  font-family: Consolas, Monaco, monospace; color: var(--text-strong);
}
.push-arrow { color: var(--text-muted); }
.push-new-tag {
  font-size: 11px; padding: 1px 8px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent); font-weight: 600;
}
.push-empty {
  padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px;
  background: var(--bg); border: 1px dashed var(--border); border-radius: 8px;
}
.push-commit-list {
  border: 1px solid var(--border); border-radius: 8px; background: var(--bg);
  max-height: 320px; overflow: auto;
}
.push-commit-row {
  display: flex; align-items: flex-start; gap: 10px; padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}
.push-commit-row:last-child { border-bottom: none; }
.push-commit-sha {
  flex-shrink: 0; font-family: Consolas, Monaco, monospace; font-size: 11px;
  color: var(--accent); background: var(--accent-soft);
  padding: 1px 6px; border-radius: 4px; margin-top: 1px;
}
.push-commit-main { flex: 1; min-width: 0; }
.push-commit-subject {
  font-size: 13px; color: var(--text); overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.push-commit-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

/* Changed files */
.changed-files {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 10px; max-height: 260px; overflow-y: auto;
}
.changed-item { padding: 4px 0; }
.changed-item label { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.empty-tip { color: var(--text-muted); text-align: center; padding: 16px; font-size: 13px; }
.push-log { margin-top: 12px; background: var(--log-bg); border: 1px solid var(--border); padding: 14px; border-radius: 8px; max-height: 300px; overflow: auto; }
.push-log pre { font-family: Consolas, monospace; font-size: 12px; color: var(--success); margin: 0; white-space: pre-wrap; }

/* Tags */
.tag-list { max-height: 300px; overflow-y: auto; }
.tag-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: var(--bg-inset); border-radius: 8px; margin-bottom: 6px;
  border: 1px solid var(--border);
}
.tag-name { color: var(--text-secondary); font-size: 14px; }
.tag-sha { color: var(--text-muted); font-size: 12px; }
.mono { font-family: Consolas, monospace; }

/* Commits */
.commit-list { max-height: 400px; overflow-y: auto; }
.commit-item {
  background: var(--bg-inset); border: 1px solid var(--border); border-radius: 8px;
  padding: 14px 16px; margin-bottom: 8px;
}
.commit-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
.commit-meta .avatar { width: 24px; height: 24px; border-radius: 50%; }
.commit-meta .author { color: var(--accent-hover); font-weight: 500; }
.commit-meta .time { margin-left: auto; }
.commit-message { color: var(--text-secondary); font-size: 14px; margin-bottom: 6px; line-height: 1.5; }
.commit-sha { color: var(--text-muted); font-size: 12px; }

/* ========== 右侧 TAB 样式 ========== */
.content-tabs {
  flex: 0 0 auto; display: flex; gap: 2px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated); padding: 0 10px;
}
.content-tab {
  padding: 11px 16px; font-size: 13px; font-weight: 500;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  color: var(--text-muted); cursor: pointer; transition: all .15s;
  white-space: nowrap;
}
.content-tab:hover { color: var(--text); }
.content-tab.active {
  color: var(--text);
  border-bottom-color: var(--accent);
  background: var(--bg);
}
.tab-content { flex: 1 1 auto; overflow: auto; }

/* ========== 分支列表 ========== */
.branch-list { padding: 12px 16px; }
.branch-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; margin-bottom: 6px; border-radius: 8px;
  background: var(--bg-elevated); border: 1px solid var(--border);
}
.branch-row.active { border-color: var(--accent); background: var(--accent-soft); }
.branch-info { display: flex; align-items: center; gap: 10px; }
.branch-icon { font-size: 16px; }
.branch-name { font-family: Consolas, Monaco, monospace; font-weight: 600; }
.current-tag {
  background: var(--accent); color: #fff; font-size: 11px;
  padding: 2px 8px; border-radius: 999px;
}
.branch-tip { padding: 18px; color: var(--text-muted); font-size: 13px; }
.branch-tip p { margin-bottom: 10px; }

/* ========== 提交列表 ========== */
.commit-list { padding: 12px 16px; }
.commit-row {
  display: flex; gap: 12px; padding: 12px 14px;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 8px; align-items: flex-start;
}
.commit-avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }
.commit-main { flex: 1; min-width: 0; }
.commit-message { color: var(--text); font-weight: 500; font-size: 14px; line-height: 1.4; margin-bottom: 4px; }
.commit-meta {
  display: flex; gap: 12px; align-items: center;
  font-size: 12px; color: var(--text-muted);
}
.commit-sha { font-family: Consolas, monospace; color: var(--accent); }

/* ========== 标签 ========== */
.tag-list { padding: 12px 16px; }
.tag-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; margin-bottom: 6px;
}
.tag-icon { font-size: 16px; }
.tag-name { font-family: Consolas, monospace; font-weight: 600; }
.tag-sha { margin-left: auto; font-family: Consolas, monospace; color: var(--text-muted); font-size: 12px; }

/* ========== 活动 ========== */
.activity-list { padding: 12px 16px; }
.activity-row {
  display: flex; gap: 12px; padding: 10px 14px;
  border-bottom: 1px solid var(--border); align-items: flex-start;
}
.activity-row:last-child { border-bottom: none; }
.activity-type { font-size: 18px; width: 24px; text-align: center; flex-shrink: 0; }
.activity-main { flex: 1; min-width: 0; }
.activity-title { font-size: 13px; color: var(--text); margin-bottom: 2px; }
.activity-time { font-size: 11px; color: var(--text-muted); }

/* ========== 空状态 ========== */
.empty-tab { padding: 60px 20px; text-align: center; color: var(--text-muted); }

/* ========== Diff ========== */
.modal.large { max-width: 900px; max-height: 85vh; }
.diff-block {
  max-height: 55vh; overflow: auto;
  background: var(--bg-inset); border-radius: 6px; padding: 12px;
  font-family: Consolas, Monaco, monospace; font-size: 13px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-all; margin-bottom: 12px;
}
.diff-empty {
  padding: 40px; text-align: center; color: var(--text-muted);
  background: var(--bg-inset); border-radius: 6px;
}
/* Git diff 简易配色 */
.diff :where(span:has(+ span), span) { /* 避免冲突 */ }
.diff-added { color: #3fb950; background: rgba(63,185,80,.12); display: block; padding: 0 6px; }
.diff-removed { color: #f85149; background: rgba(248,81,73,.12); display: block; padding: 0 6px; }
.diff-hunk { color: #79c0ff; background: rgba(121,192,255,.08); display: block; padding: 0 6px; }
.diff-header { color: #a5d6ff; font-weight: 600; display: block; padding: 0 6px; }

/* 本地改动 diff / revert 按钮组 */
.change-actions { display: flex; align-items: center; gap: 4px; margin-left: 6px; }
.change-actions .mini-btn {
  opacity: 0; font-size: 11px; padding: 2px 6px;
}
.change-item:hover .change-actions .mini-btn { opacity: 1; }

/* ========== 推送面板增强样式 ========== */
.modal.push-modal { width: 640px; }

.head-info {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-inset); border: 1px solid var(--border);
  padding: 10px 14px; border-radius: 8px;
  margin-bottom: 16px;
}
.hi-label { font-size: 12px; color: var(--text-muted); font-weight: 500; }
.hi-sha {
  background: var(--bg-elevated); padding: 2px 8px; border-radius: 4px;
  font-size: 12px; color: var(--success);
}
.hi-msg { font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.commit-form { margin-bottom: 16px; }
.cf-row {
  position: relative; display: flex; align-items: center; gap: 10px;
}
.commit-subject {
  flex: 1;
  padding: 12px 14px; padding-right: 60px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--text); font-size: 15px; font-weight: 500;
  outline: none; box-sizing: border-box;
  transition: border-color .15s, box-shadow .15s;
}
.commit-subject:focus { border-color: var(--success); box-shadow: 0 0 0 3px var(--accent-soft); }
.cf-counter {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--text-muted); pointer-events: none;
}
.commit-body {
  width: 100%; margin-top: 10px;
  padding: 12px 14px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--text-secondary); font-size: 14px;
  font-family: inherit; resize: vertical; box-sizing: border-box;
  line-height: 1.6;
}
.commit-body:focus { border-color: var(--success); box-shadow: 0 0 0 3px var(--accent-soft); outline: none; }
.btn-suggest {
  margin-top: 10px;
  background: transparent; border: 1px dashed var(--border-strong);
  color: var(--text-muted); padding: 6px 12px; border-radius: 6px;
  font-size: 12px; cursor: pointer; transition: all .15s;
}
.btn-suggest:hover { background: var(--bg-inset); color: var(--accent); border-color: var(--accent); }

/* 变更文件列表增强 */
.changed-files {
  background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
  padding: 0; max-height: 280px; overflow-y: auto;
}
.cf-header {
  position: sticky; top: 0; z-index: 2;
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: var(--bg-inset); border-bottom: 1px solid var(--border);
}
.cf-select-all {
  display: flex; align-items: center; gap: 8px;
  cursor: pointer; font-size: 13px; color: var(--text-secondary);
}
.cf-summary { font-size: 12px; color: var(--text-muted); }
.cf-summary strong { color: var(--accent); font-size: 14px; }

.changed-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 14px; border-bottom: 1px solid var(--bg-inset);
  transition: background .1s;
}
.changed-item:last-child { border-bottom: none; }
.changed-item.selected { background: var(--accent-soft); }
.changed-item:hover { background: var(--bg-inset); }
.changed-item.selected:hover { background: var(--accent-soft); }

.ci-main {
  display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
  cursor: pointer;
}
.ci-status {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  font-size: 12px; font-weight: 700; font-family: Consolas, monospace;
  flex-shrink: 0;
}
.ci-st-M { background: rgba(210,153,34,.15); color: #d29922; }
.ci-st-A { background: rgba(63,185,80,.15); color: #3fb950; }
.ci-st-D { background: rgba(248,81,73,.15); color: #f85149; }
.ci-path {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: Consolas, Monaco, monospace; font-size: 13px; color: var(--text);
}
.ci-diff {
  flex-shrink: 0; margin-left: 10px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  color: var(--text-muted); padding: 4px 10px; border-radius: 6px;
  font-size: 12px; cursor: pointer; transition: all .15s;
}
.ci-diff:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.ci-diff:disabled { opacity: .35; cursor: not-allowed; }

.push-error {
  margin-top: 12px; padding: 10px 14px; border-radius: 8px;
  background: rgba(248,81,73,.1); border: 1px solid rgba(248,81,73,.3);
  color: #f85149; font-size: 13px;
}

/* ========== Diff 弹窗增强 ========== */
.diff-modal h3 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.diff-status-tag {
  font-size: 11px; font-weight: 600;
  padding: 3px 10px; border-radius: 999px;
}
.dst-M { background: rgba(210,153,34,.15); color: #d29922; }
.dst-A { background: rgba(63,185,80,.15); color: #3fb950; }
.dst-D { background: rgba(248,81,73,.15); color: #f85149; }
.diff-error {
  padding: 20px; border-radius: 6px;
  background: rgba(248,81,73,.08); border: 1px solid rgba(248,81,73,.25);
  color: #f85149; font-size: 13px; line-height: 1.6;
}

/* ========== Staged/Unstaged/Untracked 三组 ========== */
.change-group { border-bottom: 1px solid var(--border); padding: 4px 0; }
.change-group:last-child { border-bottom: none; }
.group-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; font-size: 12px; font-weight: 600;
  letter-spacing: .5px; text-transform: uppercase;
}
.staged-group .group-header { color: var(--success); background: rgba(63,185,80,.08); }
.unstaged-group .group-header { color: #d29922; background: rgba(210,153,34,.08); }
.untracked-group .group-header { color: var(--accent); background: rgba(88,166,255,.08); }

.group-title { font-size: 12px; }
.group-submit-hint { font-size: 10px; opacity: .6; }
.group-add-all {
  font-size: 11px; font-weight: 500; padding: 3px 10px;
  background: transparent; border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-muted); cursor: pointer;
}
.group-add-all:hover { border-color: var(--success); color: var(--success); }

.change-item.staged { background: rgba(63,185,80,.06); }
.change-item.staged:hover { background: rgba(63,185,80,.12); }
.change-item.unstaged { background: rgba(210,153,34,.05); }
.change-item.unstaged:hover { background: rgba(210,153,34,.1); }
.change-item.untracked { background: rgba(88,166,255,.05); }
.change-item.untracked:hover { background: rgba(88,166,255,.1); }

.st-staged { color: #3fb950; background: rgba(63,185,80,.15); }
.st-unstaged { color: #d29922; background: rgba(210,153,34,.15); }
.st-untracked { color: #58a6ff; background: rgba(88,166,255,.15); }

.action-stage {
  opacity: 0; font-size: 11px; padding: 2px 7px;
  color: var(--success);
}
.action-unstage {
  opacity: 0; font-size: 11px; padding: 2px 7px;
  color: #d29922;
}
.change-item:hover .action-stage,
.change-item:hover .action-unstage { opacity: 1; }
.action-stage:hover { background: rgba(63,185,80,.15); }
.action-unstage:hover { background: rgba(210,153,34,.15); }

/* ========== Side-by-Side Diff ========== */
.modal.diff-sbs-modal { max-width: 1200px; width: 90vw; padding: 20px 24px; }
.diff-sbs-title {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  margin-bottom: 14px; font-size: 15px;
}
.diff-sbs-mode {
  font-size: 11px; font-weight: 600;
  padding: 2px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
}
.diff-sbs-stats { margin-left: auto; display: flex; gap: 8px; font-family: Consolas, monospace; font-size: 13px; }
.stat-add { color: #3fb950; font-weight: 600; }
.stat-del { color: #f85149; font-weight: 600; }

.diff-sbs-container {
  display: flex; gap: 0;
  border: 1px solid var(--border); border-radius: 8px;
  overflow: hidden; max-height: 65vh;
  font-family: Consolas, 'Cascadia Code', monospace; font-size: 13px;
}
.sbs-col {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; overflow: hidden;
}
.sbs-col.sbs-left { border-right: 1px solid var(--border); }
.sbs-col-header {
  padding: 8px 14px; font-size: 11px; font-weight: 600;
  color: var(--text-muted); text-transform: uppercase; letter-spacing: .5px;
  background: var(--bg-inset); border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sbs-lines {
  flex: 1; overflow: auto;
  background: var(--bg);
}
.sbs-row {
  display: flex; align-items: stretch; gap: 0;
  line-height: 1.6;
  white-space: pre;
  min-height: 21px;
}
.sbs-line-num {
  flex-shrink: 0; width: 40px;
  text-align: right; padding: 0 8px;
  color: var(--text-muted); font-size: 11px;
  user-select: none; border-right: 1px solid var(--border);
  display: flex; align-items: center; justify-content: flex-end;
  background: var(--bg-elevated);
}
.sbs-line {
  flex: 1; margin: 0; padding: 0 10px;
  overflow: hidden; text-overflow: ellipsis;
  font-family: inherit; font-size: inherit;
}

/* 行状态 */
.d-eq { color: var(--text-secondary); background: var(--bg); }
.d-empty { color: transparent; background: var(--bg-inset); }
.d-del {
  color: #cf222e; background: rgba(248,81,73,.12);
}
.d-add {
  color: #1a7f37; background: rgba(63,185,80,.12);
}
.d-mod-old {
  color: #cf222e; background: rgba(210,153,34,.1);
}
.d-mod-new {
  color: #1a7f37; background: rgba(210,153,34,.1);
}

/* 左列 vs 右列的 modified 用更明显的区分 */
.sbs-left .d-mod-old { color: #cf222e; background: rgba(248,81,73,.1); }
.sbs-right .d-mod-new { color: #1a7f37; background: rgba(63,185,80,.1); }
.sbs-left .d-del .sbs-line-num { background: rgba(248,81,73,.18); color: #cf222e; }
.sbs-right .d-add .sbs-line-num { background: rgba(63,185,80,.18); color: #1a7f37; }
.sbs-right .d-empty .sbs-line-num, .sbs-left .d-empty .sbs-line-num {
  background: var(--bg-inset);
}

/* ================= GitLab 风格（跟随全局主题） ================= */
.repo-detail.gl-app {
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
}

/* 主体 */
.gl-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

/* 侧边栏 */
.gl-sidebar {
  width: 220px; flex: 0 0 220px; background: var(--bg-elevated); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
}
.gl-sidebar.collapsed { width: 56px; flex: 0 0 56px; }
.gl-project-head {
  display: flex; align-items: center; gap: 10px; padding: 14px 12px;
  border-bottom: 1px solid var(--border);
}
.gl-project-avatar {
  width: 30px; height: 30px; flex: 0 0 30px; border-radius: 6px; background: var(--accent);
  color: var(--on-accent); display: flex; align-items: center; justify-content: center; font-weight: 600;
}
.gl-project-meta { min-width: 0; }
.gl-project-name {
  font-size: 14px; font-weight: 600; color: var(--text-strong); line-height: 1.3;
  word-break: break-word;
}
.gl-project-path { font-size: 12px; color: var(--text-muted); }
.gl-nav { flex: 1; overflow-y: auto; padding: 6px 0; }
.gl-nav-group {
  padding: 14px 16px 4px; font-size: 12px; color: var(--text-muted); font-weight: 600;
}
.gl-nav-item {
  display: flex; align-items: center; gap: 9px; padding: 7px 16px;
  color: var(--text-secondary); font-size: 14px; cursor: pointer;
  border-left: 2px solid transparent; white-space: nowrap;
}
.gl-sidebar.collapsed .gl-nav-item { justify-content: center; padding: 8px 0; }
.gl-nav-item:hover { background: var(--bg-hover); color: var(--text); }
.gl-nav-item.active {
  border-left-color: var(--accent); color: var(--text-strong); font-weight: 600; background: var(--bg-inset);
}
.gl-nav-ico { width: 16px; text-align: center; font-size: 14px; flex-shrink: 0; }
.gl-nav-label { overflow: hidden; text-overflow: ellipsis; }
.gl-nav-badge {
  margin-left: auto; background: var(--bg-inset); color: var(--text-secondary);
  border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 600; line-height: 18px;
}
.gl-collapse {
  flex: 0 0 auto; padding: 11px 16px; text-align: left; font-size: 13px;
  color: var(--text-secondary); background: var(--bg-elevated); border: none;
  border-top: 1px solid var(--border); cursor: pointer;
}
.gl-collapse:hover { background: var(--bg-hover); color: var(--text); }

/* 主区 */
.gl-main { flex: 1; overflow: auto; min-width: 0; background: var(--bg); }
.gl-main-inner { max-width: 1240px; margin: 0 auto; padding: 14px 24px 60px; }

/* 面包屑 */
.gl-crumbs-bar {
  display: flex; align-items: center; gap: 10px; padding: 4px 0 12px;
  font-size: 13px; color: var(--text-muted);
}
.gl-crumbs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.gl-crumb { color: var(--text-secondary); cursor: pointer; }
.gl-crumb:hover { color: var(--accent); text-decoration: underline; }
.gl-crumb-current { color: var(--text-strong); font-weight: 600; }
.gl-sep { color: var(--border-strong); }
.gl-open-ext { margin-left: auto; cursor: pointer; opacity: .7; font-size: 14px; }
.gl-open-ext:hover { opacity: 1; }

/* 工具栏 */
.gl-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  flex-wrap: wrap; margin-bottom: 14px;
}
.gl-toolbar-left, .gl-toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gl-branch-ico { font-size: 13px; }
.gl-repo-path { font-size: 13px; color: var(--text-muted); font-family: Consolas, Monaco, monospace; }
.gl-branch-pop-wrap { position: relative; }
.gl-plus-btn {
  width: 32px; height: 32px; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-secondary); cursor: pointer; font-size: 14px;
}
.gl-plus-btn:hover { background: var(--bg-hover); }
.gl-popover {
  position: absolute; left: 0; top: 38px; width: 230px; z-index: 120;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
  box-shadow: 0 8px 24px var(--shadow); padding: 6px 0;
}
.gl-pop-title {
  padding: 8px 14px 4px; font-size: 11px; color: var(--text-muted); font-weight: 600; letter-spacing: .4px;
}
.gl-pop-item {
  display: block; width: 100%; text-align: left; padding: 8px 14px;
  background: transparent; border: none; color: var(--text-secondary);
  font-size: 13px; cursor: pointer;
}
.gl-pop-item:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
.gl-pop-item:disabled { opacity: .4; cursor: not-allowed; }

.gl-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
  background: var(--bg-elevated); border: 1px solid var(--border-strong); border-radius: 4px;
  color: var(--text); font-size: 13px; cursor: pointer; white-space: nowrap;
  transition: background .12s, border-color .12s;
}
.gl-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--text-muted); }
.gl-btn:disabled { opacity: .5; cursor: not-allowed; }
.gl-btn-sm { height: 26px; padding: 0 8px; font-size: 12px; }
.gl-btn-green { background: var(--success); border-color: var(--success); color: var(--on-accent); }
.gl-btn-green:hover:not(:disabled) { background: var(--success-hover); border-color: var(--success-hover); }
.gl-btn-orange { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.gl-btn-orange:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
.gl-btn.danger { color: var(--danger); border-color: var(--danger); }
.gl-btn.danger:hover:not(:disabled) { background: var(--bg-hover); }
.gl-btn-count {
  background: rgba(0, 0, 0, .18); color: #fff; border-radius: 999px;
  padding: 0 6px; font-size: 11px; line-height: 16px;
}
.gl-filter {
  height: 32px; width: 190px; padding: 0 10px; border: 1px solid var(--border);
  border-radius: 4px; font-size: 13px; color: var(--text); background: var(--bg-elevated); outline: none;
}
.gl-filter:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }

/* 卡片 */
.gl-card {
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 16px; overflow: hidden;
}
.gl-card-head {
  display: flex; align-items: center; gap: 8px; padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.gl-card-title { font-size: 14px; font-weight: 600; color: var(--text-strong); }
.gl-head-hint { margin-left: auto; font-size: 12px; color: var(--text-muted); }
.gl-count-pill {
  background: var(--bg-inset); color: var(--text-secondary); border-radius: 999px;
  padding: 0 8px; font-size: 12px; line-height: 18px;
}
.gl-plain-card { padding: 0; }
.gl-empty { padding: 36px; text-align: center; color: var(--text-muted); font-size: 13px; }
.gl-empty-card {
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
  padding: 48px; text-align: center; color: var(--text-muted);
}
.gl-loading { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }
.gl-alert {
  padding: 10px 14px; border-radius: 6px; margin-bottom: 14px; font-size: 13px;
  background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text);
}
.gl-alert.danger { background: var(--bg-inset); border-color: var(--danger); color: var(--danger); }
.gl-link { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 13px; }
.gl-link:hover { text-decoration: underline; }
.gl-muted { color: var(--text-muted); }
.gl-small { font-size: 12px; }
.gl-pad { padding: 16px; }
.gl-tip { padding: 12px 16px; font-size: 13px; color: var(--text-muted); border-top: 1px solid var(--border); }
.gl-tip code { background: var(--bg-inset); padding: 1px 5px; border-radius: 3px; }
.gl-pill {
  background: var(--accent-soft); color: var(--accent); border-radius: 999px;
  font-size: 11px; padding: 1px 8px; font-weight: 600;
}
.gl-finder-modal { width: 560px; }

/* 最新提交卡片 */
.gl-latest-commit {
  display: flex; align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
  margin-bottom: 16px; cursor: pointer;
}
.gl-latest-commit:hover { border-color: var(--border-strong); box-shadow: 0 1px 4px var(--shadow); }
.gl-commit-avatar {
  width: 32px; height: 32px; flex: 0 0 32px; border-radius: 50%; background: var(--bg-inset);
  color: var(--text-muted); display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.gl-latest-main { min-width: 0; flex: 1; }
.gl-latest-msg {
  font-size: 14px; color: var(--text); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gl-latest-msg b { color: var(--text-strong); margin-right: 6px; }
.gl-latest-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.gl-latest-sub b { color: var(--text-secondary); font-weight: 600; }
.gl-latest-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.gl-sha {
  font-family: Consolas, Monaco, monospace; font-size: 12px; color: var(--text-secondary);
  background: var(--bg-inset); border-radius: 4px; padding: 2px 7px;
}
.gl-copy {
  background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px;
  padding: 2px 4px; border-radius: 4px;
}
.gl-copy:hover { background: var(--bg-inset); color: var(--text); }

/* 文件表格 */
.gl-file-table-card { padding: 0; }
.gl-file-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.gl-file-table th {
  text-align: left; padding: 8px 16px; font-size: 12px; font-weight: 600;
  color: var(--text-secondary); background: var(--bg-inset); border-bottom: 1px solid var(--border);
}
.gl-file-table .col-name { width: 48%; }
.gl-file-table .col-time { width: 130px; }
.gl-file-table td {
  padding: 10px 16px; border-bottom: 1px solid var(--border); font-size: 14px;
  vertical-align: middle;
}
.gl-file-table tbody tr:last-child td { border-bottom: none; }
.gl-row { cursor: pointer; }
.gl-row:hover td { background: var(--bg-hover); }
.gl-fico { display: inline-block; width: 18px; text-align: center; margin-right: 8px; }
.gl-row-name { color: var(--text); }
.gl-row:hover .gl-row-name { color: var(--accent); }
.gl-commit-cell { color: var(--text-muted); font-size: 13px; }
.gl-row-msg {
  display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 100%;
}
.gl-time-cell { color: var(--text-muted); font-size: 12px; white-space: nowrap; }

/* 查找文件 */
.gl-finder { padding: 12px 16px; }
.gl-finder-input {
  width: 100%; height: 36px; border: 1px solid var(--border); border-radius: 6px;
  padding: 0 12px; font-size: 14px; outline: none; color: var(--text); box-sizing: border-box;
}
.gl-finder-input:focus { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.gl-finder-list { max-height: 300px; overflow-y: auto; margin-top: 8px; }
.gl-finder-item {
  padding: 7px 8px; border-radius: 4px; cursor: pointer; font-size: 13px;
  font-family: Consolas, Monaco, monospace; color: var(--text-secondary);
}
.gl-finder-item:hover { background: var(--bg-hover); color: var(--text); }

/* 文件查看 */
.gl-file-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 14px; flex-wrap: wrap;
}
.gl-file-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.gl-back-inline {
  width: 26px; height: 26px; border: 1px solid var(--border); border-radius: 4px;
  background: var(--bg-elevated); color: var(--text-secondary); cursor: pointer; font-size: 13px;
  margin-right: 2px;
}
.gl-back-inline:hover { background: var(--bg-hover); }
.gl-file-name {
  font-family: Consolas, Monaco, monospace; font-size: 14px; font-weight: 600; color: var(--text-strong);
}
.gl-file-size, .gl-file-sha {
  font-size: 12px; color: var(--text-muted); background: var(--bg-inset);
  border-radius: 10px; padding: 1px 8px; max-width: 320px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gl-file-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gl-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.gl-seg-btn {
  height: 30px; padding: 0 12px; background: var(--bg-elevated); border: none; border-right: 1px solid var(--border);
  font-size: 12px; color: var(--text-secondary); cursor: pointer;
}
.gl-seg-btn:last-child { border-right: none; }
.gl-seg-btn.active { background: var(--bg-inset); color: var(--text-strong); font-weight: 600; }

/* 代码区（跟随主题） */
.gl-code-card { background: var(--code-bg); border-top: 1px solid var(--border); overflow: hidden; }
.gl-code-view { display: flex; align-items: stretch; overflow: auto; flex: 1; min-height: calc(100vh - 240px); max-height: calc(100vh - 240px); background: var(--code-bg); }
.gl-code-gutter {
  flex: 0 0 auto; min-width: 52px; padding: 12px 0; background: var(--code-gutter-bg);
  color: var(--text-muted); font-family: Consolas, 'Cascadia Code', monospace;
  font-size: 13px; line-height: 1.6; text-align: right; user-select: none;
  border-right: 1px solid var(--border);
}
.gl-code-gutter div { padding: 0 10px; height: 20.8px; }
.gl-code-pre {
  flex: 1; margin: 0; padding: 12px 16px; background: var(--code-bg);
  font-family: Consolas, 'Cascadia Code', monospace; font-size: 13px;
  line-height: 1.6; color: var(--code-text); white-space: pre; tab-size: 2;
}
.gl-code-pre :deep(code.hljs) {
  background: transparent !important; padding: 0 !important;
  font-family: inherit; font-size: inherit; line-height: inherit;
}
.gl-code-view :deep(.hljs-comment), .gl-code-view :deep(.hljs-quote) { color: var(--code-comment); }
.gl-code-view :deep(.hljs-keyword), .gl-code-view :deep(.hljs-selector-tag),
.gl-code-view :deep(.hljs-literal), .gl-code-view :deep(.hljs-type) { color: var(--code-keyword); }
.gl-code-view :deep(.hljs-string), .gl-code-view :deep(.hljs-doctag),
.gl-code-view :deep(.hljs-regexp) { color: var(--code-string); }
.gl-code-view :deep(.hljs-title), .gl-code-view :deep(.hljs-section),
.gl-code-view :deep(.hljs-name), .gl-code-view :deep(.hljs-selector-id),
.gl-code-view :deep(.hljs-selector-class) { color: var(--code-title); }
.gl-code-view :deep(.hljs-attr), .gl-code-view :deep(.hljs-attribute),
.gl-code-view :deep(.hljs-variable), .gl-code-view :deep(.hljs-template-variable) { color: var(--code-attr); }
.gl-code-view :deep(.hljs-number), .gl-code-view :deep(.hljs-built_in),
.gl-code-view :deep(.hljs-symbol), .gl-code-view :deep(.hljs-bullet) { color: var(--code-number); }
.gl-code-view :deep(.hljs-tag) { color: var(--code-tag); }
.gl-code-view :deep(.hljs-subst) { color: var(--code-subst); }
.gl-editor { background: var(--code-bg) !important; color: var(--code-text) !important; min-height: calc(100vh - 260px); }

/* 文件历史 */
.file-history-modal { width: 640px; }
.fh-list { max-height: 50vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
.fh-empty { padding: 22px; text-align: center; font-size: 13px; color: var(--text-muted); }
.fh-item { display: flex; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.fh-item:last-child { border-bottom: none; }
.fh-sha { flex: 0 0 auto; padding-top: 2px; font-family: Consolas, monospace; font-size: 12px; color: var(--accent); }
.fh-main { min-width: 0; }
.fh-msg {
  font-size: 13px; color: var(--text-strong);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.fh-sub { margin-top: 2px; font-size: 12px; color: var(--text-muted); }

/* 提交列表 */
.gl-commit-groups { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.gl-commit-group + .gl-commit-group { border-top: 1px solid var(--border); }
.gl-group-head {
  display: flex; align-items: baseline; gap: 8px; padding: 10px 16px;
  background: var(--bg-inset); border-bottom: 1px solid var(--border);
  font-size: 13px; font-weight: 600; color: var(--text-secondary);
}
.gl-group-count { font-size: 12px; color: var(--text-muted); font-weight: 400; }
.gl-commit-row { display: flex; gap: 12px; padding: 12px 16px; cursor: pointer; align-items: flex-start; }
.gl-commit-row:hover { background: var(--bg-hover); }
.gl-commit-ico { width: 18px; text-align: center; color: var(--text-muted); font-size: 13px; flex-shrink: 0; margin-top: 2px; }
.gl-commit-main { flex: 1; min-width: 0; }
.gl-commit-msg {
  font-size: 14px; font-weight: 600; color: var(--text-strong); line-height: 1.4;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gl-commit-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.gl-commit-sub b { color: var(--text-secondary); }
.gl-commit-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* 提交详情 */
.gl-back-btn { margin-bottom: 12px; }
.gl-detail-card { padding: 0; }
.gl-detail-head { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.gl-detail-meta { flex: 1; min-width: 0; }
.gl-detail-title { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.gl-detail-title .gl-muted { font-weight: 400; margin-left: 6px; font-size: 12px; }
.gl-detail-actions { display: flex; align-items: center; gap: 8px; }
.gl-detail-msg {
  margin: 0; padding: 16px; font-size: 20px; font-weight: 600; color: var(--text-strong);
  line-height: 1.4; white-space: pre-wrap; word-break: break-word;
}
.gl-parent-pill {
  display: inline-block; margin: 0 16px 14px; padding: 3px 10px;
  background: var(--bg-inset); border-radius: 999px; font-size: 12px; color: var(--text-secondary);
  font-family: Consolas, Monaco, monospace;
}
.gl-diff-summary {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 13px; color: var(--text-secondary); padding: 4px 2px 12px;
}
.gl-diff-summary .stat-add, .gl-diff-summary .stat-del { font-weight: 600; }
.gl-view-toggle { margin-left: auto; display: inline-flex; border: 1px solid var(--border); border-radius: 4px; overflow: hidden; }
.gl-view-toggle button {
  height: 28px; padding: 0 12px; font-size: 12px; background: var(--bg-elevated); border: none;
  border-right: 1px solid var(--border); color: var(--text-secondary); cursor: pointer;
}
.gl-view-toggle button:last-child { border-right: none; }
.gl-view-toggle button.active { background: var(--bg-inset); color: var(--text-strong); font-weight: 600; }
.gl-file-diff { margin-bottom: 14px; }
.gl-file-diff-head {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  background: var(--bg-inset); border-bottom: 1px solid var(--border);
}
.gl-file-diff-name {
  flex: 1; min-width: 0; font-family: Consolas, Monaco, monospace; font-size: 13px;
  color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.gl-diff-stat { display: flex; gap: 8px; font-family: Consolas, monospace; font-size: 12px; }
.gl-sbs { border: none; border-radius: 0; max-height: 520px; }

/* 内联 diff */
.gl-inline-diff { max-height: 520px; overflow: auto; background: var(--bg-elevated); font-family: Consolas, 'Cascadia Code', monospace; font-size: 13px; }
.gl-inline-row { display: flex; align-items: stretch; line-height: 1.6; white-space: pre; min-height: 20.8px; }
.gl-inline-ln {
  flex: 0 0 46px; width: 46px; text-align: right; padding: 0 6px;
  color: var(--text-muted); font-size: 11px; user-select: none;
  background: var(--bg-inset); border-right: 1px solid var(--border);
  display: flex; align-items: center; justify-content: flex-end;
}
.gl-inline-sign { flex: 0 0 18px; width: 18px; text-align: center; color: var(--text-muted); }
.gl-inline-code { flex: 1; margin: 0; padding: 0 8px; font-family: inherit; font-size: inherit; line-height: inherit; }
.gl-inline-row.il-add { background: rgba(63, 185, 80, .12); }
.gl-inline-row.il-add .gl-inline-code { color: var(--success); }
.gl-inline-row.il-del { background: rgba(248, 81, 73, .12); }
.gl-inline-row.il-del .gl-inline-code { color: var(--danger); }
.gl-inline-row.il-ctx .gl-inline-code { color: var(--text-secondary); }

/* 分支 / 标签 / 贡献者 / 活动 */
.gl-branch-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.gl-branch-row:last-child { border-bottom: none; }
.gl-branch-row.active { background: var(--accent-soft); }
.gl-branch-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.gl-branch-name { font-family: Consolas, Monaco, monospace; font-size: 13px; color: var(--text); }
.gl-branch-actions { display: flex; gap: 8px; }
.gl-tag-list { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.gl-tag-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.gl-tag-row:last-child { border-bottom: none; }
.gl-tag-ico { font-size: 16px; }
.gl-tag-main { flex: 1; min-width: 0; }
.gl-tag-name { font-size: 14px; font-weight: 600; color: var(--text-strong); word-break: break-all; }
.gl-tag-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.gl-tag-dot { color: var(--text-muted); }
.gl-tag-actions { display: flex; align-items: center; gap: 2px; }
.gl-release-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gl-badge {
  font-size: 11px; padding: 1px 7px; border-radius: 10px;
  background: var(--bg); color: var(--text-muted); border: 1px solid var(--border);
}
.gl-badge.warn { background: rgba(212, 167, 44, 0.15); color: #d4a72c; border-color: rgba(212, 167, 44, 0.5); }
.gl-release-body {
  font-size: 12px; color: var(--text-muted); margin-top: 6px; line-height: 1.6;
  white-space: pre-wrap; max-height: 56px; overflow: hidden;
}
.gl-icon-act {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: transparent; border: none; border-radius: 4px; color: var(--text-muted);
  cursor: pointer; font-size: 14px;
}
.gl-icon-act:hover { background: var(--bg-inset); color: var(--text); }
.gl-icon-act.danger:hover { background: var(--bg-hover); color: var(--danger); }
.gl-contributor-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.gl-contributor-row:last-child { border-bottom: none; }
.gl-contributor-avatar {
  width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; background: var(--bg-inset); color: var(--text-secondary);
  font-size: 12px; font-weight: 600; object-fit: cover;
}
.gl-contributor-name { flex: 1; font-size: 14px; color: var(--text); }
.gl-contributor-count { font-size: 12px; color: var(--text-muted); }
.gl-activity-row { display: flex; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.gl-activity-row:last-child { border-bottom: none; }
.gl-activity-type { width: 24px; text-align: center; font-size: 16px; flex-shrink: 0; }
.gl-activity-main { flex: 1; min-width: 0; }
.gl-activity-title { font-size: 13px; color: var(--text); }
.gl-activity-time { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

/* 列表行可点击查看详情 */
.gl-tag-row.clickable, .gl-activity-row.clickable { cursor: pointer; }
.gl-tag-row.clickable:hover, .gl-activity-row.clickable:hover { background: var(--bg-hover); }

/* 详情弹窗 */
.modal.detail-modal { width: 680px; max-width: 92vw; }
.detail-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px;
  margin-top: 10px; font-size: 12px; color: var(--text-secondary);
}
.detail-break { word-break: break-all; }
.detail-markdown {
  margin-top: 16px; padding: 14px 16px; border: 1px solid var(--border);
  border-radius: 8px; background: var(--bg); max-height: 46vh; overflow-y: auto;
}
.detail-assets { margin-top: 16px; }
.detail-section-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 8px; }
.detail-asset {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px;
}
.detail-asset:last-child { border-bottom: none; }
.detail-asset-name { flex: 1; color: var(--text); word-break: break-all; }
.detail-asset-size { color: var(--text-muted); white-space: nowrap; }
.detail-asset-download {
  flex-shrink: 0; padding: 3px 10px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-elevated); color: var(--text);
}
.detail-asset-download:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.detail-asset-download:disabled { opacity: .6; cursor: default; }
.detail-commit-row {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px;
}
.detail-commit-row:last-child { border-bottom: none; }
.detail-commit-msg { flex: 1; min-width: 0; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-commit-author { color: var(--text-muted); white-space: nowrap; }

/* 项目信息 / 占位 */
.gl-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; padding: 16px; font-size: 13px; }
.gl-info-k { color: var(--text-muted); margin-right: 8px; }
.gl-readme { max-width: none; padding: 20px 24px; }
.gl-placeholder { padding: 64px 24px; text-align: center; }
.gl-ph-icon { font-size: 42px; margin-bottom: 12px; }
.gl-placeholder h3 { margin: 0 0 8px; font-size: 18px; color: var(--text-strong); }
.gl-placeholder p { margin: 0 0 16px; }

/* 覆盖统计色 */
.gl-app .stat-add { color: var(--success); }
.gl-app .stat-del { color: var(--danger); }

/* ========== 本地改动工作区（changes tab） ========== */
.changes-workspace { display: flex; flex-direction: column; gap: 14px; }
.changes-toolbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; background: var(--bg-elevated);
  border: 1px solid var(--border); border-radius: 8px;
}
.changes-spacer { flex: 1; }
.changes-sync-chip {
  font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
  border: 1px solid transparent; line-height: 16px;
}
.changes-sync-chip.behind { background: var(--warn-bg); color: var(--warn-text); border-color: var(--warn-border); }
.changes-sync-chip.ahead { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }

.changes-body { display: flex; gap: 16px; align-items: stretch; }
.changes-file-list {
  width: 340px; flex: 0 0 340px; max-height: 62vh; overflow: auto;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
}
.changes-file-list .change-group { border-bottom: 1px solid var(--border); }
.changes-file-list .change-item { cursor: pointer; }
.changes-file-list .change-item.selected { background: var(--accent-soft); }
.change-check {
  margin: 0 2px 0 0; accent-color: var(--accent); cursor: pointer;
  flex-shrink: 0; width: 14px; height: 14px;
}

.changes-diff-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.changes-diff-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 8px 12px; background: var(--bg-elevated);
  border: 1px solid var(--border); border-radius: 8px;
}
.changes-diff-path {
  font-size: 13px; color: var(--text); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; max-width: 50%;
}
.changes-diff-mode {
  font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent);
}
.changes-sbs { max-height: 62vh; flex: 1; min-height: 280px; }
.changes-empty, .changes-diff-empty {
  padding: 48px 20px; text-align: center; color: var(--text-muted); font-size: 14px;
  background: var(--bg-elevated); border: 1px dashed var(--border); border-radius: 8px;
}
.changes-diff-empty { flex: 1; display: flex; align-items: center; justify-content: center; }

/* 提交表单 */
.commit-box {
  padding: 14px; background: var(--bg-elevated); border: 1px solid var(--border);
  border-radius: 8px; display: flex; flex-direction: column; gap: 10px;
}
.commit-subject {
  padding: 9px 12px; font-size: 14px; font-weight: 600;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 6px; outline: none;
}
.commit-subject:focus { border-color: var(--accent); }
.commit-body {
  padding: 9px 12px; font-size: 13px; resize: vertical; font-family: inherit;
  background: var(--bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 6px; outline: none;
}
.commit-body:focus { border-color: var(--accent); }
.commit-box-row { display: flex; align-items: center; gap: 10px; }
.commit-count { font-size: 12px; color: var(--text-muted); }
.commit-count b { color: var(--text-strong); }
.commit-spacer { flex: 1; }
.commit-result { font-size: 13px; color: var(--text-strong); }

/* 侧边栏改动数量徽标 */
.nav-count-badge {
  margin-left: auto; background: var(--accent); color: var(--on-accent);
  border-radius: 999px; padding: 0 7px; font-size: 11px; font-weight: 600; line-height: 18px;
}
.gl-sidebar.collapsed .nav-count-badge { display: none; }
</style>
