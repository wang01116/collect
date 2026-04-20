# 藏·索引 v7 — 账号授权系统

> 部署到 Vercel，Token 隐藏在环境变量中，支持公共收藏 + 私人收藏 + 管理员后台。

---

## 目录结构

```
cang-vercel/
├── api/
│   ├── _lib.js          # 共享工具（JWT / bcrypt / GitHub / KV）
│   ├── auth.js          # 登录 / 注册 / 修改密码
│   ├── users.js         # 用户管理（管理员专用）
│   ├── collection.js    # 公共收藏 CRUD
│   └── private.js       # 私人收藏 CRUD
├── public/
│   └── index.html       # 前端页面
├── package.json
└── vercel.json
```

---

## 三层权限模型

| 角色 | 登录方式 | 公共收藏 | 私人收藏 | 用户管理 |
|------|---------|---------|---------|---------|
| **访客** | 不登录 | 只读 | 不可见 | 不可见 |
| **普通用户** | 用户名 + 密码 | 读 + 增/改/删（自己创建的） | 完整 CRUD（仅自己） | 不可见 |
| **管理员** | GitHub Token | 完整 CRUD（所有条目） | 可查看任意用户 | 完整管理 |

---

## 快速部署

### 第一步：准备 GitHub 仓库

1. 在 GitHub 创建一个新仓库（如 `my-collection`），可以是私有仓库
2. 在仓库中手动创建以下目录结构（新建一个占位文件即可）：

```
data/
  public/
    collection.json    ← 内容：[]
  private/             ← 空目录（可放 .gitkeep）
  users/               ← 空目录
```

3. 创建 **Fine-grained Personal Access Token**：
   - GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained
   - Repository access: 选择你的收藏仓库
   - Permissions → Contents: **Read and write**
   - 复制生成的 Token（格式：`github_pat_xxx`）

### 第二步：部署到 Vercel

```bash
# 克隆或下载此项目
cd cang-vercel
npm install

# 安装 Vercel CLI（如未安装）
npm i -g vercel

# 部署
vercel
```

### 第三步：添加 Vercel KV

1. Vercel Dashboard → 你的项目 → Storage → Create Database → KV
2. 连接到项目后，KV 连接信息会自动注入为环境变量

### 第四步：配置环境变量

在 Vercel Dashboard → 项目 → Settings → Environment Variables 中添加：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `GITHUB_TOKEN` | GitHub Fine-grained PAT | `github_pat_xxx` |
| `GITHUB_REPO` | 仓库（owner/repo 格式） | `alice/my-collection` |
| `ADMIN_TOKEN` | 管理员直登 Token（自己设定，要复杂） | `your-secret-admin-token-2024` |
| `JWT_SECRET` | JWT 签名密钥（随机字符串，>=32位） | `super-secret-jwt-key-xyz-2024` |
| `INVITE_CODE` | 注册邀请码（可选，留空则关闭邀请码注册） | `invite-2024` |
| `KV_REST_API_URL` | Vercel KV 自动注入 | — |
| `KV_REST_API_TOKEN` | Vercel KV 自动注入 | — |

> 所有敏感变量均**不会**出现在前端代码中，只在服务端 API 函数中读取。

### 第五步：重新部署

添加环境变量后，触发一次重新部署使其生效：

```bash
vercel --prod
```

---

## 首次使用

1. 访问你的 Vercel 部署地址
2. 点击右上角「👤 登录」→「管理员 Token」标签
3. 输入 `ADMIN_TOKEN` 环境变量的值
4. 进入管理员模式后，点击「🛡️ 用户管理」→「＋ 创建用户」
5. 创建普通用户账号，系统会生成初始密码——复制并告知用户

---

## API 接口文档

### 认证接口 `/api/auth`

```
POST /api/auth/login
Body: { "username": "alice", "password": "xxx" }
      或: { "adminToken": "your-admin-token" }
返回: { "token": "eyJ...", "user": {...} }

POST /api/auth/register
Body: { "username": "alice", "password": "xxx", "inviteCode": "可选" }

GET  /api/auth/me
Header: Authorization: Bearer <token>

POST /api/auth/password
Body: { "oldPassword": "old", "newPassword": "new" }
```

### 公共收藏 `/api/collection`

```
GET    /api/collection              # 任何人可读
POST   /api/collection              # 需登录，新增
PUT    /api/collection/{id}         # 需登录，修改（自己的或管理员）
DELETE /api/collection/{id}         # 需登录，删除（自己的或管理员）
```

### 私人收藏 `/api/private`

```
GET    /api/private                 # 需登录，读自己的
POST   /api/private                 # 需登录，新增
PUT    /api/private/{id}            # 需登录，修改
DELETE /api/private/{id}            # 需登录，删除
GET    /api/private?uid={uid}       # 仅管理员，读他人的
```

### 用户管理 `/api/users`（仅管理员）

```
GET    /api/users                   # 列出所有用户
POST   /api/users                   # 创建用户（返回明文密码，仅此一次）
GET    /api/users/{uid}             # 查看用户
PUT    /api/users/{uid}             # 修改（用户名/角色/重置密码）
DELETE /api/users/{uid}             # 删除用户
POST   /api/users/gen-password      # 生成安全随机密码
```

---

## 数据存储说明

### Vercel KV（用户账号）

```
user:{uid}    → { uid, username, passwordHash, role, createdAt, updatedAt }
usernames     → { [username_lowercase]: uid }  用于用户名唯一性查询
```

密码使用 `bcrypt`（cost=12）加密存储，管理员无法查看原始密码。

### GitHub 仓库（收藏数据）

```
data/
  public/collection.json   → [ ...公共条目 ]
  private/
    {uid}.json              → [ ...该用户私人条目 ]
```

---

## 账号密码生成策略

**管理员创建用户时**（`POST /api/users`）：
- 若 `password` 字段留空 → 自动生成 12 位随机密码
- 密码字符集：大小写字母 + 数字 + 特殊字符（排除 O/0/I/l 等易混淆字符）
- **明文密码仅在创建响应中返回一次**，存储时立即哈希，之后无法还原

**用户自主注册**（`POST /api/auth/register`）：
- 需要有效邀请码（`INVITE_CODE` 环境变量），或由管理员 Token 授权
- 系统无任何用户时（首次部署）允许直接注册第一个账号

**密码重置**（`PUT /api/users/{uid}` with `resetPassword:true`）：
- 管理员可触发，自动生成新密码并以明文在响应中返回

---

## 本地开发

```bash
npm install
vercel dev   # 启动本地开发服务器（自动加载 .env.local）
```

`.env.local` 示例：

```env
GITHUB_TOKEN=github_pat_xxx
GITHUB_REPO=alice/my-collection
ADMIN_TOKEN=local-dev-admin-token
JWT_SECRET=local-dev-jwt-secret-at-least-32-chars
INVITE_CODE=dev-invite
KV_REST_API_URL=你的KV连接URL
KV_REST_API_TOKEN=你的KV连接Token
```
