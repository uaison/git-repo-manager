// 打包后处理：
// 1) 翻转 Electron Fuses，关闭 RunAsNode / NODE_OPTIONS / --inspect 等调试入口
// 2) 把主程序 exe 的图标替换为 build/icon.ico
//    背景：win.signAndEditExecutable=false（避免 winCodeSign 下载/解压失败），
//    因此需要手动调用 rcedit 写入 exe 图标。
// 注意：Fuses 必须在 rcedit 之前执行，避免改写资源后破坏 fuse 校验位。
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function findRcedit () {
  const cacheRoot = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'winCodeSign')
  const candidates = [path.join(cacheRoot, 'rcedit-x64.exe')]
  try {
    for (const name of fs.readdirSync(cacheRoot)) {
      candidates.push(path.join(cacheRoot, name, 'rcedit-x64.exe'))
    }
  } catch { /* 缓存目录不存在则忽略 */ }
  return candidates.find(p => {
    try { return fs.statSync(p).size > 0 } catch { return false }
  })
}

async function applyFuses (exe) {
  try {
    const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
    await flipFuses(exe, {
      version: FuseVersion.V1,
      resetAdHocDarwinSignature: false,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
    console.log('[after-pack] 已写入 Electron Fuses:', exe)
  } catch (e) {
    console.error('[after-pack] Fuses 写入失败:', e.message)
  }
}

module.exports = async function afterPack (context) {
  if (context.electronPlatformName !== 'win32') return

  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
  const ico = path.join(__dirname, '..', 'build', 'icon.ico')
  if (!fs.existsSync(exe)) return

  await applyFuses(exe)

  // 写 exe 图标（找不到 ico / rcedit 则跳过，但不提前 return，以免影响后面的签名）
  if (fs.existsSync(ico)) {
    const rcedit = findRcedit()
    if (rcedit) {
      execFileSync(rcedit, [exe, '--set-icon', ico], { windowsHide: true })
      console.log('[after-pack] 已写入 exe 图标:', exe)
    } else {
      console.warn('[after-pack] 未找到 rcedit-x64.exe，跳过 exe 图标写入')
    }
  }

  // 可选：对 app exe 代码签名。必须在 Fuses + rcedit 之后，否则后续修改会破坏签名。
  // 仅当设置签名环境变量时启用；正式证书到位后无需改代码：
  //   GITNEST_SIGN_SUBJECT="CN=Your Company, Inc."   （证书已在存储区，推荐 OV/EV）
  //   或 GITNEST_SIGN_PFX=<path>（密码用 GITNEST_PFX_PASS）
  const subject = process.env.GITNEST_SIGN_SUBJECT
  const pfx = process.env.GITNEST_SIGN_PFX
  if (subject || pfx) {
    const signScript = path.join(__dirname, 'sign-release.ps1')
    const args = ['-ExecutionPolicy', 'Bypass', '-File', signScript, '-Target', exe]
    if (subject) args.push('-CertSubject', subject)
    if (pfx) args.push('-PfxPath', pfx)
    try {
      execFileSync('powershell', args, { stdio: 'inherit', windowsHide: true })
      console.log('[after-pack] 已签名 app exe:', exe)
    } catch (e) {
      console.error('[after-pack] app exe 签名失败:', e.message)
    }
  }
}
