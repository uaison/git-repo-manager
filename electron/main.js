const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const AdmZip = require('adm-zip')
const { execFile } = require('child_process')
const os = require('os')

const Store = require('electron-store')

const CONFIG_DEFAULTS = {
  token: '',
  username: '',
  repositories: [],
  cloneBaseDir: '',
  oauthClientId: '',
  themeMode: 'system',
  listTab: 'mine',
  pendingChanges: {}
}

// 配置文件写入失败时（权限/杀软占用等）降级为内存存储，避免主进程崩溃
function createMemoryStore (defaults) {
  const mem = { ...defaults }
  return {
    get store () { return { ...mem } },
    get (key, def) { return key in mem ? mem[key] : def },
    set (key, value) { mem[key] = value },
    delete (key) { delete mem[key] }
  }
}

// 旧版本（产品名 GitHub Desktop）的配置目录迁移，避免升级后需要重新登录
function migrateLegacyConfig () {
  try {
    const fileName = 'github-desktop-config.json'
    const targetDir = app.getPath('userData')
    const targetFile = path.join(targetDir, fileName)
    if (fs.existsSync(targetFile)) return
    const appData = app.getPath('appData')
    const candidates = [
      path.join(appData, 'GitHub Desktop', fileName),
      path.join(appData, 'github-desktop', fileName)
    ]
    const found = candidates.find(p => { try { return fs.existsSync(p) } catch { return false } })
    if (!found) return
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(found, targetFile)
    console.log('[config] 已从旧目录迁移配置:', found)
  } catch (e) {
    console.warn('[config] 配置迁移失败:', e.message)
  }
}

// 产品改名迁移：把旧产品名的 userData 目录整体搬到新目录，避免升级后重新登录。
// Electron 的 userData 默认取 package.json 的 name 字段（曾为 gitnest），
// 也兼容早期以产品名命名的目录（GitNest）。
function migrateProductRename () {
  const oldNames = ['gitnest', 'GitNest']
  try {
    const appData = app.getPath('appData')
    const newDir = app.getPath('userData')
    for (const name of oldNames) {
      const oldDir = path.join(appData, name)
      if (!fs.existsSync(oldDir)) continue
      if (path.resolve(oldDir) === path.resolve(newDir)) continue
      // 新目录已存在且非空：保留更新的数据，不覆盖
      if (fs.existsSync(newDir) && fs.readdirSync(newDir).length > 0) return
      if (fs.existsSync(newDir)) fs.rmSync(newDir, { recursive: true, force: true })
      fs.renameSync(oldDir, newDir)
      console.log('[config] 已迁移产品目录:', oldDir, '->', newDir)
      return
    }
  } catch (e) {
    console.warn('[config] 产品目录迁移失败:', e.message)
  }
}
migrateProductRename()
migrateLegacyConfig()

let store
try {
  store = new Store({
    name: 'github-desktop-config',
    defaults: CONFIG_DEFAULTS
  })
  // 自检：确认配置文件可写
  store.set('__writeProbe', Date.now())
  store.delete('__writeProbe')
} catch (e) {
  console.error('[config] 配置文件不可写，已降级为内存存储:', e.message)
  store = createMemoryStore(CONFIG_DEFAULTS)
}

let mainWindow
const isDev = process.env.NODE_ENV === 'development'

// ============ 本地仓库：调用系统 git 做状态检测（仅本地，不联网） ============
function runGit (cwd, args) {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', cwd, ...args], { windowsHide: true, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(String(stderr || err.message || '').trim()))
      else resolve(stdout)
    })
  })
}

// ============ 凭据加密：Windows DPAPI / macOS Keychain / Linux libsecret ============
const TOKEN_ENC_PREFIX = 'enc:v1:'

function encryptToken (plain) {
  const value = String(plain || '')
  if (!value) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return TOKEN_ENC_PREFIX + safeStorage.encryptString(value).toString('base64')
    }
  } catch (e) {
    console.warn('[config] 系统加密不可用，降级为明文存储:', e.message)
  }
  return value
}

function decryptToken (stored) {
  const value = String(stored || '')
  if (!value || !value.startsWith(TOKEN_ENC_PREFIX)) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(TOKEN_ENC_PREFIX.length), 'base64'))
  } catch (e) {
    console.warn('[config] Token 解密失败，已忽略:', e.message)
    return ''
  }
}

function getToken () {
  return decryptToken(store.get('token')).trim()
}

// 旧配置（含从旧版本迁移来的）可能是明文 Token，启动时补齐加密
// 注意：safeStorage 必须在 app ready 之后调用，因此放到 whenReady 内执行
function ensureTokenEncrypted () {
  const raw = store.get('token')
  if (!raw || String(raw).startsWith(TOKEN_ENC_PREFIX)) return
  if (!safeStorage.isEncryptionAvailable()) return
  store.set('token', encryptToken(raw))
  console.log('[config] 已将明文 Token 加密存储')
}

// 为 HTTPS 远程注入 GitHub Token 鉴权；SSH 远程保持原样（走本地密钥）
function withTokenRemote (remoteUrl) {
  const token = getToken()
  if (!remoteUrl || !token) return remoteUrl || ''
  if (remoteUrl.startsWith('git@') || remoteUrl.startsWith('ssh://') || remoteUrl.includes('@')) return remoteUrl
  return remoteUrl.replace(/^https:\/\//, 'https://x-access-token:' + encodeURIComponent(token) + '@')
}

ipcMain.handle('git:status', async (_e, dir) => {
  try {
    const raw = await runGit(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    const parts = raw.split('\0')
    const files = []
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (!p || p.length < 4) continue
      const x = p[0]          // index status (暂存区)
      const y = p[1]          // worktree status (工作区)
      let filePath = p.slice(3).replace(/\\/g, '/')

      // 重命名/复制 → porcelain 格式是 "R  oldPath\0newPath\0"
      if ((x === 'R' || x === 'C') && y === ' ') {
        const nextPath = parts[i + 1]
        if (nextPath !== undefined) {
          filePath = nextPath.replace(/\\/g, '/')
          i++ // 跳过原路径
        }
      }

      // 解析状态
      const untracked = (x === '?' && y === '?')
      const staged = (x !== ' ' && x !== '?')   // 暂存区有变动
      const unstaged = (y !== ' ' && y !== '?') // 工作区有未暂存变动

      // 综合状态标签：S=staged staged, M=staged+unstaged, U=untracked, W=unstaged only
      let statusLabel
      if (untracked) statusLabel = 'U'
      else if (staged && unstaged) statusLabel = 'M'  // mixed
      else if (staged) statusLabel = 'S'  // staged only
      else statusLabel = 'W'  // worktree only

      files.push({
        path: filePath,
        indexStatus: x,
        worktreeStatus: y,
        staged,
        unstaged,
        untracked,
        status: statusLabel   // 兼容旧字段
      })
    }
    const branch = (await runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    let remoteUrl = ''
    try { remoteUrl = (await runGit(dir, ['remote', 'get-url', 'origin'])).trim() } catch { /* 无 origin */ }
    // ahead / behind（相对 origin/<branch>）
    let ahead = null, behind = null
    try {
      const ab = (await runGit(dir, ['rev-list', '--left-right', '--count', `origin/${branch}...HEAD`])).trim()
      const parts = ab.split(/\s+/)
      if (parts.length === 2) { behind = parseInt(parts[0]) || 0; ahead = parseInt(parts[1]) || 0 }
    } catch { /* 无远端跟踪分支 */ }
    // 本地分支列表
    let branches = []
    try {
      const br = (await runGit(dir, ['for-each-ref', '--format=%(refname:short)%09%(HEAD)%09%(upstream:short)', 'refs/heads'])).trim()
      branches = br.split(/\r?\n/).filter(Boolean).map(line => {
        const [name, head, upstream] = line.split('\t')
        return { name, current: head === '*', upstream: upstream || '' }
      })
    } catch { /* ignore */ }
    return { ok: true, files, branch, remoteUrl, ahead, behind, branches }
  } catch (e) {
    return { ok: false, message: e.message, files: [], branch: '', remoteUrl: '', ahead: null, behind: null, branches: [] }
  }
})

// 暂存一个文件：git add -- <path>
ipcMain.handle('git:add', async (_e, { dir, filePath }) => {
  try {
    await runGit(dir, ['add', '--', filePath])
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

// 从暂存区移除：git reset HEAD -- <path>
ipcMain.handle('git:resetPath', async (_e, { dir, filePath }) => {
  try {
    await runGit(dir, ['reset', 'HEAD', '--', filePath])
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

// 获取 HEAD 版本的文件内容：git show HEAD:path
ipcMain.handle('git:showHEAD', async (_e, { dir, filePath }) => {
  try {
    const raw = await runGit(dir, ['show', 'HEAD:' + filePath])
    return { ok: true, content: raw }
  } catch (e) {
    return { ok: false, message: e.message, content: '' }
  }
})

// 暂存区 diff：git diff --cached
ipcMain.handle('git:diffStaged', async (_e, { dir, filePath }) => {
  try {
    const args = ['diff', '--cached', '--no-color', '-U3', '--', filePath]
    const raw = await runGit(dir, args)
    return { ok: true, diff: raw }
  } catch (e) {
    return { ok: false, message: e.message, diff: '' }
  }
})

// 工作区 diff（已跟踪文件的未暂存改动）
ipcMain.handle('git:diffWorktree', async (_e, { dir, filePath }) => {
  try {
    const args = ['diff', '--no-color', '-U3', '--', filePath]
    const raw = await runGit(dir, args)
    return { ok: true, diff: raw }
  } catch (e) {
    return { ok: false, message: e.message, diff: '' }
  }
})

// 恢复到 HEAD：git checkout HEAD -- <path>（用于 staged 文件撤销）
ipcMain.handle('git:checkoutHEAD', async (_e, { dir, filePath }) => {
  try {
    await runGit(dir, ['checkout', 'HEAD', '--', filePath])
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

ipcMain.handle('git:restore', async (_e, { dir, filePath }) => {
  try {
    await runGit(dir, ['checkout', '--', filePath])
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

ipcMain.handle('git:diff', async (_e, { dir, filePath }) => {
  try {
    // 指定文件：git diff --no-color -- <path>
    const args = ['diff', '--no-color', '-U3', '--', filePath]
    const raw = await runGit(dir, args)
    return { ok: true, diff: raw }
  } catch (e) {
    return { ok: false, message: e.message, diff: '' }
  }
})

// 获取 untracked 文件的内容（用于 diff 展示：整个文件都是新增）
ipcMain.handle('git:readUntrackedFile', async (_e, { dir, filePath }) => {
  try {
    const fs = require('fs')
    const fullPath = require('path').join(dir, filePath)
    if (!fs.existsSync(fullPath)) return { ok: false, message: '文件不存在', content: '' }
    const buf = fs.readFileSync(fullPath)
    return { ok: true, content: buf.toString('utf-8') }
  } catch (e) {
    return { ok: false, message: e.message, content: '' }
  }
})

// 获取最近一个 commit 信息（推送面板展示 base commit）
ipcMain.handle('git:headInfo', async (_e, dir) => {
  try {
    const sha = (await runGit(dir, ['rev-parse', 'HEAD'])).trim()
    const log = await runGit(dir, ['log', '-1', '--pretty=format:%s|%an|%ad', '--date=iso'])
    const [msg, author, date] = log.split('|')
    return { ok: true, sha, message: msg, author, date }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

// 检查目录是否是 git 仓库（比 git status 更轻量）
ipcMain.handle('git:isRepo', async (_e, dir) => {
  try {
    await runGit(dir, ['rev-parse', '--is-inside-work-tree'])
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e.message }
  }
})

// 本地分支列表
ipcMain.handle('git:branches', async (_e, dir) => {
  try {
    const br = (await runGit(dir, ['for-each-ref', '--format=%(refname:short)%09%(HEAD)%09%(upstream:short)', 'refs/heads'])).trim()
    const list = br.split(/\r?\n/).filter(Boolean).map(line => {
      const [name, head, upstream] = line.split('\t')
      return { name, current: head === '*', upstream: upstream || '' }
    })
    return { ok: true, branches: list }
  } catch (e) { return { ok: false, message: e.message, branches: [] } }
})

// 切换分支：git switch（回退 checkout）
ipcMain.handle('git:switchBranch', async (_e, { dir, name }) => {
  try {
    await runGit(dir, ['switch', name])
    return { ok: true }
  } catch (e) {
    try { await runGit(dir, ['checkout', name]); return { ok: true } }
    catch (e2) { return { ok: false, message: e2.message || e.message } }
  }
})

// 创建并切换分支：git checkout -b <name> [from]
ipcMain.handle('git:createBranch', async (_e, { dir, name, from }) => {
  try {
    const args = from ? ['checkout', '-b', name, from] : ['checkout', '-b', name]
    await runGit(dir, args)
    return { ok: true }
  } catch (e) { return { ok: false, message: e.message } }
})

// 删除分支：git branch -d/-D <name>
ipcMain.handle('git:deleteBranch', async (_e, { dir, name, force }) => {
  try {
    await runGit(dir, ['branch', force ? '-D' : '-d', name])
    return { ok: true }
  } catch (e) { return { ok: false, message: e.message } }
})

// 提交：git commit -F <临时信息文件>
ipcMain.handle('git:commit', async (_e, { dir, message }) => {
  try {
    if (!message || !message.trim()) return { ok: false, message: '提交信息不能为空' }
    const tmp = path.join(os.tmpdir(), 'ghd-commit-' + Date.now() + '.txt')
    fs.writeFileSync(tmp, message, 'utf-8')
    try {
      const out = await runGit(dir, ['commit', '-F', tmp])
      let sha = ''
      try { sha = (await runGit(dir, ['rev-parse', 'HEAD'])).trim() } catch {}
      return { ok: true, sha, output: out }
    } finally {
      try { fs.unlinkSync(tmp) } catch {}
    }
  } catch (e) {
    const msg = String(e.message || '')
    if (msg.includes('nothing to commit') || msg.includes('no changes added')) {
      return { ok: false, message: '没有可提交的改动（请先暂存文件）', nothingToCommit: true }
    }
    if (msg.includes('Aborting commit') || msg.includes('did not match')) {
      return { ok: false, message: '提交失败：' + msg }
    }
    return { ok: false, message: msg }
  }
})

// 推送：git push <鉴权远程> HEAD:refs/heads/<branch>
ipcMain.handle('git:push', async (_e, { dir, branch }) => {
  try {
    let remoteUrl = ''
    try { remoteUrl = (await runGit(dir, ['remote', 'get-url', 'origin'])).trim() } catch {}
    const target = withTokenRemote(remoteUrl) || 'origin'
    const refspec = branch ? `HEAD:refs/heads/${branch}` : 'HEAD'
    const out = await runGit(dir, ['push', target, refspec])
    return { ok: true, output: out }
  } catch (e) {
    let msg = String(e.message || '')
    if (/authentication failed|could not read Username/i.test(msg)) msg = '推送认证失败：请检查 GitHub Token 权限'
    else if (/non-fast-forward|rejected/i.test(msg)) msg = '推送被拒绝：远端有新提交，请先拉取合并'
    else if (/src refspec|did not match/i.test(msg)) msg = '推送失败：本地分支或引用不存在'
    return { ok: false, message: msg }
  }
})

// 拉取：git pull <鉴权远程> <branch>
ipcMain.handle('git:pull', async (_e, { dir, branch, rebase } = {}) => {
  try {
    let remoteUrl = ''
    try { remoteUrl = (await runGit(dir, ['remote', 'get-url', 'origin'])).trim() } catch {}
    const target = withTokenRemote(remoteUrl) || 'origin'
    const args = ['pull']
    if (rebase) args.push('--rebase')
    args.push(target)
    if (branch) args.push(branch)
    const out = await runGit(dir, args)
    return { ok: true, output: out }
  } catch (e) {
    let msg = String(e.message || '')
    if (/conflict/i.test(msg)) msg = '拉取合并时存在冲突，请在本地解决后再提交'
    return { ok: false, message: msg }
  }
})

// 待推送提交清单：origin/<branch>..HEAD；无上游分支时退回最近提交
ipcMain.handle('git:unpushed', async (_e, { dir, branch } = {}) => {
  try {
    const fmt = '%H\x1f%an\x1f%aI\x1f%s\x1e'
    let hasUpstream = false
    try {
      await runGit(dir, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])
      hasUpstream = true
    } catch { hasUpstream = false }

    const args = ['log']
    if (hasUpstream) args.push(`origin/${branch}..HEAD`)
    args.push('-n', '50', '--format=' + fmt)

    const out = await runGit(dir, args)
    const items = out.split('\x1e').map(s => s.trim()).filter(Boolean).map(line => {
      const [sha, author, date, subject] = line.split('\x1f')
      return { sha: sha || '', author: author || '', date: date || '', subject: subject || '' }
    })
    return { ok: true, hasUpstream, items }
  } catch (e) {
    return { ok: false, message: String(e.message || ''), hasUpstream: false, items: [] }
  }
})

// 克隆远程仓库到本地（origin 地址不写入 token）
ipcMain.handle('git:clone', async (_e, { remoteUrl, targetDir } = {}) => {
  try {
    if (!remoteUrl || !targetDir) return { ok: false, message: '缺少远程地址或目标目录' }
    if (fs.existsSync(path.join(targetDir, '.git'))) {
      return { ok: false, message: '目标目录已存在 Git 仓库' }
    }
    const parent = path.dirname(targetDir)
    fs.mkdirSync(parent, { recursive: true })
    const cloneUrl = withTokenRemote(remoteUrl) || remoteUrl
    await runGit(parent, ['clone', cloneUrl, targetDir])
    // 把 origin 还原为不含 token 的地址
    try { await runGit(targetDir, ['remote', 'set-url', 'origin', remoteUrl]) } catch {}
    return { ok: true, dir: targetDir }
  } catch (e) {
    return { ok: false, message: String(e.message || '克隆失败') }
  }
})

// 把已下载解压的目录初始化为 Git 仓库并关联远程分支（不覆盖工作区文件）
ipcMain.handle('git:initRemote', async (_e, { dir, remoteUrl, branch } = {}) => {
  try {
    if (!dir || !remoteUrl) return { ok: false, message: '缺少目录或远程地址' }
    const br = branch || 'main'

    if (!fs.existsSync(path.join(dir, '.git'))) {
      await runGit(dir, ['init'])
    }

    // origin 只保存不带 token 的地址
    let existing = ''
    try { existing = (await runGit(dir, ['remote', 'get-url', 'origin'])).trim() } catch {}
    if (existing) {
      if (existing !== remoteUrl) await runGit(dir, ['remote', 'set-url', 'origin', remoteUrl])
    } else {
      await runGit(dir, ['remote', 'add', 'origin', remoteUrl])
    }

    // 用带鉴权的地址抓取，落到远程跟踪分支
    const fetchUrl = withTokenRemote(remoteUrl) || remoteUrl
    await runGit(dir, ['fetch', fetchUrl, `+${br}:refs/remotes/origin/${br}`])

    // 建立本地分支并切换 HEAD，再用混合 reset 让索引对齐（不动已解压的文件）
    try { await runGit(dir, ['update-ref', `refs/heads/${br}`, `refs/remotes/origin/${br}`]) } catch {}
    await runGit(dir, ['symbolic-ref', 'HEAD', `refs/heads/${br}`])
    await runGit(dir, ['reset', '--mixed'])
    try { await runGit(dir, ['branch', '--set-upstream-to', `origin/${br}`, br]) } catch {}

    return { ok: true, branch: br }
  } catch (e) {
    return { ok: false, message: String(e.message || 'Git 初始化失败') }
  }
})

// 抓取：git fetch <鉴权远程>
ipcMain.handle('git:fetch', async (_e, dir) => {
  try {
    let remoteUrl = ''
    try { remoteUrl = (await runGit(dir, ['remote', 'get-url', 'origin'])).trim() } catch {}
    const target = withTokenRemote(remoteUrl) || 'origin'
    const out = await runGit(dir, ['fetch', target])
    return { ok: true, output: out }
  } catch (e) { return { ok: false, message: String(e.message || '') } }
})

// 获取最近 N 条提交（git log），返回 [{ sha, parents, author, email, date, subject, message }]
ipcMain.handle('git:log', async (_e, { dir, count = 30, ref = 'HEAD', file } = {}) => {
  try {
    // \x1f 字段分隔，\x1e 条目分隔
    const fmt = '%H\x1f%P\x1f%an\x1f%ae\x1f%aI\x1f%s\x1f%b\x1e'
    const args = ['log', ref, '-n', String(count), '--format=' + fmt]
    // 单文件历史：跟随重命名
    if (file) {
      args.push('--follow', '--', file)
    }
    const out = await runGit(dir, args)
    const items = out.split('\x1e').map(s => s.trim()).filter(Boolean).map(line => {
      const parts = line.split('\x1f')
      const [sha, parentsStr, author, email, date, subject] = parts
      // message 可能包含 \x1f 分隔符（如果正文有），合并剩余字段
      const message = parts.slice(6).join('\x1f').trim()
      const parents = (parentsStr || '').split(' ').filter(Boolean)
      return {
        sha: sha || '',
        parents,
        author: author || '',
        email: email || '',
        date: date || '',
        subject: subject || '',
        message
      }
    })
    return { ok: true, items }
  } catch (e) { return { ok: false, message: String(e.message || ''), items: [] } }
})

// ============ 中文应用菜单 ============
function buildAppMenu () {
  const send = (action, payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('menu:action', action, payload)
    }
  }

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '返回仓库列表', accelerator: 'CmdOrCtrl+B', click: () => send('back') },
        { type: 'separator' },
        { label: '打开配置文件目录', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '实际大小', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏切换', role: 'togglefullscreen' }
      ]
    },
    {
      label: '主题',
      submenu: [
        { label: '跟随系统', click: () => send('theme', 'system') },
        { label: '亮色', click: () => send('theme', 'light') },
        { label: '暗色', click: () => send('theme', 'dark') },
        { type: 'separator' },
        { label: '切换下一个主题', accelerator: 'CmdOrCtrl+Shift+T', click: () => send('theme', 'cycle') }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '使用指南（登录 / 操作 / FAQ）',
          accelerator: 'F1',
          click: () => openHelp()
        },
        {
          label: '三种登录方式说明',
          click: () => openHelp('auth')
        },
        { type: 'separator' },
        {
          label: '注册 OAuth App（设备码 / 网页授权）',
          click: () => shell.openExternal('https://github.com/settings/developers')
        },
        {
          label: '生成访问令牌 (PAT)',
          click: () => shell.openExternal('https://github.com/settings/tokens/new')
        },
        {
          label: '管理访问令牌',
          click: () => shell.openExternal('https://github.com/settings/tokens')
        },
        { type: 'separator' },
        {
          label: '打开 GitHub 官网',
          click: () => shell.openExternal('https://github.com')
        },
        { type: 'separator' },
        {
          label: '关于 Git Repo Manager',
          click: () => openHelp('about')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ============ 帮助窗口 ============
let helpWindow = null
function openHelp (hash = '') {
  if (helpWindow && !helpWindow.isDestroyed()) {
    helpWindow.focus()
    if (hash) helpWindow.webContents.executeJavaScript(`location.hash = '${hash}'`)
    return
  }
  helpWindow = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'Git Repo Manager 使用指南',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  })
  helpWindow.loadFile(path.join(__dirname, 'help.html'), hash ? { hash } : undefined)
  // 帮助页内的外部链接用系统浏览器打开，不在应用内导航
  helpWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  helpWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })
  helpWindow.on('closed', () => { helpWindow = null })
}
ipcMain.handle('app:openHelp', (_e, hash) => { openHelp(hash || '') })

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f6f8fa',
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: isDev
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 用 app.getAppPath() 定位，比 __dirname + .. 更可靠
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }

  // 诊断：渲染进程加载错误
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    console.error(`[Electron] did-fail-load code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(
        `document.body.innerHTML = '<pre style="padding:20px;color:#cf222e">Electron 加载失败:\\n${errorDescription}\\nURL: ${validatedURL}</pre>'`
      ).catch(() => {})
    }
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[Electron] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  // Windows 任务栏使用独立 AppUserModelId，避免被归并到 Electron 默认图标
  if (process.platform === 'win32') app.setAppUserModelId(isDev ? 'io.gitrepo.app.dev' : 'io.gitrepo.app')
  ensureTokenEncrypted()
  buildAppMenu()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ============================================================
// GitHub API 请求（通过 Node https 模块，避免 git 协议依赖）
// ============================================================

function apiRequest (token, method, urlPath, body, accept, withHeaders) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: urlPath,
      method: method,
      headers: {
        'User-Agent': 'GitHub-Desktop-Electron',
        'Accept': accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }
    if (token) options.headers['Authorization'] = `Bearer ${token}`
    if (body) {
      options.headers['Content-Type'] = 'application/json'
      options.headers['Content-Length'] = Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body))
    }

    const req = https.request(options, (res) => {
      // 按 Buffer 累积后再统一解码：逐块 toString 会把跨块的多字节 UTF-8 字符（中文/emoji）拆坏成乱码
      const chunks = []
      res.on('data', (chunk) => { chunks.push(chunk) })
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8')
        const contentType = res.headers['content-type'] || ''
        let parsed
        try {
          parsed = contentType.includes('application/json') ? JSON.parse(data) : data
        } catch (e) {
          parsed = data
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          // 需要分页信息（Link 头）时返回 { data, headers }，默认仍只返回响应体
          resolve(withHeaders ? { data: parsed, headers: res.headers } : parsed)
        } else {
          // 关键：必须 reject 一个真正的 Error 实例，Electron IPC 才能正确序列化错误信息。
          // 普通对象会被序列化成 [object Object]，用户看不到具体报错。
          const errMsg = parsed?.message || (typeof parsed === 'string' ? parsed : JSON.stringify(parsed))
          const err = new Error(`GitHub API ${res.statusCode} ${method} ${urlPath}\n${errMsg}`)
          err.status = res.statusCode
          err.path = urlPath
          err.response = parsed
          // 中文友好提示
          if (res.statusCode === 401) {
            err.friendlyMessage = '身份验证失败 (401)。请检查 Token 是否过期或已失效，需要重新登录。'
          } else if (res.statusCode === 403) {
            const remaining = res.headers['x-ratelimit-remaining']
            if (remaining === '0') {
              const reset = new Date(Number(res.headers['x-ratelimit-reset']) * 1000)
              err.friendlyMessage = `API 限流 (403)。配额将在 ${reset.toLocaleTimeString()} 重置。`
            } else {
              err.friendlyMessage = '权限不足 (403)。请检查 Token 的权限范围是否包含该仓库。'
            }
          } else if (res.statusCode === 404) {
            err.friendlyMessage = '资源不存在 (404)。可能是私有仓库未授权，或路径错误。'
          } else if (res.statusCode === 422) {
            err.friendlyMessage = `请求参数错误 (422): ${errMsg}`
          }
          reject(err)
        }
      })
    })
    req.on('error', (e) => {
      // 网络层错误：DNS、连接拒绝、超时等
      const err = new Error(`网络错误: ${e.code || e.message}\n${e.message}`)
      err.code = e.code
      err.friendlyMessage = `网络连接失败 (${e.code || 'UNKNOWN'})。请检查是否能访问 api.github.com。`
      reject(err)
    })
    req.setTimeout(30000, () => {
      req.destroy()
      const err = new Error('请求超时 (30s)')
      err.code = 'ETIMEDOUT'
      err.friendlyMessage = '请求超时。请检查网络连接或代理设置。'
      reject(err)
    })
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body))
    req.end()
  })
}

// 下载二进制文件（用于拉取仓库 zip）
function downloadBinary (token, fullUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(fullUrl)
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'User-Agent': 'GitHub-Desktop-Electron',
        'Accept': 'application/vnd.github+json'
      }
    }
    if (token && url.hostname === 'codeload.github.com') {
      options.headers['Authorization'] = `Bearer ${token}`
    } else if (token) {
      options.headers['Authorization'] = `Bearer ${token}`
    }

    const req = https.request(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // 跟随重定向
        downloadBinary(token, res.headers.location).then(resolve).catch(reject)
        return
      }
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
      } else {
        let msg = ''
        res.on('data', (c) => msg += c)
        res.on('end', () => reject({ status: res.statusCode, message: msg }))
      }
    })
    req.on('error', reject)
    req.end()
  })
}

// ============================================================
// IPC: 配置管理
// ============================================================

ipcMain.handle('config:get', () => ({ ...store.store, token: getToken() }))

ipcMain.handle('config:set', (_e, key, value) => {
  store.set(key, key === 'token' ? encryptToken(value) : value)
  return { ...store.store, token: getToken() }
})

ipcMain.handle('config:delete', (_e, key) => {
  store.delete(key)
  return store.store
})

// ============================================================
// IPC: GitHub API 统一入口
// ============================================================

ipcMain.handle('api:request', async (_e, { token, method, path, body, accept, withHeaders }) => {
  // renderer 侧很多调用（比如 RepoDetailView）传了空 token，这里兜底从 store 拿
  const actualToken = token || getToken() || ''
  try {
    return await apiRequest(actualToken, method, path, body, accept, withHeaders)
  } catch (err) {
    // 把结构化错误压平成单个 Error.message 字符串，
    // Electron IPC 才能正确序列化传给渲染进程。
    const parts = []
    if (err.friendlyMessage) parts.push(err.friendlyMessage)
    if (err.message) parts.push(err.message)
    if (err.status) parts.push(`HTTP ${err.status}`)
    if (err.path) parts.push(`Path: ${err.path}`)
    const wrapped = new Error(parts.filter(Boolean).join('\n\n') || 'Unknown error')
    wrapped.status = err.status
    throw wrapped
  }
})

// ============================================================
// IPC: 通用 HTTPS 请求（支持任意 host，用于 OAuth Device Flow）
// ============================================================

ipcMain.handle('https:request', async (_e, { host, method, path, body, headers }) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path: path,
      method: method || 'GET',
      headers: {
        'User-Agent': 'GitHub-Desktop-Electron',
        'Accept': 'application/json',
        ...(headers || {})
      }
    }
    if (body) {
      if (typeof body === 'object') {
        options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
        const params = new URLSearchParams(body).toString()
        options.headers['Content-Length'] = Buffer.byteLength(params)
        body = params
      } else {
        options.headers['Content-Length'] = Buffer.byteLength(body)
      }
    }
    const req = https.request(options, (res) => {
      const chunks = []
      res.on('data', (chunk) => { chunks.push(chunk) })
      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8')
        let parsed
        try { parsed = JSON.parse(data) } catch { parsed = data }
        resolve({ status: res.statusCode, data: parsed })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
})

// ============================================================
// IPC: 仓库操作（拉取 / 提交推送）
// ============================================================

// 选择本地目录
ipcMain.handle('dialog:selectDir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

// 选择保存文件路径
ipcMain.handle('dialog:saveFile', async (_e, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath })
  return result.canceled ? null : result.filePath
})

// 拉取仓库：下载 zip 并解压到本地目录
ipcMain.handle('repo:pull', async (_e, { token, owner, repo, branch, targetDir }) => {
  try {
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`
    const buffer = await downloadBinary(token, zipUrl)

    // 确保目标目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // 解压
    const zip = new AdmZip(buffer)
    zip.extractAllTo(targetDir, true)

    // codeload 下载的 zip 解压后会带一个 "{repo}-{branch}" 的顶层目录，扁平化处理
    const entries = zip.getEntries()
    let topDirName = null
    for (const entry of entries) {
      if (entry.entryName && entry.entryName.includes('/')) {
        topDirName = entry.entryName.split('/')[0]
        break
      }
    }
    if (topDirName) {
      const topDir = path.join(targetDir, topDirName)
      if (fs.existsSync(topDir)) {
        const items = fs.readdirSync(topDir)
        for (const item of items) {
          fs.renameSync(path.join(topDir, item), path.join(targetDir, item))
        }
        fs.rmSync(topDir, { recursive: true, force: true })
      }
    }

    return { success: true, targetDir }
  } catch (err) {
    return { success: false, message: err.message || JSON.stringify(err) }
  }
})

// 读取本地文件内容（二进制 → base64）
ipcMain.handle('fs:readFileBase64', async (_e, filePath) => {
  if (!fs.existsSync(filePath)) return null
  return fs.readFileSync(filePath).toString('base64')
})

ipcMain.handle('fs:readFileText', async (_e, filePath) => {
  if (!fs.existsSync(filePath)) return null
  const buf = fs.readFileSync(filePath)
  // 尝试 UTF-8，失败用 latin1
  try {
    return buf.toString('utf-8')
  } catch {
    return buf.toString('latin1')
  }
})

// 列出本地目录文件
ipcMain.handle('fs:listDir', async (_e, dirPath, recursive = false) => {
  if (!fs.existsSync(dirPath)) return []

  function walk (currentDir, prefix = '') {
    const results = []
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.git') || entry.name === 'node_modules') continue
      const fullPath = path.join(currentDir, entry.name)
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
      results.push({
        name: entry.name,
        path: relPath,
        isDir: entry.isDirectory(),
        size: entry.isFile() ? fs.statSync(fullPath).size : 0
      })
      if (recursive && entry.isDirectory()) {
        results.push(...walk(fullPath, relPath))
      }
    }
    return results
  }

  return walk(dirPath)
})

// 确保目录存在
ipcMain.handle('fs:ensureDir', async (_e, dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return true
})

// 写入本地文件
ipcMain.handle('fs:writeFile', async (_e, filePath, content, encoding = 'utf-8') => {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePath, content, encoding)
  return true
})

// 删除本地文件
ipcMain.handle('fs:deleteFile', async (_e, filePath) => {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true })
  }
  return true
})

// 打开外部链接
ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url))

// 打开本地文件夹
ipcMain.handle('shell:openPath', (_e, target) => shell.openPath(target))

// ============================================================
// IPC: OAuth Web 授权临时回调服务器（localhost:8765）
// ============================================================

let _oauthServer = null

ipcMain.handle('oauth:startCallbackServer', async () => {
  // 清理旧 server
  if (_oauthServer) { try { _oauthServer.close() } catch {} _oauthServer = null }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      // 给浏览器友好的反馈页面
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html><html><body style="font-family:system-ui;padding:40px;text-align:center;background:#f6f8fa">
        <h2>✅ Git Repo Manager 授权成功</h2>
        <p>请返回应用窗口，登录会自动继续...</p>
        <script>window.close()</script></body></html>`)

      if (code) {
        store.set('_oauthCode', code)
        store.set('_oauthState', state || '')
        // 通知 renderer（通过 mainWindow.webContents 的方式）
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('oauth:callback-received', { code, state })
        }
      }

      // 收到一次回调就可以关
      setTimeout(() => {
        try { server.close() } catch {}
        _oauthServer = null
      }, 300)
    })

    server.listen(8765, '127.0.0.1', () => {
      _oauthServer = server
      resolve({ success: true, url: 'http://127.0.0.1:8765/callback' })
    })

    server.on('error', (err) => {
      reject({ success: false, message: err.message })
    })
  })
})

ipcMain.handle('oauth:stopCallbackServer', async () => {
  if (_oauthServer) {
    try { _oauthServer.close() } catch {}
    _oauthServer = null
  }
  return true
})
