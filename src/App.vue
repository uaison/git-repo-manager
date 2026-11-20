<template>
  <div class="app">
    <!-- 登录页 -->
    <LoginView
      v-if="!username"
      :notice="authNotice"
      @success="onLoginSuccess"
    />

    <!-- 仓库详情 -->
    <RepoDetailView
      v-else-if="currentRepo"
      :repo="currentRepo"
      @back="currentRepo = null"
    />

    <!-- 仓库列表 -->
    <RepoListView
      v-else
      :username="username"
      @open-repo="openRepo"
      @logout="handleLogout"
    />

    <!-- 主题切换（跟随系统 / 亮色 / 暗色 循环） -->
    <button class="theme-toggle" :title="themeTitle" @click="onToggleTheme">
      <span>{{ themeIcon }}</span>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { setToken, onAuthExpired } from './api/github.js'
import { themeMode, cycleThemeMode, setThemeMode } from './theme.js'
import LoginView from './views/LoginView.vue'
import RepoListView from './views/RepoListView.vue'
import RepoDetailView from './views/RepoDetailView.vue'

const currentRepo = ref(null)
const username = ref('')
const authNotice = ref('')

let offAuthExpired = null
let offMenuAction = null

const themeIcon = computed(() => ({ system: '🖥️', light: '☀️', dark: '🌙' }[themeMode.value]))
const themeLabel = computed(() => ({ system: '跟随系统', light: '亮色', dark: '暗色' }[themeMode.value]))
const themeTitle = computed(() => `当前：${themeLabel.value}，点击切换`)

function onToggleTheme () {
  cycleThemeMode()
}

function openRepo (repo) {
  currentRepo.value = repo
}

async function handleLogout () {
  await window.electronAPI.setConfig('token', '')
  await window.electronAPI.setConfig('username', '')
  username.value = ''
  currentRepo.value = null
  setToken('')
}

// 登录失效：清空登录态并回到登录页，提示重新登录
async function handleAuthExpired () {
  if (!username.value) return   // 已在登录页，不重复处理
  currentRepo.value = null
  username.value = ''
  setToken('')
  authNotice.value = '登录已失效，请重新登录。'
  try {
    await window.electronAPI.setConfig('token', '')
    await window.electronAPI.setConfig('username', '')
  } catch { /* 忽略 */ }
}

function onLoginSuccess (user) {
  authNotice.value = ''
  username.value = user.login
}

onMounted(async () => {
  offAuthExpired = onAuthExpired(handleAuthExpired)

  // 菜单栏动作
  offMenuAction = window.electronAPI.onMenuAction((action, payload) => {
    if (action === 'back') {
      currentRepo.value = null
    } else if (action === 'theme') {
      if (payload === 'cycle') cycleThemeMode()
      else setThemeMode(payload)
    }
  })

  const cfg = await window.electronAPI.getConfig()
  if (cfg.token && cfg.username) {
    setToken(cfg.token)
    username.value = cfg.username
  }
  // 否则 username 保持空 → 自动显示 LoginView
})

onBeforeUnmount(() => {
  if (offAuthExpired) offAuthExpired()
  if (offMenuAction) offMenuAction()
})
</script>

<style scoped>
.app { width: 100%; height: 100%; }

.theme-toggle {
  position: fixed; top: 9px; right: 12px; z-index: 999;
  width: 32px; height: 32px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: var(--header-btn-bg); color: var(--header-text);
  border: 1px solid var(--header-btn-border); box-shadow: 0 2px 8px var(--shadow);
  font-size: 15px; cursor: pointer; transition: all .15s;
  opacity: .85;
}
.theme-toggle:hover { opacity: 1; border-color: var(--accent); transform: scale(1.06); }
</style>
