// 本地旁加载（sideload）构建覆盖配置。
// 与 package.json 中的 Store 基准配置隔离：仅此处设置 publisher（必须与证书 Subject 完全一致）
// 与签名证书，保持提交基准配置干净，不影响商店构建（商店会重签）。
//
// 用法：electron-builder --win appx --config electron-builder.sideload.js
const base = require('./package.json').build

module.exports = {
  ...base,
  appx: {
    ...base.appx,
    // 必须与 scripts/make-dev-cert.ps1 生成证书的 Subject 完全一致，
    // 否则 Add-AppxPackage 会报签名/发布者不匹配错误。
    publisher: 'CN=GitNest Dev Test'
  },
  win: {
    ...base.win,
    // electron-builder 26 win schema (additionalProperties:false) only accepts
    // cscLink / cscKeyPassword — NOT certificateFile / certificatePassword.
    cscLink: 'certs/GitNestDev.pfx',
    cscKeyPassword: process.env.GITNEST_PFX_PASS || 'gitnest-dev'
    // NOTE: do not set forceCodeSigning here. base.win has signAndEditExecutable:false
    // (after-pack.js flips Fuses + writes the icon manually), and electron-builder
    // rejects forceCodeSigning + signAndEditExecutable:false. The appx target still
    // signs the .msix package when cscLink is present; verify with
    // Get-AuthenticodeSignature after the build.
  }
}
