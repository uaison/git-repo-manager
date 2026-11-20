# GitNest

> 纯 GitHub REST API + 本地 Git 的桌面仓库管理工具 · 版本 1.0.0 · MIT License

## 📌 背景与目的

很多内网 / 受限网络环境会出现一种"半通"状态：**git 协议不通**（SSH 22、git:// 9418 被拦截），
但 **HTTPS 访问 `api.github.com` 是可行的**。此时命令行 `git clone` / `git push` 会长时间卡住或直接失败，
官方 GitHub Desktop 因为强依赖本地 git 网络协议，同样无法完成操作。

GitNest 正是为这种场景设计：

- **能走 API 的走 API**：仓库浏览、文件读写、在线提交全部经 GitHub REST API（443），不依赖 git 协议端口。
- **该落地的落地**：下载 zip 后初始化真实 Git 仓库，之后的提交 / 推送 / 拉取 / 分支走系统 `git`，历史真实可查。
- **不做静默破坏**：提交前确认、推送前列出待推送提交、拉取前选择 merge / rebase。
- **零后端**：凭据与配置只保存在本机，不经过任何自建服务器。

目标不是复刻所有 Git 客户端能力，而是在受限网络下给出一条能真正完成日常协作的路径。

## ✨ 功能

| 模块 | 能力 |
|------|------|
| 🔐 认证 | Personal Access Token / OAuth Device Flow / Web OAuth（本地回调） |
| 📂 仓库列表 | 远程仓库、本地仓库、星标、热门；搜索、刷新、新建、管理（含删除远程二次确认） |
| 🌲 文件浏览 | 递归文件树、代码预览（跟随主题）、单文件历史、在线编辑提交 |
| 📝 本地改动 | 勾选暂存、内联 diff、提交、推送（列出待推送提交）、拉取（merge / rebase） |
| 🌿 分支 | 切换、新建、删除，领先 / 落后提交数提示 |
| ⬇ 下载并初始化 | 下载分支 zip → 解压 → `git init` → 关联 origin → 加入本地仓库列表 |
| 🔗 关联远程 | 本地目录与 GitHub 仓库绑定（支持下拉选择或手输） |

## 🚀 快速开始

```bash
cd gitnest
npm install            # 需要 Node 18+
npm run dev            # 开发模式（Vite + Electron）
npm run build          # 构建渲染层
npm run build:win      # 打包 Windows（NSIS 安装包 + 便携版）
```

产物位于 `release/`：

| 文件 | 用途 |
|------|------|
| `GitNest Setup 1.0.0.exe` | 安装版（可选目录、创建快捷方式、可卸载） |
| `GitNest 1.0.0.exe` | 便携版（单文件，不写注册表） |
| `win-unpacked/` | 绿色目录，直接运行其中的 exe |

## 🔑 三种登录方式

完整图文步骤见应用内 **帮助 → 使用指南（F1）**，或 [`electron/help.html`](electron/help.html)。

### 1. Personal Access Token（推荐起步）

1. 打开 [Fine-grained tokens](https://github.com/settings/tokens?type=beta) 或 [Classic tokens](https://github.com/settings/tokens/new)
2. Fine-grained：Repository access 选所需仓库，**Contents → Read and write**
   Classic：勾选整个 **repo** 大类
3. 生成后复制（只显示一次），在登录页「Token 粘贴」提交

### 2. OAuth Device Flow（设备码，只需 Client ID）

1. [Settings → Developer settings → OAuth Apps](https://github.com/settings/developers) → New OAuth App
2. 任意填写名称与 Homepage URL，Callback URL 填 `https://github.com`
3. **务必勾选 `Enable Device Flow`**（否则返回 `device_flow_disabled`）
4. 复制 **Client ID** → 登录页 ⚙️ 中保存 → 选「设备码」→ 浏览器输入验证码授权

### 3. Web OAuth（网页授权 + 本地回调）

1. 新建 OAuth App，Callback URL 精确填 `http://127.0.0.1:8765/callback`
2. 复制 **Client ID** 填入 ⚙️
3. 选「网页授权」→ 浏览器 Authorize → 本机 8765 端口接收回调完成登录

> 若提示端口占用，先释放 8765；若换 token 失败，多为回调地址不一致，建议改用设备码方式。

## 🧭 操作要点

- **本地仓库 · 本地改动**：左侧勾选暂存，右侧看差异，底部写提交信息；提交有确认弹窗。
- **推送**：弹窗列出待推送提交与分支映射，确认后执行 `git push`（HTTPS 自动注入 token，SSH 走本机密钥）。
- **拉取 / 更新**：可选合并或变基，并记忆选择；本地有未提交改动时会提示风险。
- **下载并初始化**：远程仓库一键落地为可提交、可推送的本地仓库，并自动登记到「本地仓库」。

## 🏗️ 架构

```
gitnest/
├── electron/
│   ├── main.js        # 主进程：GitHub API、文件系统、git 执行、IPC、菜单
│   ├── preload.js     # contextBridge 暴露最小接口
│   ├── help.html      # 内置使用指南（帮助窗口）
│   └── assets/        # 应用图标
├── src/
│   ├── api/github.js  # GitHub REST API 封装
│   ├── views/         # LoginView / RepoListView / RepoDetailView
│   └── styles/        # 主题变量
├── scripts/           # 打包后处理（写入 exe 图标）
└── docs/              # 补充文档
```

技术栈：Electron 33 · Vue 3 Composition API · Vite 5 · 原生 CSS 主题变量 · 本地 Git CLI。

## 🛡️ 网络策略

- 浏览与在线提交：仅需 `api.github.com`（443）
- 下载快照：`codeload.github.com`（443）
- 本地 Git 推送 / 拉取：HTTPS（注入 token）或 SSH（本机密钥）
- 不依赖 22 / 9418 端口，不需要自建代理服务

## 📄 文档

- [三种登录方式与应用操作指南](electron/help.html)（应用内 F1 打开）
- [Personal Access Token 详解](docs/GITHUB_PAT_GUIDE.md)

## 📝 License

MIT
