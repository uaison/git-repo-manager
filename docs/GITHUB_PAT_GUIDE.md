# GitHub Personal Access Token (PAT) 生成指南

> **本文档适用于 [GitNest](https://github.com/uaison/github-desktop) 桌面应用用户**
> 
> GitNest 的远程仓库读写操作均通过 GitHub REST API 完成（本地提交/推送走系统 `git`）。
> 为此你需要一个 **Personal Access Token (PAT)** 来进行身份认证。

---

## 一、PAT 类型选择

GitHub 提供两种 PAT，推荐使用 **Fine-grained Token（细粒度令牌）**，更安全：

| 特性 | Fine-grained Token（推荐） | Classic Token |
|------|---------------------------|---------------|
| 权限范围 | 可精确到单个仓库 | 要么全有要么全无 |
| 权限颗粒 | 可单独勾选 Contents / Issues / Pull Requests 等 | 只能勾选 repo / admin 等大包 |
| 生成后不能改 | ❌ 可随时增删仓库和权限 | ✅ 只能删了重建 |
| 过期提醒 | ✅ 有 | ✅ 有 |
| 安全风险 | 低（最小权限原则） | 高（一旦泄露全部沦陷） |

**结论：强烈建议使用 Fine-grained Token。**

---

## 二、Fine-grained Token 生成步骤

### 1. 打开 GitHub Settings

直接访问：[https://github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)

或手动点击：**右上角头像** → **Settings** → 左侧最下方 **Developer settings** → **Personal access tokens** → **Fine-grained tokens**

### 2. 点击 "Generate new token"

### 3. 填写基本信息

| 字段 | 填写建议 |
|------|----------|
| **Token name** | `GitNest`（随便写，自己认得就行） |
| **Expiration** | 建议 `90 days` 或自定义；也可选 `No expiration` 但**有安全风险** |
| **Resource owner** | 选你自己的用户名（个人账号）或你的组织 |

### 4. 选择仓库范围

| 选项 | 适用场景 |
|------|----------|
| **Only select repositories** | ✅ **推荐**，只勾你要管理的仓库 |
| **All repositories** | 确认无误再选，权限过大 |

> 💡 如果你只想用 GitNest 操作少数仓库，选第一个，然后点进去具体勾哪些。

### 5. 选择权限（关键步骤）

往下滚到 **Permissions** 区域，把 **Repository permissions** 里的权限逐个设置：

```
Repository permissions 👇

Contents:              Read and Write   ← ⭐ 必填！读写仓库文件 / 提交代码
Metadata:              Read-only       ← ⭐ 必填！读取仓库信息（默认就是 Read-only）
Pull requests:         Read and Write   ← 可选：如果要通过 API 创建 / 管理 PR
Issues:                Read and Write   ← 可选：如果要管理 Issue
Commit statuses:       Read-only       ← 可选：查看 CI 状态
Webhooks:              No access       ← 不用开
Administration:        No access       ← 不用开
Packages:              No access       ← 不用开
Pages:                 No access       ← 不用开
Actions:               No access       ← 不用开
...其它都保持 No access
```

> ⚠️ **最小必需 = Contents (R/W) + Metadata (R)**
> 
> 如果你只是用 GitNest 浏览和编辑代码，这两项够了。

### 6. 生成 Token

点页面底部绿色大按钮 **Generate token**。

### 7. 立即复制保存 ⚠️

Token 只在这一次显示！**刷新页面就再也看不到了。**

格式类似：
```
github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
（上行为示意，请勿把他人的真实令牌粘贴到此处）

> 📋 立即复制到剪贴板 → 打开 GitNest → 粘贴到登录页的 Token 输入框 → 回车登录

---

## 三、Classic Token 生成（老方式，不推荐）

如果某些老项目只认 Classic Token，操作步骤：

1. 访问 [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. 点 **Generate new token (classic)**
3. 填写 Note 如 `GitNest`，选 Expiration
4. 勾选权限（最简单粗暴）：

```
✅ repo          Full control of private repositories    ← 至少勾这个
   ☐ repo:status
   ☐ repo_deployment
   ☐ repo:public_repo
   ☐ repo:invite
   ☐ repo_administration
   
（其它全部不勾）
```

5. 点 **Generate token** → 复制保存

---

## 四、Token 泄露了怎么办？

1. 立刻到 [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. 找到泄露的 Token，右侧点 **Delete**
3. 按本指南重新生成一个新的
4. 打开 GitNest → 点右上角 **退出** → 重新用新 Token 登录

> 🔒 最佳实践：
> - Token 只保存在本机，并用系统凭据（Windows DPAPI）加密后落盘，不以明文存储
> - 不要把 Token 写进代码或发到群里
> - 如果你怀疑 Token 泄露了，立即删除重建

---

## 五、GitNest 里怎么用

### 首次启动

1. 双击 **GitNest 1.0.0.exe**（便携版）或 **GitNest Setup 1.0.0.exe**（安装版）
2. 进入登录页
3. 把刚才复制的 Token 粘贴进去
4. 点 **登录并验证**
5. 成功跳转到仓库列表 → 开用！

### 后续启动

Token 已经加密保存在本地（`%APPDATA%\gitnest\`），下次启动自动登录，不用再输。

### 换 Token / 退出登录

1. 点仓库列表页右上角 **退出**
2. 重启应用 → 回到登录页 → 粘贴新 Token

---

## 六、常见问题

### Q: 粘贴 Token 后提示 "Bad credentials" 或 401

A: 可能原因：
- Token 复制不完整（少了开头或结尾）
- 复制到了引号 `""` 或 markdown 格式

解决：重新去 [Settings → Tokens](https://github.com/settings/tokens) 生成一个新的，**手动一字一字粘贴**。

### Q: Fine-grained Token 看不到某个我的仓库？

A: 检查：
- Resource owner 选对了吗？（比如你的组织仓库要选组织作为 owner）
- Repository access 勾上那个仓库了吗？
- 权限里 **Contents 必须设为 Read and Write**

### Q: Token 过期了怎么办？

A: GitNest 会在下次请求时报 401，你需要：
1. 到 Settings → Tokens 里删除旧的（如果还在）
2. 重新 Generate 一个
3. 在应用里退出登录 → 粘贴新 Token

### Q: 为什么不直接用账号密码？

A: GitHub 从 2021 年开始**已经彻底禁用密码身份认证**。现在所有 API 请求（包括 `git clone/push`）必须用 PAT 或 SSH key。

---

## 七、权限最小对照表

下面是 GitNest 各项功能需要的**最小权限**清单，按需勾选即可：

| 功能 | 权限 |
|------|------|
| 🔐 登录验证 | Metadata (Read) |
| 📂 浏览仓库内容 | Contents (Read) |
| 📄 编辑 + 单文件提交 | Contents (Write) |
| ⬇ 拉取（下载 zip） | Contents (Read) |
| 🚀 多文件推送（Git DB） | Contents (Write) |
| 🔍 搜索公开仓库 | 无需额外权限（公开搜索走匿名限流） |
| 🐛 Issue 管理 | Issues (Write) |
| 🔀 PR 管理 | Pull requests (Write) |

> **一句话总结：Contents (Read and Write) + Metadata (Read)** = 能完成 GitNest 的全部核心功能。

---

*Last updated: 2026-11-18 · 适配 GitNest v1.0.0*
