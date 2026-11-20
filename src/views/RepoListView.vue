<template>
  <div class="repo-list">
    <header class="top-bar">
      <div class="brand">
        <img src="../assets/logo.png" alt="logo" class="brand-img" />
        <span class="title">Git Repo Manager</span>
      </div>
      <div class="user-info">
        <span class="username">@{{ username }}</span>
        <button class="btn-logout" @click="logout">退出</button>
      </div>
    </header>

    <div class="tabs">
      <button :class="['tab', activeTab === 'mine' ? 'active' : '']" @click="switchTab('mine')">远程仓库</button>
      <button :class="['tab', activeTab === 'local' ? 'active' : '']" @click="switchTab('local')">本地仓库</button>
      <button :class="['tab', activeTab === 'starred' ? 'active' : '']" @click="switchTab('starred')">星标仓库</button>
      <button :class="['tab', activeTab === 'popular' ? 'active' : '']" @click="switchTab('popular')">热门仓库</button>
      <div class="spacer"></div>
      <button
        class="btn-search btn-refresh"
        :disabled="loading"
        :title="activeTab === 'local' ? '重新读取本地仓库列表与统计' : '重新从 GitHub 拉取仓库列表'"
        @click="refreshList"
      >{{ loading ? '刷新中...' : '🔄 刷新' }}</button>
      <button class="btn-search" @click="openSearch">🔍 搜索</button>
    </div>

    <div v-if="searchKeyword" class="search-result-bar">
      <span>搜索「{{ searchKeyword }}」共 {{ repos.length }} 个结果</span>
      <button class="btn-clear-search" @click="clearSearch">返回列表</button>
    </div>

    <div class="content">
      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <div v-else-if="repos.length === 0" class="empty">暂无数据</div>
      <div v-else class="repo-grid">
        <div
          v-for="repo in repos"
          :key="repo.id"
          class="repo-card"
          @click="$emit('open-repo', repo)"
        >
          <!-- 本地仓库移除入口 -->
          <button
            v-if="repo._isLocal || activeTab === 'local'"
            class="btn-delete"
            title="从列表移除（不会删除磁盘文件）"
            @click.stop="removeLocal(repo)"
          >移除</button>
          <div class="repo-header">
            <span class="owner">{{ repo.owner?.login || repo.full_name?.split('/')[0] }}</span>
            <span class="sep">/</span>
            <span class="repo-name">{{ repo.name }}</span>
            <span
              v-if="repo.private === true || repo.private === false"
              class="vis-badge"
              :class="repo.private ? 'is-private' : 'is-public'"
            >{{ repo.private ? '私有' : '公开' }}</span>
          </div>
          <div class="repo-desc">{{ repo.description || '暂无描述' }}</div>
          <div class="repo-meta">
            <!-- 本地仓库：展示文件数 / 目录数 / 待提交改动 -->
            <template v-if="repo._isLocal">
              <span class="meta">📄 {{ localStats[repo.id] ? localStats[repo.id].files : '…' }} 个文件</span>
              <span class="meta">📁 {{ localStats[repo.id] ? localStats[repo.id].dirs : '…' }} 个目录</span>
              <span
                v-if="localStats[repo.id] && localStats[repo.id].pending"
                class="pending-badge"
              >待提交 {{ localStats[repo.id].pending }}</span>
            </template>
            <template v-else>
              <span v-if="repo.language" class="lang">
                <span class="lang-dot" :style="{ background: langColor(repo.language) }"></span>
                {{ repo.language }}
              </span>
              <span class="meta">⭐ {{ formatCount(repo.stargazers_count) }}</span>
              <span class="meta">🍴 {{ formatCount(repo.forks_count) }}</span>
              <span v-if="repo.pushed_at || repo.updated_at" class="meta">更新 {{ formatDate(repo.pushed_at || repo.updated_at) }}</span>
            </template>
          </div>
          <div v-if="repo._localPath" class="local-badge">📁 本地: {{ repo._localPath }}</div>
        </div>
      </div>
    </div>

    <div class="bottom-bar">
      <span v-if="repos.length">共 {{ repos.length }} 个仓库</span>
      <span v-if="lastRefresh" class="refresh-at">更新于 {{ formatClock(lastRefresh) }}</span>
      <span class="spacer"></span>
      <button v-if="activeTab !== 'local'" class="btn-import" @click="openCreate">➕ 新建仓库</button>
      <button class="btn-import" @click="openManage">⚙️ 管理</button>
      <button v-if="activeTab === 'local'" class="btn-import" @click="importLocal">➕ 导入本地仓库</button>
    </div>

    <!-- 搜索仓库 -->
    <div v-if="showSearch" class="modal-mask" @click.self="showSearch = false">
      <div class="modal search-modal">
        <h3>🔍 搜索 GitHub 仓库</h3>
        <p class="modal-desc">支持仓库名、描述与关键字，例如 vue、electron、rust。</p>
        <input
          ref="searchInput"
          v-model="searchQ"
          placeholder="输入关键字后回车搜索"
          @keyup.enter="doSearch"
        />
        <div class="modal-actions">
          <button class="btn-secondary" @click="showSearch = false">取消</button>
          <button class="btn-primary" :disabled="!searchQ.trim()" @click="doSearch">搜索</button>
        </div>
      </div>
    </div>

    <!-- 新建仓库 -->
    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="modal">
        <h3>➕ 新建仓库</h3>
        <p class="modal-desc">将在 GitHub 账号下创建仓库，可选择同时克隆到本地。</p>
        <label>仓库名称</label>
        <input v-model="createForm.name" placeholder="my-new-repo" />
        <label>描述（可选）</label>
        <input v-model="createForm.description" placeholder="仓库描述" />
        <label class="check-row">
          <input v-model="createForm.isPrivate" type="checkbox" />
          <span>私有仓库</span>
        </label>
        <label class="check-row">
          <input v-model="createForm.autoInit" type="checkbox" />
          <span>初始化 README.md</span>
        </label>
        <label>.gitignore 模板</label>
        <select v-model="createForm.gitignore">
          <option value="">不添加</option>
          <option value="Node">Node.js</option>
          <option value="Python">Python</option>
          <option value="Java">Java</option>
          <option value="Go">Go</option>
          <option value="Rust">Rust</option>
          <option value="C++">C++</option>
          <option value="VisualStudio">Visual Studio</option>
          <option value="macOS">macOS</option>
          <option value="Linux">Linux</option>
          <option value="Windows">Windows</option>
        </select>
        <label>开源许可证</label>
        <select v-model="createForm.license">
          <option value="">不添加</option>
          <option value="mit">MIT</option>
          <option value="apache-2.0">Apache License 2.0</option>
          <option value="gpl-3.0">GNU GPL v3.0</option>
          <option value="bsd-3-clause">BSD 3-Clause</option>
          <option value="mpl-2.0">Mozilla Public License 2.0</option>
          <option value="unlicense">The Unlicense（公共领域）</option>
        </select>
        <label class="check-row">
          <input v-model="createForm.cloneLocal" type="checkbox" />
          <span>创建后克隆到本地</span>
        </label>
        <div v-if="createForm.cloneLocal" class="dir-row">
          <input :value="createForm.dir || '(请选择目录)'" readonly />
          <button class="btn-browse" @click="chooseCreateDir">浏览...</button>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showCreate = false">取消</button>
          <button
            class="btn-primary"
            :disabled="creating || !createForm.name.trim() || (createForm.cloneLocal && !createForm.dir)"
            @click="submitCreate"
          >{{ creating ? '创建中...' : '创建' }}</button>
        </div>
      </div>
    </div>

    <!-- 管理仓库 -->
    <div v-if="showManage" class="modal-mask" @click.self="showManage = false">
      <div class="modal manage-modal">
        <h3>⚙️ 管理仓库</h3>
        <p class="modal-desc">当前列表共 {{ repos.length }} 个仓库</p>
        <div class="manage-list">
          <div v-if="!repos.length" class="manage-empty">暂无仓库</div>
          <div v-for="r in repos" :key="r.id || r.full_name" class="manage-row">
            <div class="manage-name">
              <b>{{ r.name }}</b>
              <span class="manage-sub">{{ r._isLocal ? (r._localPath || '本地') : r.full_name }}</span>
            </div>
            <div class="manage-actions">
              <button v-if="r._isLocal && r._localPath" class="mini-btn" @click="openLocalDir(r)">打开目录</button>
              <button v-if="r.owner?.login && !r._isLocal" class="mini-btn" @click="openOnGithub(r)">GitHub</button>
              <button v-if="r._isLocal" class="mini-btn danger" @click="removeLocal(r)">移除记录</button>
              <button v-else class="mini-btn danger" @click="deleteRemoteRepo(r)">删除远程</button>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" @click="showManage = false">关闭</button>
        </div>
      </div>
    </div>
    <!-- 删除远程仓库二次确认 -->
    <div v-if="showDelete" class="modal-mask" @click.self="showDelete = false">
      <div class="modal">
        <h3>⚠️ 删除远程仓库</h3>
        <p class="modal-desc">
          该操作会永久删除 GitHub 上的 <b>{{ deleteTarget?.full_name }}</b>，无法恢复。<br>
          请输入仓库名 <code>{{ deleteTarget?.name }}</code> 以确认：
        </p>
        <input v-model="deleteInput" :placeholder="deleteTarget?.name" />
        <div class="modal-actions">
          <button class="btn-secondary" @click="showDelete = false">取消</button>
          <button
            class="btn-danger"
            :disabled="deleting || deleteInput.trim() !== deleteTarget?.name"
            @click="confirmDeleteRemote"
          >{{ deleting ? '删除中...' : '确认删除' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 模块级缓存：组件卸载（进入仓库详情）后重新挂载时仍可复用，避免来回切换重复请求
const repoListCache = { mine: null, starred: null, local: null, popular: null, tab: 'mine', lastRefresh: 0 }
</script>

<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import { getUserRepos, getStarredRepos, getPopularRepos, searchRepositories, createRepo, deleteRepo } from '../api/github.js'

const props = defineProps({ username: String })
const emit = defineEmits(['open-repo', 'logout'])

const activeTab = ref(repoListCache.tab)
const repos = ref([])
const localStats = ref({})   // { repoId: { files, dirs, pending } }
const loading = ref(false)
const error = ref('')
const showSearch = ref(false)
const searchQ = ref('')
const searchKeyword = ref('')
const searchInput = ref(null)
const lastRefresh = ref(repoListCache.lastRefresh)

const langColors = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Vue: '#41b883', HTML: '#e34c26',
  CSS: '#563d7c', Python: '#3572A5', Java: '#b07219', Go: '#00ADD8', Rust: '#dea584',
  C: '#555555', 'C++': '#f34b7d', Shell: '#89e051', Ruby: '#701516', PHP: '#4F5D95'
}
function langColor (l) { return langColors[l] || '#8b949e' }

function formatCount (n) {
  if (!n) return 0
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n
}
function formatDate (iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()   // 毫秒
  if (diff < 0) return '刚刚'
  const sec = Math.floor(diff / 1000)
  if (sec < 15) return '刚刚'
  if (sec < 60) return `${sec} 秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day} 天前`
  if (day < 30) return `${Math.floor(day / 7)} 周前`
  if (day < 365) return `${Math.floor(day / 30)} 个月前`
  return d.toLocaleDateString()
}

function formatClock (ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 每个标签页缓存一份结果，切换 / 返回列表时直接复用，避免重复请求
const tabCache = repoListCache

async function loadRepos (force = false) {
  const tab = activeTab.value
  if (!force && tabCache[tab]) {
    loading.value = false
    repos.value = tabCache[tab]
    if (tab === 'local') await loadLocalStats()
    return
  }
  loading.value = true
  error.value = ''
  try {
    let list = []
    let cfg = null
    if (tab === 'mine') {
      list = await getUserRepos(1)
    } else if (tab === 'starred') {
      list = await getStarredRepos(1)
    } else if (tab === 'popular') {
      list = await getPopularRepos()
    } else if (tab === 'local') {
      cfg = await window.electronAPI.getConfig()
      list = cfg.repositories || []
    }
    tabCache[tab] = list
    tabCache.lastRefresh = Date.now()
    lastRefresh.value = tabCache.lastRefresh
    // 切换后已离开该 tab：丢弃过期响应，避免覆盖当前 tab 的列表
    if (tab !== activeTab.value) return
    repos.value = list
    if (tab === 'local') await loadLocalStats(cfg)
  } catch (e) {
    if (tab === activeTab.value) error.value = formatErr(e)
  } finally {
    if (tab === activeTab.value) loading.value = false
  }
}

// 本地仓库统计：文件数 / 目录数 / 待提交改动数
async function loadLocalStats (cfg) {
  const pendingMap = cfg?.pendingChanges || (await window.electronAPI.getConfig()).pendingChanges || {}
  const stats = {}
  for (const r of repos.value) {
    if (!r._localPath) continue
    try {
      const list = await window.electronAPI.listDir(r._localPath, true)
      let pending = (pendingMap[r.id] || []).length
      // 优先用 git 真实工作区改动数
      try {
        const gs = await window.electronAPI.gitStatus(r._localPath)
        if (gs && gs.ok) pending = gs.files.length
      } catch { /* 无 git 时用应用内记录 */ }
      stats[r.id] = {
        files: list.filter(f => !f.isDir).length,
        dirs: list.filter(f => f.isDir).length,
        pending
      }
    } catch {
      stats[r.id] = { files: 0, dirs: 0, pending: (pendingMap[r.id] || []).length }
    }
  }
  localStats.value = stats
}

// 清理 Electron IPC 加的冗余前缀，只保留真正的错误内容
function formatErr (e) {
  let msg = e?.message || String(e)
  // Electron 会包装成 "Error invoking remote method 'api:request': <真正错误>"
  msg = msg.replace(/^Error invoking remote method '[^']+':\s*/, '')
  return msg || '未知错误'
}

function switchTab (tab) {
  if (tab === activeTab.value) return
  activeTab.value = tab
  showSearch.value = false
  searchKeyword.value = ''
  // 命中缓存时直接复用，不再发起请求
  loadRepos()
}

async function doSearch () {
  if (!searchQ.value.trim()) return
  searchKeyword.value = searchQ.value.trim()
  showSearch.value = false
  loading.value = true
  error.value = ''
  try {
    const res = await searchRepositories(searchKeyword.value, 1, 30)
    repos.value = res.items || []
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    loading.value = false
  }
}

function openSearch () {
  showSearch.value = true
  nextTick(() => searchInput.value?.focus())
}

function clearSearch () {
  searchKeyword.value = ''
  searchQ.value = ''
  loadRepos()
}

// 手动刷新列表：重新拉取当前标签页数据
async function refreshList () {
  searchKeyword.value = ''
  await loadRepos(true)
}

async function importLocal () {
  const dir = await window.electronAPI.selectDir()
  if (!dir) return
  const name = dir.split(/[\\/]/).pop()
  const local = {
    id: 'local_' + Date.now(),
    name,
    full_name: 'local/' + name,
    owner: { login: 'local' },
    description: '本地仓库',
    _localPath: dir,
    _isLocal: true
  }
  const cfg = await window.electronAPI.getConfig()
  const list = cfg.repositories || []
  list.push(local)
  await window.electronAPI.setConfig('repositories', list)
  repos.value = list
  tabCache.local = list
  // 立即统计文件/目录数，避免新导入的仓库先显示"…"
  await loadLocalStats()
}

async function removeLocal (repo) {
  const ok = window.confirm(`确定从列表移除本地仓库「${repo.name}」吗？\n\n仅移除列表记录，不会删除磁盘上的文件。`)
  if (!ok) return
  const cfg = await window.electronAPI.getConfig()
  const list = (cfg.repositories || []).filter(r => r.id !== repo.id)
  await window.electronAPI.setConfig('repositories', list)
  repos.value = list
  tabCache.local = list
}

// ===== 新建 / 管理仓库 =====
const showCreate = ref(false)
const showManage = ref(false)
const creating = ref(false)
const showDelete = ref(false)
const deleteTarget = ref(null)
const deleteInput = ref('')
const deleting = ref(false)
const createForm = reactive({
  name: '',
  description: '',
  isPrivate: false,
  autoInit: false,
  gitignore: '',
  license: '',
  cloneLocal: true,
  dir: ''
})

function openCreate () {
  createForm.name = ''
  createForm.description = ''
  createForm.isPrivate = false
  createForm.autoInit = false
  createForm.gitignore = ''
  createForm.license = ''
  createForm.cloneLocal = true
  createForm.dir = ''
  showCreate.value = true
}

async function chooseCreateDir () {
  const dir = await window.electronAPI.selectDir()
  if (dir) createForm.dir = dir
}

async function addLocalEntry (repo, dir) {
  try {
    const cfg = await window.electronAPI.getConfig()
    const list = cfg.repositories || []
    if (list.some(r => r._localPath === dir)) return
    list.push({
      id: 'local_' + Date.now(),
      name: repo.name,
      full_name: repo.full_name,
      owner: repo.owner || { login: props.username },
      description: repo.description || '新建仓库',
      _localPath: dir,
      _isLocal: true
    })
    await window.electronAPI.setConfig('repositories', list)
    tabCache.local = list
  } catch { /* 记账失败不影响创建结果 */ }
}

async function submitCreate () {
  const name = createForm.name.trim()
  if (!name) return
  creating.value = true
  try {
    const repo = await createRepo({
      name,
      description: createForm.description.trim(),
      private: createForm.isPrivate,
      auto_init: createForm.autoInit,
      ...(createForm.gitignore ? { gitignore_template: createForm.gitignore } : {}),
      ...(createForm.license ? { license_template: createForm.license } : {})
    })
    let tip = `仓库 ${repo.full_name} 创建成功。`
    if (createForm.cloneLocal && createForm.dir) {
      const target = createForm.dir.replace(/[\\/]+$/, '') + '\\' + repo.name
      const res = await window.electronAPI.gitClone({ remoteUrl: repo.clone_url, targetDir: target })
      if (res.ok) {
        await addLocalEntry(repo, target)
        tip += `\n已克隆到 ${target}，并加入本地仓库列表。`
      } else {
        tip += `\n但克隆失败：${res.message || '未知错误'}`
      }
    }
    showCreate.value = false
    tabCache.mine = null
    await loadRepos(true)
    alert(tip)
  } catch (e) {
    alert('创建失败：' + formatErr(e))
  } finally {
    creating.value = false
  }
}

function openManage () {
  showManage.value = true
}

function openLocalDir (r) {
  if (r._localPath) window.electronAPI.openPath(r._localPath)
}

function openOnGithub (r) {
  const login = r.owner?.login
  if (login) window.electronAPI.openExternal(`https://github.com/${login}/${r.name}`)
}

async function deleteRemoteRepo (r) {
  if (!r.owner?.login) return
  deleteTarget.value = r
  deleteInput.value = ''
  showDelete.value = true
}

async function confirmDeleteRemote () {
  const r = deleteTarget.value
  if (!r) return
  if (deleteInput.value.trim() !== r.name) return
  deleting.value = true
  try {
    await deleteRepo(r.owner.login, r.name)
    const list = repos.value.filter(x => x !== r)
    repos.value = list
    tabCache[activeTab.value] = list
    showDelete.value = false
  } catch (e) {
    alert('删除失败：' + formatErr(e))
  } finally {
    deleting.value = false
  }
}

function logout () {
  emit('logout')
}

onMounted(async () => {
  // 恢复上次停留的标签页（从仓库详情返回时保持一致）
  try {
    const cfg = await window.electronAPI.getConfig()
    if (['mine', 'starred', 'local', 'popular'].includes(cfg.listTab)) activeTab.value = cfg.listTab
  } catch { /* 忽略 */ }
  await loadRepos()
})

// 记住当前标签页
watch(activeTab, (tab) => {
  repoListCache.tab = tab
  window.electronAPI.setConfig('listTab', tab).catch(() => {})
})
</script>

<style scoped>
.repo-list { display: flex; flex-direction: column; height: 100vh; background: var(--bg); color: var(--text); }
.top-bar {
  display: flex; align-items: center; padding: 12px 52px 12px 20px;
  background: var(--header-bg); color: var(--header-text);
}
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 16px; }
.brand-img { width: 24px; height: 24px; border-radius: 6px; }
.title { margin-left: 4px; }
.user-info { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.username { font-size: 13px; opacity: .85; }
.btn-logout {
  background: transparent; border: 1px solid var(--header-btn-border); color: var(--header-text); padding: 4px 12px;
  border-radius: 6px; cursor: pointer; font-size: 12px;
}
.btn-logout:hover { background: var(--header-btn-bg); }

.tabs {
  display: flex; align-items: center; padding: 0 20px; background: var(--bg-elevated);
  border-bottom: 1px solid var(--border); height: 44px;
}
.tab {
  padding: 8px 16px; background: transparent; border: none; cursor: pointer;
  font-size: 13px; color: var(--text-secondary); border-bottom: 2px solid transparent;
}
.tab:hover { color: var(--text); }
.tab.active { color: var(--text); border-bottom-color: #fd8c73; font-weight: 600; }
.spacer { flex: 1; }
.btn-search {
  padding: 6px 14px; border: 1px solid var(--border); background: var(--bg-elevated); border-radius: 6px;
  cursor: pointer; font-size: 12px; color: var(--text);
}
.btn-search:hover { background: var(--bg-hover); }
.btn-search:disabled { opacity: .6; cursor: not-allowed; }
.btn-refresh { margin-right: 8px; }

.search-result-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 20px; background: var(--accent-soft); border-bottom: 1px solid var(--border);
  font-size: 13px; color: var(--text-secondary);
}
.btn-clear-search {
  margin-left: auto; padding: 4px 12px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 999px;
  background: var(--bg-elevated); color: var(--text);
}
.btn-clear-search:hover { border-color: var(--accent); color: var(--accent); }
.search-modal { width: 480px; max-width: 92vw; }

.content { flex: 1; overflow: auto; padding: 16px 20px; }
.loading, .error, .empty { text-align: center; padding: 60px; color: var(--text-muted); }
.error { color: var(--danger); }

.repo-grid {
  display: grid; gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}
.repo-card {
  position: relative;
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 8px;
  padding: 16px; cursor: pointer; transition: transform .15s, box-shadow .15s;
}
.btn-delete {
  position: absolute; top: 10px; right: 10px;
  padding: 3px 12px; border: 1px solid var(--border); border-radius: 999px;
  background: var(--bg); color: var(--text-secondary);
  cursor: pointer; font-size: 12px; line-height: 1.6;
  opacity: 0; transition: opacity .15s, background .15s, border-color .15s, color .15s;
}
.repo-card:hover .btn-delete { opacity: 1; }
.btn-delete:hover { background: var(--danger); border-color: var(--danger); color: var(--on-accent); }
.repo-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px var(--shadow); border-color: var(--accent); }
.repo-header { font-size: 14px; }
.owner, .sep { color: var(--text-muted); }
.repo-name { font-weight: 600; color: var(--accent); }
.vis-badge {
  margin-left: 8px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600;
  white-space: nowrap; vertical-align: middle;
}
.vis-badge.is-public { background: var(--bg); border: 1px solid var(--border); color: var(--text-secondary); }
.vis-badge.is-private { background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text); }
.repo-desc { color: var(--text-secondary); font-size: 13px; margin: 8px 0 10px; line-height: 1.5; min-height: 40px; }
.repo-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--text-secondary); }
.lang { display: flex; align-items: center; gap: 4px; }
.lang-dot { width: 10px; height: 10px; border-radius: 50%; }
.local-badge { margin-top: 8px; padding: 6px 10px; background: var(--accent-soft); border-radius: 4px; font-size: 12px; color: var(--accent); }
.pending-badge {
  padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600;
  background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text);
}

.bottom-bar {
  display: flex; align-items: center; padding: 8px 20px; height: 36px;
  background: var(--bg-elevated); border-top: 1px solid var(--border); font-size: 12px; color: var(--text-secondary);
}
.btn-import {
  padding: 4px 12px; border: 1px solid var(--border); background: var(--bg-elevated); border-radius: 6px;
  cursor: pointer; font-size: 12px; margin-left: 8px; color: var(--text);
}
.btn-import:hover { background: var(--bg-hover); }

/* 弹窗：新建 / 管理仓库 */
.modal-mask {
  position: fixed; inset: 0; z-index: 100; padding: 24px;
  background: var(--overlay);
  display: flex; align-items: center; justify-content: center;
}
.modal {
  width: 460px; max-width: 92vw; max-height: 86vh; overflow: auto;
  padding: 22px 24px; border-radius: 12px;
  background: var(--bg-elevated); border: 1px solid var(--border);
  box-shadow: 0 12px 40px var(--shadow);
}
.modal h3 { margin: 0 0 10px; font-size: 18px; color: var(--text-strong); }
.modal-desc { margin: 0 0 14px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
.modal label { display: block; margin: 12px 0 6px; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.modal input:not([type="checkbox"]) {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--text); font-size: 13px; outline: none;
}
.modal input:not([type="checkbox"]):focus { border-color: var(--accent); }
.modal select {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--text); font-size: 13px; outline: none;
}
.modal select:focus { border-color: var(--accent); }
.check-row {
  display: flex !important; align-items: center; gap: 8px;
  margin: 12px 0 0 !important; font-weight: 400 !important; cursor: pointer;
}
.check-row input[type="checkbox"] {
  width: 15px; height: 15px; padding: 0; margin: 0;
  accent-color: var(--accent); flex: 0 0 auto;
}
.dir-row { display: flex; gap: 8px; margin-top: 10px; }
.dir-row input { flex: 1; }
.btn-browse {
  flex: 0 0 auto; padding: 9px 14px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg-inset); color: var(--text);
}
.btn-browse:hover { background: var(--bg-hover); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.btn-secondary {
  padding: 9px 16px; font-size: 13px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 6px;
  background: var(--bg); color: var(--text);
}
.btn-secondary:hover { background: var(--bg-hover); }
.btn-primary {
  padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--accent); border-radius: 6px;
  background: var(--accent); color: var(--on-accent);
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-danger {
  padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer;
  border: 1px solid var(--danger); border-radius: 6px;
  background: var(--danger); color: var(--on-accent);
}
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }
.btn-danger:disabled { opacity: .45; cursor: not-allowed; }
.refresh-at { font-size: 12px; color: var(--text-muted); }

.manage-modal { width: 620px; }
.manage-list { max-height: 52vh; overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
.manage-empty { padding: 24px; text-align: center; font-size: 13px; color: var(--text-muted); }
.manage-row {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; border-bottom: 1px solid var(--border);
}
.manage-row:last-child { border-bottom: none; }
.manage-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.manage-name b { font-size: 13px; color: var(--text-strong); }
.manage-sub {
  font-size: 12px; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.manage-actions { display: flex; gap: 6px; flex: 0 0 auto; }
.mini-btn {
  padding: 5px 10px; font-size: 12px; cursor: pointer;
  border: 1px solid var(--border); border-radius: 5px;
  background: var(--bg); color: var(--text-secondary);
}
.mini-btn:hover { background: var(--bg-hover); color: var(--text-strong); }
.mini-btn.danger { color: var(--danger); border-color: var(--danger); }
.mini-btn.danger:hover { background: var(--danger); color: var(--on-accent); }
</style>
