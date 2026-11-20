// GitHub REST API 客户端（基于 IPC 调用主进程 https）
// 所有请求走主进程 Node https 模块，绕过 git 协议 / 网络不通问题

let _token = ''

export function setToken (token) { _token = token }
export function getToken () { return _token }

// ============ 登录失效广播 ============
const _authExpiredHandlers = new Set()

export function onAuthExpired (handler) {
  _authExpiredHandlers.add(handler)
  return () => _authExpiredHandlers.delete(handler)
}

function notifyAuthExpired (reason) {
  for (const fn of _authExpiredHandlers) {
    try { fn(reason) } catch { /* 忽略单个监听器异常 */ }
  }
}

// 判断是否属于"登录失效"，统一转成 AuthError
function isAuthError (message) {
  return /\b401\b/.test(message) ||
    /Bad credentials/i.test(message) ||
    /身份验证失败/.test(message) ||
    /未登录/.test(message)
}

async function request (method, path, body, accept) {
  if (!_token) {
    notifyAuthExpired('缺少访问令牌')
    const err = new Error('登录已失效，请重新登录')
    err.isAuthError = true
    throw err
  }
  try {
    return await window.electronAPI.apiRequest({ token: _token, method, path, body, accept })
  } catch (e) {
    const msg = e?.message || String(e)
    if (isAuthError(msg)) {
      notifyAuthExpired(msg)
      const err = new Error('登录已失效，请重新登录')
      err.isAuthError = true
      throw err
    }
    throw e
  }
}

// ============ 认证 / 用户 ============
export async function getAuthUser () {
  return request('GET', '/user')
}

export async function getUserRepos (page = 1, perPage = 100) {
  return request('GET', `/user/repos?page=${page}&per_page=${perPage}&sort=updated`)
}

export async function getStarredRepos (page = 1, perPage = 100) {
  return request('GET', `/user/starred?page=${page}&per_page=${perPage}`)
}

export async function getOrgRepos (org, page = 1, perPage = 100) {
  return request('GET', `/orgs/${org}/repos?page=${page}&per_page=${perPage}`)
}

// ============ 仓库 ============
export async function getRepo (owner, repo) {
  return request('GET', `/repos/${owner}/${repo}`)
}

export async function listBranches (owner, repo) {
  return request('GET', `/repos/${owner}/${repo}/branches?per_page=100`)
}

export async function listTags (owner, repo) {
  return request('GET', `/repos/${owner}/${repo}/tags?per_page=100`)
}

// 仓库内容（文件/目录）
export async function getContents (owner, repo, path = '', ref = 'HEAD') {
  return request('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`)
}

// 获取文件（返回 content + encoding）
export async function getFile (owner, repo, filePath, ref = 'HEAD') {
  return request('GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`)
}

// 写文件 / 更新文件（commit）
export async function createOrUpdateFile (owner, repo, filePath, content, message, branch, sha) {
  const body = {
    message,
    content, // base64
    branch
  }
  if (sha) body.sha = sha
  return request('PUT', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, body)
}

// 删除文件
export async function deleteFile (owner, repo, filePath, message, branch, sha) {
  return request('DELETE', `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}`, {
    message, branch, sha
  })
}

// 获取 tree（递归列出所有文件）
export async function getTree (owner, repo, treeSha, recursive = 1) {
  return request('GET', `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=${recursive}`)
}

// 创建分支
export async function createBranch (owner, repo, branchName, sourceBranch = 'main') {
  // 1. 获取 sourceBranch 的 commit sha
  const ref = await request('GET', `/repos/${owner}/${repo}/git/ref/heads/${sourceBranch}`)
  // 2. 创建新分支引用
  return request('POST', `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha
  })
}

// 创建 Blob
export async function createBlob (owner, repo, content) {
  return request('POST', `/repos/${owner}/${repo}/git/blobs`, { content, encoding: 'base64' })
}

// 创建 Tree（批量）
export async function createTree (owner, repo, treeEntries, baseTree) {
  const body = { tree: treeEntries }
  if (baseTree) body.base_tree = baseTree
  return request('POST', `/repos/${owner}/${repo}/git/trees`, body)
}

// 创建 Commit
export async function createCommit (owner, repo, message, treeSha, parentSha) {
  const body = { message, tree: treeSha }
  if (parentSha) body.parents = [parentSha]
  return request('POST', `/repos/${owner}/${repo}/git/commits`, body)
}

// 更新分支引用
export async function updateRef (owner, repo, ref, sha) {
  return request('PATCH', `/repos/${owner}/${repo}/git/refs/${ref}`, { sha })
}

// ============ 仓库管理 ============
export async function createRepo (data) {
  return request('POST', '/user/repos', data)
}

export async function deleteRepo (owner, repo) {
  return request('DELETE', `/repos/${owner}/${repo}`)
}

// ============ Commits ============
export async function listCommits (owner, repo, path, branch, perPage = 30) {
  let qs = `?per_page=${perPage}`
  if (branch) qs += `&sha=${encodeURIComponent(branch)}`
  if (path) qs += `&path=${encodeURIComponent(path)}`
  return request('GET', `/repos/${owner}/${repo}/commits${qs}`)
}

// ============ Issues ============
export async function listIssues (owner, repo, state = 'open') {
  return request('GET', `/repos/${owner}/${repo}/issues?state=${state}&per_page=50`)
}

export async function createIssue (owner, repo, title, body) {
  return request('POST', `/repos/${owner}/${repo}/issues`, { title, body })
}

// ============ Pull Requests ============
export async function listPRs (owner, repo, state = 'open') {
  return request('GET', `/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`)
}

// ============ 搜索 ============
export async function searchRepositories (q, page = 1, perPage = 20) {
  return request('GET', `/search/repositories?q=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}&sort=stars&order=desc`)
}

// 热门仓库：按 Star 排序的高星项目
export async function getPopularRepos (perPage = 30) {
  const res = await searchRepositories('stars:>20000', 1, perPage)
  return res.items || []
}
