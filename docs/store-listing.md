# GitNest 微软商店上架素材（草稿）

> 用途：Partner Center 提交时的商店列表（Store listing）内容草稿。
> 标注「待补」的项需要开发者提供或操作。

## 一、基本信息

| 项 | 值 |
|---|---|
| 应用名称 | GitNest |
| 包 Identity | GitNest.GitNest |
| 账号类型 | 个人（个人主体，需政府证件 + 自拍实名认证） |
| 发布者显示名 | Uaison |
| appId | io.gitnest.app |
| 类别 | Developer tools（开发者工具） |
| 支持平台 | Windows 10 版本 17763.0+ / Windows 11，x64 |
| 支持语言 | 简体中文 (zh-CN)、English (en-US) |
| 定价 | 免费（MIT 开源） |
| 年龄分级 | IARC 问卷，预计 **Everyone / 3+**（无暴力、赌博、用户生成内容或社交分享） |

## 二、简短描述（short description，≤256 字符）

- **zh-CN**：开源的 GitHub 桌面客户端，集仓库管理、提交历史、分支操作与本地 Git 于一体。Token 经系统级加密本地存储，无遥测、无自建后端，数据不出本机。
- **en-US**：An open-source GitHub desktop client combining repo management, commit history, branch operations and local Git. Tokens are stored locally with OS-level encryption — no telemetry, no backend.

## 三、完整描述（description）

**zh-CN**

GitNest 是一款基于 Electron 的开源 GitHub 桌面客户端，将 GitHub REST API 与本地 Git 操作整合到统一的桌面体验中。

- 三种登录方式：粘贴 Personal Access Token、设备码（Device Flow）、浏览器 OAuth 授权。
- 仓库管理：浏览、克隆、导入本地仓库，查看提交历史与分支。
- 本地 Git：提交、推送、拉取、差异（diff）查看、Markdown 预览。
- 安全与隐私：Token 使用操作系统级加密（Windows DPAPI / macOS Keychain / Linux libsecret）本地存储；无遥测、无崩溃上报、无自建后端，所有网络请求仅直连 GitHub 官方域名。
- 开源免费：依据 MIT License 发布。

**en-US**

GitNest is an open-source GitHub desktop client built with Electron, unifying the GitHub REST API and local Git operations in one place.

- Three sign-in methods: Personal Access Token, Device Flow, and browser OAuth.
- Repo management: browse, clone, import local repositories, view commit history and branches.
- Local Git: commit, push, pull, diff viewing and Markdown preview.
- Security & privacy: tokens stored locally with OS-level encryption (DPAPI / Keychain / libsecret); no telemetry, no crash reporting, no backend — all requests go directly to GitHub.
- Free and open source under the MIT License.

## 四、功能要点（feature bullets，每条 ≤200 字符）

- 粘贴 Token / 设备码 / 浏览器 OAuth 三种登录方式
- 浏览、克隆、导入本地 Git 仓库
- 查看提交历史与分支，支持差异对比
- 提交、推送、拉取等本地 Git 操作
- 代码差异高亮与 Markdown 预览
- Token 系统级加密本地存储，无遥测、无后端

## 五、关键词 / 搜索词（最多 7 个，每个 ≤40 字符）

GitHub · Git · 版本控制 · 仓库管理 · desktop client · 开源 · 代码

## 六、截图清单（待补 — 需开发者提供）

建议 1366×768 或 1920×1080 PNG，至少 1 张、最多 10 张：

1. 主界面 / 仓库列表
2. 提交历史 / diff 视图
3. 登录页（展示三种登录方式）
4. 分支管理界面

## 七、合规链接

- **隐私政策 URL**：`https://uaison.top/gitnest/privacy.html`（商店必填，需保持公开可匿名访问）
- 用户许可协议 URL：`https://uaison.top/gitnest/eula.html`
- 支持 / 联系邮箱：752546024@qq.com
- 许可：MIT（见 `LICENSE`）
- **代码签名证书**：走商店分发**无需自购**，认证通过后由微软免费重签。

## 八、提交前检查清单

- [ ] Partner Center 账号已注册（`storedeveloper.microsoft.com`，新流程个人/公司均免注册费）并保留应用名称 `GitNest`
- [ ] 把 `appx.identityName` / `appx.publisher` 换成 Partner Center 的 `Package/Identity` 值后重新构建 MSIX（当前 `CN=ms` 是占位，直接提交会因 Identity 不匹配被拒）
- [x] 隐私政策公开 URL 已就绪：`https://uaison.top/gitnest/privacy.html`
- [ ] 至少 1 张应用截图
- [ ] IARC 年龄分级问卷已完成
- [ ] 上传 MSIX：`release/GitNest 1.0.0.msix`（未签名包，提交后由商店免费重签）
- [ ] 商店列表各语言文案已填写
