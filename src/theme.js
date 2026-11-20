// 主题管理：跟随系统 / 亮色 / 暗色
import { ref, computed } from 'vue'
import lightHljs from 'highlight.js/styles/github.css?inline'
import darkHljs from 'highlight.js/styles/github-dark.css?inline'

export const themeMode = ref('system') // 'system' | 'light' | 'dark'
const systemDark = ref(false)

export const resolvedTheme = computed(() => {
  if (themeMode.value === 'system') return systemDark.value ? 'dark' : 'light'
  return themeMode.value
})

let hljsStyleEl = null

function applyHljs (theme) {
  if (!hljsStyleEl) {
    hljsStyleEl = document.createElement('style')
    hljsStyleEl.id = 'hljs-theme'
    document.head.appendChild(hljsStyleEl)
  }
  hljsStyleEl.textContent = theme === 'dark' ? darkHljs : lightHljs
}

function apply () {
  const theme = resolvedTheme.value
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  applyHljs(theme)
}

export async function initTheme () {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mq.matches
  mq.addEventListener('change', (e) => {
    systemDark.value = e.matches
    apply()
  })
  try {
    const cfg = await window.electronAPI.getConfig()
    if (['system', 'light', 'dark'].includes(cfg.themeMode)) {
      themeMode.value = cfg.themeMode
    }
  } catch { /* 忽略读取失败 */ }
  apply()
}

export async function setThemeMode (mode) {
  themeMode.value = mode
  apply()
  try {
    await window.electronAPI.setConfig('themeMode', mode)
  } catch { /* 忽略持久化失败 */ }
}

export function cycleThemeMode () {
  const order = ['system', 'light', 'dark']
  const next = order[(order.indexOf(themeMode.value) + 1) % order.length]
  setThemeMode(next)
  return next
}
