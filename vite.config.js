import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import JavaScriptObfuscator from 'javascript-obfuscator'
import path from 'path'

// 生产打包时的渲染层代码混淆（npm run build:obf 触发）
// 开发模式与普通 build 不启用，保持可读与构建速度。
function obfuscateRenderer () {
  return {
    name: 'obfuscate-renderer',
    apply: 'build',
    enforce: 'post',
    generateBundle (_options, bundle) {
      if (process.env.OBFUSCATE !== '1') return
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk' || !fileName.endsWith('.js')) continue
        const started = Date.now()
        const result = JavaScriptObfuscator.obfuscate(output.code, {
          compact: true,
          identifierNamesGenerator: 'hexadecimal',
          renameGlobals: false,
          renameProperties: false,
          // 字符串常量抽取到数组，提升静态阅读难度
          stringArray: true,
          stringArrayThreshold: 0.75,
          stringArrayRotate: true,
          stringArrayShuffle: true,
          stringArrayEncoding: [],
          splitStrings: false,
          // 控制流平坦化：大幅提升静态阅读难度，仅对部分语句生效以控制启动耗时
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.75,
          // 关闭副作用较大的选项，避免拖慢启动或引入运行时异常
          deadCodeInjection: false,
          debugProtection: false,
          selfDefending: false,
          transformObjectKeys: false,
          disableConsoleOutput: false,
          unicodeEscapeSequence: false
        })
        output.code = result.getObfuscatedCode()
        console.log(`[obfuscate] ${fileName} → ${(output.code.length / 1024).toFixed(0)} KB (${Date.now() - started}ms)`)
      }
    }
  }
}

export default defineConfig({
  plugins: [vue(), obfuscateRenderer()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
