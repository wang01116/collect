# 📚 藏·索引 — 个人收藏管理平台

<div align="center">

![Version](https://img.shields.io/badge/version-v4.1-c8773a?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)
![Single File](https://img.shields.io/badge/单文件部署-无需后端-3b82f6?style=flat-square)

**一个优雅的个人收藏管理平台，用来收藏图书、番剧、电影、剧集等内容。**  
数据存储于本仓库，支持 GitHub Pages 静态部署，无需服务器。

[🌐 在线访问](https://你的用户名.github.io/你的仓库名/) · [📥 下载使用](#本地使用) · [⚙️ 自定义配置](#自定义配置)

</div>

---

## ✨ 功能特色

| 功能 | 说明 |
|------|------|
| 📚 多类收藏 | 图书、番剧、电影、剧集、其他，可自定义分类 |
| 🔗 GitHub 同步 | 使用 Fine-grained Token，修改自动推送到仓库 |
| 🖼️ 封面管理 | 支持图片链接（推荐）或上传文件，jpg/png/gif/webp 均支持 |
| 📎 文件附件 | 在记录链接中上传文件到 `assets/doc/`，生成可共享下载链接 |
| 🔒 访客只读 | 未连接 Token 的访客只能浏览，可新增本地记录 |
| 📍 本地记录 | 未连接时新增记录标记为「本地」，连接后可选择同步上传 |
| 📦 独立空间 | 导入他人分享的 JSON 作为独立空间，不影响主数据 |
| ⭐ 半星评分 | 支持 0.5 分精度的评分系统 |
| 🏷️ 多维标签 | 国别、类型等标签，可在设置中自定义添加 |
| 📊 统计概览 | 分类数量、平均评分、热门标签 Top 3 |
| 🌓 深色模式 | 一键切换，自动保存偏好 |
| 📱 响应式 | 移动端完美适配，支持 PWA 安装到桌面 |
| 📤 数据导出 | 按分类导出 JSON，可供他人导入 |

---

## 🚀 快速开始

### 1. Fork 本仓库

点击右上角 **Fork** 按钮，将本仓库复制到你的账号下。

### 2. 开启 GitHub Pages

进入你 Fork 后的仓库 → **Settings** → **Pages**  
Source 选择 `main` 分支，根目录 `/`，保存。

稍等片刻，访问 `https://你的用户名.github.io/仓库名/` 即可看到网站。

### 3. 配置 GitHub Token（用于编辑）

访客打开网站默认是只读模式。要启用编辑功能：

#### 创建 Fine-grained Personal Access Token

1. 进入 GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
2. 点击 **Generate new token**
3. 填写名称，设置过期时间
4. **Repository access** → 选择 `Only select repositories` → 选择你的收藏仓库
5. **Permissions** → **Repository permissions** → **Contents** → 设置为 `Read and write`
6. 生成并复制 Token（以 `github_pat_` 开头）

#### 在网站中填写 Token

打开你的网站 → **设置** → **GitHub 同步** → 填写：
- **Personal Access Token**：粘贴刚才复制的 Token
- **仓库**：`你的用户名/仓库名`（如 `alice/my-collection`）
- **数据文件路径**：`collection.json`（默认即可）
- **图片文件夹**：`img`（默认即可）

点击「保存设置」，连接成功后左上角状态点变绿。

---

## 📁 仓库目录结构

```
你的仓库/
├── index.html          # 主应用文件（即 collector-app.html，可重命名）
├── config.js           # 可选：独立配置文件
├── collection.json     # 数据文件（自动生成和更新）
├── img/                # 封面图片（上传本地图片时自动存放此处）
│   └── *.jpg / *.png / *.webp
├── assets/
│   └── doc/            # 附件文件（链接中上传的下载文件）
│       └── *.pdf / *.epub / *.zip
└── README.md           # 本文件
```

---

## ⚙️ 自定义配置

所有可自定义项目集中在 `config.js` 文件（或 HTML 内的 `★ CONFIG` 注释块）：

### 修改网站标题

```js
const SITE_CONFIG = {
  title: '我的书单',            // 修改这里
  subtitle: 'MY READING LIST', // 副标题
};
```

### 增加收藏分类

```js
const CATS = {
  books:  { label: '图书', icon: '📚', type: 'book'  },
  anime:  { label: '番剧', icon: '🎌', type: 'media' },
  // 添加漫画分类：
  manga:  { label: '漫画', icon: '📕', type: 'book'  },
  // 添加游戏分类：
  games:  { label: '游戏', icon: '🎮', type: 'media' },
};
```

### 修改状态标签

```js
const STATUS_OPTS = [
  { id: 'watched',   label: '✅ 已读', cls: 'watched'   }, // 改为「已读」
  { id: 'watching',  label: '📖 在读', cls: 'watching'  }, // 改为「在读」
  { id: 'unwatched', label: '📌 想读', cls: 'unwatched' }, // 改为「想读」
];
```

### 添加自定义标签

方式一：在 `config.js` 的 `TYPE_TAGS` 数组末尾追加  
方式二：在网站「**设置 → 自定义标签**」中动态添加（无需修改文件）

---

## 💡 使用技巧

### 封面图片

推荐使用**图片链接**而非上传文件，原因：
- 链接不增加 JSON 文件体积，同步速度更快
- 支持 jpg、png、gif、webp 等所有常见格式

推荐图片来源：
- [豆瓣](https://book.douban.com)（右键图片复制地址）
- [TMDB](https://www.themoviedb.org)（封面图链接）
- [MyAnimeList](https://myanimelist.net)
- 任何图床服务（如 imgbb、postimages 等）

### 数据分享

将你的 `collection.json` 文件链接分享给朋友：
```
https://raw.githubusercontent.com/你的用户名/仓库名/main/collection.json
```

朋友可以在其网站的「**导入数据**」→「**单独导入**」中，将你的收藏作为独立空间查看。

### 附件下载链接

在添加记录时，「下载/阅读地址」字段支持：
- 🔗 **链接**：直接填写 URL（书籍页面、播放地址等）
- 📎 **文件**：上传文件到仓库 `assets/doc/`，自动生成可下载链接

---

## 📤 数据导出与导入

### 导出

「设置」页或侧边栏底部 → **导出数据**  
可选择导出全部分类或指定分类，也可仅导出本地未同步的记录。

### 导入

侧边栏底部 → **导入数据** → 选择 JSON 文件  
导入选项：
- **合并**：保留现有，新增不重复的记录
- **覆盖**：同 ID 记录以导入为准
- **单独导入**：创建独立空间，不影响主数据（适合查看他人分享）

---

## 🛠️ 本地使用

无需任何服务器，直接下载 `collector-app.html` 双击在浏览器中打开即可。

数据保存在浏览器 `localStorage`，不清除浏览器缓存则永久保留。  
连接 GitHub 后可同步到云端，防止数据丢失。

---

## 📄 License

MIT License — 自由使用、修改、分发。

---

<div align="center">
  <sub>Made with ❤️ · 藏·索引 v4.1</sub>
</div>
