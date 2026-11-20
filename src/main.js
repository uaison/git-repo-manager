import { createApp } from 'vue'
import App from './App.vue'
import './styles/theme.css'
import { initTheme } from './theme.js'

initTheme()

const app = createApp(App)
app.mount('#app')
