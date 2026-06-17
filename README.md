# Bilibili2Audio 🎵

跨平台视频转音频工具，支持 **本地视频文件** 和 **B站链接** 两种转换方式。

## 功能特性

- **本地视频转音频** — 支持 mp4、avi、mkv、mov、wmv、flv、webm 等常见格式
- **B站链接解析** — 输入 BV 号或 av 号直接下载音频
- **多输出格式** — MP3、FLAC、WAV、AAC、OGG
- **可选音质** — 128/192/256/320 kbps
- **多任务并行** — 同时处理多个转换任务
- **实时进度** — WebSocket 推送任务进度
- **B站 Cookie 管理** — 浏览器自动提取 cookie，无需手动复制

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18.0.0
- [FFmpeg](https://ffmpeg.org/)（本地视频转换需要）
- npm（随 Node.js 一起安装）

### 启动方式

```bash
# 克隆仓库
git clone https://github.com/Avlorayne/Bilibili2Audio.git
cd Bilibili2Audio

# 方式一：启动脚本（推荐）
chmod +x start.sh
./start.sh

# 方式二：直接启动后端
npm install
npm start
```

启动后浏览器会自动打开，先显示 **启动页面**（`http://127.0.0.1:3000`），自动完成环境检查和依赖安装，随后跳转到主界面（`http://127.0.0.1:3001`）。

也可以直接双击桌面快捷方式：
- **Linux**: `Bilibili2Audio.desktop`
- **macOS**: `Bilibili2Audio.command`
- **Windows**: `start.bat` / `start-windows.bat`

## 启动架构

```
start.sh
   │
   ▼
starter.js (端口 3000)    ← 启动管理器：检查环境、安装依赖、管理进程
   │
   ├─ 提供启动页面 (launcher/)
   ├─ API: /api/start → spawn 后端进程
   ├─ API: /api/events → SSE 实时推送启动进度
   └─ API: /api/status → 状态轮询（SSE 断线回退）
            │
            ▼
server.js (端口 3001)      ← 后端主服务
   │
   ├─ 静态文件 (src/frontend/)
   ├─ REST API (/api/*)
   └─ WebSocket (ws://)
```

启动页面展示四步进度：**检查环境 → 安装依赖 → 启动后端 → 就绪跳转**，全程无需用户干预。

## 项目结构

```
Bilibili2Audio/
├── starter.js              # 启动管理器
├── launcher/               # 启动页面
│   ├── index.html
│   ├── style.css
│   └── script.js
├── src/
│   ├── backend/
│   │   ├── server.js       # Express 主服务
│   │   ├── routes/api.js   # API 路由
│   │   └── services/       # 业务逻辑
│   └── frontend/
│       ├── index.html      # 主页面
│       ├── css/style.css
│       └── js/app.js
├── start.sh                # 启动脚本 (Linux/macOS)
├── start-linux.sh
├── start-macos.sh
├── start.bat               # 启动脚本 (Windows)
├── start-windows.bat
├── docs/                   # 设计文档
├── output/                 # 音频输出目录
└── temp/                   # 临时文件
```

## 技术栈

- **后端**: Node.js + Express + WebSocket (ws)
- **前端**: Bootstrap 5 + 原生 JS
- **视频/音频**: FFmpeg + yt-dlp
- **日志**: Winston

## License

MIT
