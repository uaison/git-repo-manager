<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo">
        <img src="../assets/logo.png" alt="logo" class="logo-img" />
      </div>
      <h1>GitNest</h1>
      <p class="subtitle">选择一种登录方式开始使用</p>

      <!-- 登录失效提示 -->
      <div v-if="notice" class="auth-notice">
        <span class="notice-icon">⚠️</span>
        <span>{{ notice }}</span>
      </div>

      <!-- 登录方式 Tab 切换 -->
      <div class="auth-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          :class="['tab', activeTab === t.key ? 'active' : '']"
          @click="activeTab = t.key"
        >
          <span class="tab-icon">{{ t.icon }}</span>
          {{ t.label }}
        </button>
        <button class="gear" title="OAuth 设置" @click="showSettings = true">⚙️</button>
      </div>

      <div class="guide-row">
        <a class="link" @click.prevent="openHelpDoc('auth')">📖 三种登录方式的 Key / Client ID 获取指南</a>
      </div>

      <!-- PAT Token 登录 -->
      <div v-if="activeTab === 'pat'" class="form">
        <label>Personal Access Token</label>
        <input
          v-model="token"
          type="password"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          spellcheck="false"
        />
        <div class="tip-row">
          <a @click.prevent="openExternal('https://github.com/settings/tokens?type=beta')" class="link">
            ➜ 生成 Fine-grained Token（推荐）
          </a>
          <a @click.prevent="openExternal('https://github.com/settings/tokens/new')" class="link muted">
            Classic Token
          </a>
        </div>

        <button class="btn-primary" :disabled="!token.trim() || loading" @click="loginWithToken">
          <span v-if="loading">验证中...</span>
          <span v-else>🚀 登录并验证</span>
        </button>
      </div>

      <!-- OAuth Device Flow -->
      <div v-if="activeTab === 'device'" class="form">
        <div v-if="!deviceStarted" class="step-ready">
          <p class="step-desc">
            这是 GitHub CLI 同款的登录方式：<br>
            应用生成一个设备码 → 你在浏览器输入授权 → 自动拿到 Token。<br>
            <strong>需要先配置 OAuth Client ID（点右上角 ⚙️）</strong>
          </p>

          <div v-if="!oauthClientId" class="warn-box">
            ⚠️ 尚未配置 OAuth Client ID，请先点右上角 ⚙️ 注册一个 GitHub OAuth App
          </div>

          <button class="btn-primary" :disabled="!oauthClientId || deviceLoading" @click="startDeviceFlow">
            <span v-if="deviceLoading">请求设备码...</span>
            <span v-else>📱 开始设备登录</span>
          </button>
        </div>

        <div v-else class="step-device">
          <div class="device-code-box">
            <p class="label">请在浏览器访问：</p>
            <button class="btn-uri" @click="openExternal(deviceVerUri)">
              {{ deviceVerUri }}
              <span class="copy">↗</span>
            </button>

            <p class="label" style="margin-top:16px">然后输入这个代码：</p>
            <div class="code-display" @click="copyCode">
              <span class="code-text">{{ deviceUserCode }}</span>
              <span class="code-copy">点击复制</span>
            </div>
          </div>

          <div class="polling-status">
            <div class="spinner"></div>
            <span>{{ pollStatus }}</span>
            <span class="countdown" v-if="deviceExpiresAt">剩余 {{ deviceCountdown }}秒</span>
          </div>

          <div class="btns-row">
            <button class="btn-secondary" @click="cancelDeviceFlow">取消</button>
          </div>
        </div>
      </div>

      <!-- Web OAuth（localhost 回跳） -->
      <div v-if="activeTab === 'web'" class="form">
        <div v-if="!webStarted" class="step-ready">
          <p class="step-desc">
            标准 OAuth 网页授权：浏览器登录授权后，<br>
            通过本地临时 HTTP 服务器自动接收回调。<br>
            <strong>同样需要 OAuth Client ID</strong>
          </p>

          <div v-if="!oauthClientId" class="warn-box">
            ⚠️ 未配置 OAuth Client ID
          </div>

          <button class="btn-primary" :disabled="!oauthClientId" @click="startWebOAuth">
            🌐 打开浏览器授权
          </button>
        </div>

        <div v-else class="step-web">
          <p class="step-desc">
            浏览器应该已经弹出，请在浏览器中完成授权。<br>
            本地回调服务器正在等待：<code>{{ localCallbackUrl }}</code>
          </p>
          <div class="polling-status">
            <div class="spinner"></div>
            <span>{{ webStatus }}</span>
          </div>
          <div class="btns-row">
            <button class="btn-secondary" @click="cancelWebOAuth">取消</button>
          </div>
        </div>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="successMsg" class="success">{{ successMsg }}</p>
    </div>

    <!-- 设置弹窗 -->
    <div v-if="showSettings" class="modal-mask" @click.self="showSettings = false">
      <div class="modal">
        <h3>⚙️ OAuth 设置</h3>
        <p class="modal-desc">
          Device Flow 和 Web OAuth 都需要 GitHub OAuth App 的 Client ID。<br>
          <a @click.prevent="openExternal('https://github.com/settings/developers')" class="link">
            → 到 GitHub Developers 页面注册一个
          </a>
        </p>

        <label>OAuth App Client ID</label>
        <input v-model="oauthClientId" placeholder="Iv1.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" spellcheck="false" />

        <p class="modal-tip">
          注册 OAuth App 时：<br>
          • Application name: 随便写，如 GitNest<br>
          • Homepage URL: <code>https://github.com</code><br>
          • Authorization callback URL: <code>http://127.0.0.1:8765/callback</code>
        </p>

        <div class="modal-actions">
          <button class="btn-secondary" @click="showSettings = false">关闭</button>
          <button class="btn-primary" @click="saveOAuthSettings">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { setToken, getAuthUser } from '../api/github.js'

const props = defineProps({
  notice: { type: String, default: '' }
})
const emit = defineEmits(['success'])

const tabs = [
  { key: 'pat', label: 'Token 粘贴', icon: '🔑' },
  { key: 'device', label: '设备码登录', icon: '📱' },
  { key: 'web', label: '浏览器授权', icon: '🌐' }
]

const activeTab = ref('pat')
const error = ref('')
const successMsg = ref('')

// ========== PAT ==========
const token = ref('')
const loading = ref(false)

async function loginWithToken () {
  if (!token.value.trim()) return
  loading.value = true; error.value = ''
  try {
    setToken(token.value.trim())
    const user = await getAuthUser()
    await window.electronAPI.setConfig('token', token.value.trim())
    await window.electronAPI.setConfig('username', user.login)
    emit('success', user)
  } catch (e) {
    error.value = e.isAuthError
      ? 'Token 无效或已过期，请检查后重试'
      : (e.message || 'Token 无效或网络错误')
  } finally { loading.value = false }
}

// ========== OAuth Client ID 配置 ==========
const showSettings = ref(false)
const oauthClientId = ref('')

onMounted(async () => {
  const cfg = await window.electronAPI.getConfig()
  if (cfg.oauthClientId) oauthClientId.value = cfg.oauthClientId
})

async function saveOAuthSettings () {
  await window.electronAPI.setConfig('oauthClientId', oauthClientId.value.trim())
  successMsg.value = '✅ 已保存 OAuth Client ID'
  setTimeout(() => { successMsg.value = '' }, 2500)
  showSettings.value = false
}

// ========== Device Flow ==========
const deviceStarted = ref(false)
const deviceLoading = ref(false)
const deviceCode = ref('')
const deviceUserCode = ref('')
const deviceVerUri = ref('')
const deviceVerUriComplete = ref('')
const deviceExpiresIn = ref(900)
const deviceInterval = ref(5)
const deviceExpiresAt = ref(0)
const pollTimer = ref(null)
const pollStatus = ref('等待浏览器授权...')
const deviceCountdown = ref(0)
let countdownTimer = null

const deviceScope = 'repo' // 读写仓库权限

async function startDeviceFlow () {
  if (!oauthClientId.value) { error.value = '请先配置 OAuth Client ID'; return }
  deviceLoading.value = true; error.value = ''
  try {
    const resp = await window.electronAPI.httpsRequest({
      host: 'github.com',
      method: 'POST',
      path: '/login/device/code',
      body: { client_id: oauthClientId.value, scope: deviceScope }
    })
    if (resp.status >= 400) { throw new Error(resp.data.error_description || JSON.stringify(resp.data)) }

    deviceCode.value = resp.data.device_code
    deviceUserCode.value = resp.data.user_code
    deviceVerUri.value = resp.data.verification_uri
    deviceVerUriComplete.value = resp.data.verification_uri_complete || resp.data.verification_uri
    deviceExpiresIn.value = resp.data.expires_in || 900
    deviceInterval.value = resp.data.interval || 5
    deviceExpiresAt.value = Date.now() + deviceExpiresIn.value * 1000

    deviceStarted.value = true
    pollStatus.value = '等待浏览器授权...'
    startCountdown()
    startPolling()
  } catch (e) {
    error.value = 'Device Flow 启动失败: ' + (e.message || JSON.stringify(e))
  } finally { deviceLoading.value = false }
}

function copyCode () {
  navigator.clipboard?.writeText(deviceUserCode.value)
  pollStatus.value = '代码已复制到剪贴板！'
  setTimeout(() => { pollStatus.value = '等待浏览器授权...' }, 1500)
}

function startCountdown () {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    const left = Math.max(0, Math.floor((deviceExpiresAt.value - Date.now()) / 1000))
    deviceCountdown.value = left
    if (left === 0) { cancelDeviceFlow(); error.value = '设备码已过期，请重新发起' }
  }, 1000)
}

function startPolling () {
  const interval = deviceInterval.value * 1000
  pollTimer.value = setTimeout(async function poll () {
    try {
      const resp = await window.electronAPI.httpsRequest({
        host: 'github.com',
        method: 'POST',
        path: '/login/oauth/access_token',
        body: {
          client_id: oauthClientId.value,
          device_code: deviceCode.value,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        }
      })
      const d = resp.data
      if (d.access_token) {
        // 成功！
        clearTimeout(pollTimer.value)
        if (countdownTimer) clearInterval(countdownTimer)
        pollStatus.value = '✅ 授权成功！正在登录...'
        setToken(d.access_token)
        const user = await getAuthUser()
        await window.electronAPI.setConfig('token', d.access_token)
        await window.electronAPI.setConfig('username', user.login)
        emit('success', user)
        return
      }
      if (d.error === 'authorization_pending') {
        pollStatus.value = '等待浏览器授权...'
      } else if (d.error === 'slow_down') {
        pollStatus.value = '请求过快，稍等...'
        pollTimer.value = setTimeout(poll, interval + 5000)
        return
      } else if (d.error === 'access_denied') {
        cancelDeviceFlow()
        error.value = '你取消了授权'
        return
      } else if (d.error === 'expired_token') {
        cancelDeviceFlow()
        error.value = '设备码已过期'
        return
      } else {
        pollStatus.value = '未知状态: ' + d.error
      }
      pollTimer.value = setTimeout(poll, interval)
    } catch (e) {
      pollTimer.value = setTimeout(poll, interval)
    }
  }, interval)
}

function cancelDeviceFlow () {
  if (pollTimer.value) clearTimeout(pollTimer.value)
  if (countdownTimer) clearInterval(countdownTimer)
  deviceStarted.value = false
}

// ========== Web OAuth (localhost callback) ==========
const webStarted = ref(false)
const webStatus = ref('')
const localCallbackUrl = ref('http://127.0.0.1:8765/callback')

async function startWebOAuth () {
  if (!oauthClientId.value) { error.value = '请先配置 OAuth Client ID'; return }
  error.value = ''

  // 先启动本地回调服务器
  try {
    const { success, url } = await window.electronAPI.oauthStartCallback()
    if (!success) { error.value = '回调服务器启动失败'; return }
    localCallbackUrl.value = url
  } catch (e) {
    error.value = '端口 8765 可能被占用: ' + (e.message || e.data?.message || '')
    return
  }

  const authorizeUrl = `https://github.com/login/oauth/authorize?client_id=${oauthClientId.value}&redirect_uri=${encodeURIComponent(localCallbackUrl.value)}&scope=${encodeURIComponent(deviceScope)}&response_type=code`

  webStarted.value = true
  webStatus.value = '等待浏览器回调 (port 8765)...'
  openExternal(authorizeUrl)

  // 轮询主进程 config 中是否收到了 code
  pollWebCallback()
}

let webPollTimer = null
function pollWebCallback () {
  webPollTimer = setInterval(async () => {
    try {
      const cfg = await window.electronAPI.getConfig()
      if (cfg._oauthCode) {
        clearInterval(webPollTimer)
        await window.electronAPI.setConfig('_oauthCode', '')
        // 换 access token
        const resp = await window.electronAPI.httpsRequest({
          host: 'github.com',
          method: 'POST',
          path: '/login/oauth/access_token',
          body: {
            client_id: oauthClientId.value,
            code: cfg._oauthCode
          }
        })
        if (resp.data.access_token) {
          setToken(resp.data.access_token)
          const user = await getAuthUser()
          await window.electronAPI.setConfig('token', resp.data.access_token)
          await window.electronAPI.setConfig('username', user.login)
          emit('success', user)
        } else {
          error.value = '换 token 失败: ' + JSON.stringify(resp.data)
        }
      }
    } catch (e) { /* ignore */ }
  }, 1500)
}

function cancelWebOAuth () {
  if (webPollTimer) clearInterval(webPollTimer)
  window.electronAPI.oauthStopCallback().catch(() => {})
  webStarted.value = false
}

function openExternal (url) {
  window.electronAPI.openExternal(url)
}

// 打开内置使用指南（登录方式章节）
function openHelpDoc (hash) {
  window.electronAPI.openHelp(hash)
}

onUnmounted(() => {
  if (pollTimer.value) clearTimeout(pollTimer.value)
  if (webPollTimer) clearInterval(webPollTimer)
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<style scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
}
.login-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 32px 40px;
  width: 480px;
  box-shadow: 0 12px 48px var(--shadow);
  color: var(--text);
}
.logo { text-align: center; margin-bottom: 12px; color: var(--text-strong); }
.logo-img { width: 64px; height: 64px; border-radius: 14px; vertical-align: middle; }
h1 { text-align: center; font-size: 22px; margin-bottom: 4px; color: var(--text); }
.subtitle { text-align: center; color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }

.auth-notice {
  display: flex; align-items: center; gap: 10px;
  background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text);
  padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 18px;
}
.auth-notice .notice-icon { font-size: 16px; }

.auth-tabs {
  display: flex; gap: 4px; background: var(--bg-inset); padding: 4px; border-radius: 8px; margin-bottom: 10px;
  align-items: center;
}
.guide-row { text-align: right; margin-bottom: 14px; font-size: 12px; }
.tab {
  flex: 1; padding: 8px 10px; background: transparent; border: none; border-radius: 6px;
  font-size: 12px; cursor: pointer; color: var(--text-secondary); font-weight: 500;
  display: flex; align-items: center; justify-content: center; gap: 4px;
  transition: background .15s;
}
.tab:hover { background: var(--bg-hover); }
.tab.active { background: var(--bg-elevated); color: var(--accent); box-shadow: 0 1px 3px var(--shadow); font-weight: 600; }
.tab-icon { font-size: 14px; }
.gear {
  padding: 8px 10px; background: transparent; border: none; cursor: pointer;
  font-size: 14px; color: var(--text-secondary); border-radius: 6px;
}
.gear:hover { background: var(--bg-hover); }

.form label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px; color: var(--text); }
.form input {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px;
  font-size: 14px; outline: none; transition: border-color .2s;
  font-family: Consolas, Monaco, monospace;
  background: var(--bg-elevated); color: var(--text);
}
.form input::placeholder { color: var(--text-muted); }
.form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.tip-row { display: flex; justify-content: space-between; margin-top: 8px; }
.link { color: var(--accent); text-decoration: none; font-size: 12px; cursor: pointer; }
.link:hover { text-decoration: underline; }
.link.muted { color: var(--text-secondary); }

.btn-primary {
  width: 100%; padding: 10px; background: var(--success); color: var(--on-accent); border: none;
  border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;
  transition: background .2s; margin-top: 16px;
}
.btn-primary:hover:not(:disabled) { background: var(--success-hover); }
.btn-primary:disabled { background: var(--success); opacity: .55; cursor: not-allowed; }

.btn-secondary {
  padding: 8px 16px; background: transparent; border: 1px solid var(--border);
  border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--text-secondary);
}
.btn-secondary:hover { background: var(--bg-hover); }

.btns-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }

.error { color: var(--danger); margin-top: 12px; font-size: 13px; text-align: center; }
.success { color: var(--success); margin-top: 12px; font-size: 13px; text-align: center; }

.step-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px; }
.warn-box {
  padding: 10px 12px; background: var(--warn-bg); border: 1px solid var(--warn-border); color: var(--warn-text);
  border-radius: 6px; font-size: 12px; margin-bottom: 12px;
}

.device-code-box {
  background: var(--bg-inset); border-radius: 8px; padding: 20px; text-align: center;
}
.label { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.btn-uri {
  background: var(--accent); color: var(--on-accent); border: none; padding: 10px 18px;
  border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 8px;
}
.btn-uri:hover { background: var(--accent-hover); }
.btn-uri .copy { font-size: 14px; opacity: .8; }

.code-display {
  background: var(--code-bg); color: var(--success); padding: 14px 20px; border-radius: 6px;
  border: 1px solid var(--border);
  font-family: Consolas, 'Cascadia Code', monospace; font-size: 22px; font-weight: 700;
  letter-spacing: 4px; cursor: pointer; user-select: all;
  display: flex; justify-content: center; align-items: center; gap: 16px;
}
.code-copy { font-size: 11px; color: var(--text-muted); letter-spacing: normal; font-weight: normal; }

.polling-status {
  display: flex; align-items: center; gap: 10px; margin-top: 16px;
  font-size: 13px; color: var(--text-secondary); justify-content: center;
}
.countdown { color: var(--text-muted); font-family: Consolas, monospace; }

.spinner {
  width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent);
  border-radius: 50%; animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg) } }

/* Modal */
.modal-mask {
  position: fixed; inset: 0; background: var(--overlay);
  display: flex; align-items: center; justify-content: center; z-index: 999;
}
.modal {
  background: var(--bg-elevated); color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px; padding: 24px; width: 460px;
  box-shadow: 0 16px 48px var(--shadow);
}
.modal h3 { margin-bottom: 6px; }
.modal-desc { color: var(--text-secondary); font-size: 13px; margin-bottom: 12px; line-height: 1.6; }
.modal-desc a { color: var(--accent); cursor: pointer; }
.modal-tip {
  background: var(--bg-inset); padding: 10px 12px; border-radius: 6px;
  font-size: 12px; color: var(--text-secondary); margin-top: 10px; line-height: 1.7;
}
.modal-tip code {
  background: var(--bg-elevated); border: 1px solid var(--border); padding: 1px 6px; border-radius: 3px;
  font-family: Consolas, monospace; font-size: 11px; color: var(--text);
}
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
