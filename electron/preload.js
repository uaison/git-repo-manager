const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // 配置
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (key, value) => ipcRenderer.invoke('config:set', key, value),
  deleteConfig: (key) => ipcRenderer.invoke('config:delete', key),

  // 通用 API 请求（api.github.com）
  apiRequest: (args) => ipcRenderer.invoke('api:request', args),

  // 通用 HTTPS 请求（任意 host，用于 github.com/login/* OAuth 等）
  httpsRequest: (args) => ipcRenderer.invoke('https:request', args),

  // OAuth Web 授权临时回调服务器
  oauthStartCallback: () => ipcRenderer.invoke('oauth:startCallbackServer'),
  oauthStopCallback: () => ipcRenderer.invoke('oauth:stopCallbackServer'),

  // 仓库操作
  selectDir: () => ipcRenderer.invoke('dialog:selectDir'),
  saveFile: (defaultPath) => ipcRenderer.invoke('dialog:saveFile', defaultPath),
  downloadReleaseAsset: (args) => ipcRenderer.invoke('release:downloadAsset', args),
  repoPull: (args) => ipcRenderer.invoke('repo:pull', args),

  // 文件系统
  readFileBase64: (filePath) => ipcRenderer.invoke('fs:readFileBase64', filePath),
  readFileText: (filePath) => ipcRenderer.invoke('fs:readFileText', filePath),
  listDir: (dirPath, recursive) => ipcRenderer.invoke('fs:listDir', dirPath, recursive),
  ensureDir: (dirPath) => ipcRenderer.invoke('fs:ensureDir', dirPath),
  writeFile: (filePath, content, encoding) => ipcRenderer.invoke('fs:writeFile', filePath, content, encoding),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (target) => ipcRenderer.invoke('shell:openPath', target),
  openHelp: (hash) => ipcRenderer.invoke('app:openHelp', hash),

  // 本地 Git 状态（仅本地操作，不走网络）
  gitStatus: (dir) => ipcRenderer.invoke('git:status', dir),
  gitRestore: (dir, filePath) => ipcRenderer.invoke('git:restore', { dir, filePath }),
  gitDiff: (dir, filePath) => ipcRenderer.invoke('git:diff', { dir, filePath }),
  gitDiffStaged: (dir, filePath) => ipcRenderer.invoke('git:diffStaged', { dir, filePath }),
  gitDiffWorktree: (dir, filePath) => ipcRenderer.invoke('git:diffWorktree', { dir, filePath }),
  gitShowHEAD: (dir, filePath) => ipcRenderer.invoke('git:showHEAD', { dir, filePath }),
  gitAdd: (dir, filePath) => ipcRenderer.invoke('git:add', { dir, filePath }),
  gitResetPath: (dir, filePath) => ipcRenderer.invoke('git:resetPath', { dir, filePath }),
  gitCheckoutHEAD: (dir, filePath) => ipcRenderer.invoke('git:checkoutHEAD', { dir, filePath }),
  gitReadUntrackedFile: (dir, filePath) => ipcRenderer.invoke('git:readUntrackedFile', { dir, filePath }),
  gitHeadInfo: (dir) => ipcRenderer.invoke('git:headInfo', dir),
  gitIsRepo: (dir) => ipcRenderer.invoke('git:isRepo', dir),
  gitBranches: (dir) => ipcRenderer.invoke('git:branches', dir),
  gitSwitchBranch: (dir, name) => ipcRenderer.invoke('git:switchBranch', { dir, name }),
  gitCreateBranch: (dir, name, from) => ipcRenderer.invoke('git:createBranch', { dir, name, from }),
  gitDeleteBranch: (dir, name, force) => ipcRenderer.invoke('git:deleteBranch', { dir, name, force }),
  gitCommit: (dir, message) => ipcRenderer.invoke('git:commit', { dir, message }),
  gitPush: (dir, branch) => ipcRenderer.invoke('git:push', { dir, branch }),
  gitUnpushed: (dir, branch) => ipcRenderer.invoke('git:unpushed', { dir, branch }),
  gitInitRemote: (dir, remoteUrl, branch) => ipcRenderer.invoke('git:initRemote', { dir, remoteUrl, branch }),
  gitClone: (args) => ipcRenderer.invoke('git:clone', args),
  gitPull: (dir, branch, rebase) => ipcRenderer.invoke('git:pull', { dir, branch, rebase }),
  gitFetch: (dir) => ipcRenderer.invoke('git:fetch', dir),
  gitLog: (dir, opts) => ipcRenderer.invoke('git:log', { dir, ...(opts || {}) }),

  // 应用菜单动作
  onMenuAction: (handler) => {
    const listener = (_e, action, payload) => handler(action, payload)
    ipcRenderer.on('menu:action', listener)
    return () => ipcRenderer.removeListener('menu:action', listener)
  }
})
