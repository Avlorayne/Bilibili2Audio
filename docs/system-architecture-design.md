# Bilibili2Audio 系统架构设计文档

## 1. 项目概述

Bilibili2Audio 是一款跨平台的视频转音频工具，支持两类源文件的音频提取：
1. 用户本地上传的任意格式视频文件
2. 用户输入的B站（bilibili）视频链接

最终输出为各种主流音频文件（mp3、flac、wav等），满足用户本地音频播放、存储的需求。

## 2. 技术栈选型

### 2.1 前端技术栈

| 技术 | 选型 | 版本要求 | 说明 |
|------|------|----------|------|
| **核心框架** | 原生 HTML5 + CSS3 + JavaScript ES6+ | - | 轻量级，无需构建工具，直接浏览器运行 |
| **UI组件库** | Bootstrap 5.3+ | 5.3.0+ | 响应式设计，兼容Chrome 100+ |
| **图标库** | Bootstrap Icons | 1.10+ | 与Bootstrap配套 |
| **文件处理** | File API + Drag & Drop API | - | 支持本地文件上传 |
| **实时通信** | WebSocket API | - | 实时进度推送 |
| **浏览器兼容** | Chrome 100+, Edge 100+, 360极速浏览器 15+ | - | 基于Chromium内核的现代浏览器 |

### 2.2 后端技术栈

| 技术 | 选型 | 版本要求 | 说明 |
|------|------|----------|------|
| **运行时** | Node.js | 18.0.0+ | LTS版本，跨平台支持优秀 |
| **Web框架** | Express.js | 4.18+ | 轻量级，适合本地服务 |
| **实时通信** | WebSocket (ws库) | 8.0+ | 进度实时推送 |
| **视频处理** | FFmpeg | 6.0+ | 音视频转码核心 |
| **B站解析** | 自定义解析模块 | - | 基于猫抓插件规则 |
| **进程管理** | child_process | - | 调用FFmpeg命令行 |

## 3. 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      用户浏览器 (Chrome 100+)                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  本地视频上传 │  │ B站链接输入  │  │  猫抓插件(可选)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘  │
│         │                 │                     │             │
│         └─────────────────┼─────────────────────┘             │
│                           │                                   │
│                    ┌──────▼───────┐                           │
│                    │  前端界面     │                           │
│                    │  (index.html)│                           │
│                    └──────┬───────┘                           │
└───────────────────────────┼───────────────────────────────────┘
                            │ HTTP/WebSocket
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                    本地后端服务 (Node.js)                       │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │ Express服务  │  │ WebSocket服务│  │  FFmpeg处理模块     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬──────────┘   │
│         │                 │                     │              │
│         └─────────────────┼─────────────────────┘              │
│                           │                                    │
│                    ┌──────▼───────┐                            │
│                    │  核心业务逻辑 │                            │
│                    └──────┬───────┘                            │
└───────────────────────────┼────────────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────────┐
│                      系统资源层                                │
├───────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │ FFmpeg二进制 │  │  临时文件    │  │  输出音频文件       │   │
│  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

## 4. 文件目录结构设计

### 4.1 项目根目录结构

```
Bilibili2Audio/
├── docs/                          # 项目文档
│   ├── system-architecture-design.md
│   ├── tool-dependency-integration.md
│   ├── business-flow-interaction.md
│   └── project-execution-plan.md
├── src/                           # 源代码目录
│   ├── frontend/                  # 前端代码
│   │   ├── index.html             # 主页面
│   │   ├── css/                   # 样式文件
│   │   │   └── style.css
│   │   ├── js/                    # JavaScript文件
│   │   │   ├── app.js             # 主应用逻辑
│   │   │   ├── uploader.js        # 文件上传模块
│   │   │   ├── bilibili-parser.js # B站链接解析模块
│   │   │   ├── converter.js       # 转换控制模块
│   │   │   └── ui-controller.js   # UI控制模块
│   │   └── assets/                # 静态资源
│   │       └── icons/
│   └── backend/                   # 后端代码
│       ├── server.js              # 主服务器
│       ├── routes/                # 路由
│       │   ├── api.js             # API路由
│       │   └── websocket.js       # WebSocket处理
│       ├── services/              # 业务服务
│       │   ├── ffmpeg-service.js  # FFmpeg服务
│       │   ├── bilibili-service.js# B站解析服务
│       │   └── file-service.js    # 文件管理服务
│       ├── utils/                 # 工具函数
│       │   ├── path-helper.js     # 路径处理
│       │   └── validator.js       # 参数验证
│       └── config/                # 配置文件
│           └── default.js         # 默认配置
├── resources/                     # 资源文件
│   ├── ffmpeg/                    # FFmpeg二进制文件
│   │   ├── win64/                 # Windows 64位
│   │   ├── linux64/               # Linux 64位
│   │   └── macos64/               # macOS 64位
│   └── plugins/                   # 插件资源
│       └── cat-catch/             # 猫抓插件相关
├── temp/                          # 临时文件目录
│   ├── uploads/                   # 上传的临时文件
│   └── processing/                # 处理中的临时文件
├── output/                        # 输出音频文件目录
├── logs/                          # 日志文件目录
├── package.json                   # Node.js依赖配置
├── start.sh                       # Linux/macOS启动脚本
├── start.bat                      # Windows启动脚本
└── README.md                      # 项目说明
```

### 4.2 跨平台路径处理规范

```javascript
// 路径处理原则
1. 使用 Node.js 的 path 模块处理所有路径
2. 禁止硬编码路径分隔符
3. 使用 path.join() 拼接路径
4. 使用 os.homedir() 获取用户主目录
5. 使用 app.getPath('temp') 或 os.tmpdir() 获取临时目录

// 各平台默认路径
Windows:  C:\Users\{username}\Bilibili2Audio\
Linux:    /home/{username}/Bilibili2Audio/
macOS:    /Users/{username}/Bilibili2Audio/
```

## 5. 前后端通信机制

### 5.1 通信协议

| 通信类型 | 协议 | 端口 | 用途 |
|----------|------|------|------|
| HTTP API | HTTP/1.1 | 3000 | 文件上传、任务创建、状态查询 |
| WebSocket | WS/WSS | 3001 | 实时进度推送、状态更新 |

### 5.2 API接口设计

#### 5.2.1 RESTful API

```
POST /api/upload                    # 上传本地视频文件
POST /api/convert/bilibili          # 提交B站链接转码任务
GET  /api/task/:taskId              # 查询任务状态
GET  /api/task/:taskId/download     # 下载转码后的音频
DELETE /api/task/:taskId            # 删除任务
GET  /api/tasks                     # 获取所有任务列表
GET  /api/status                    # 获取系统状态（FFmpeg、磁盘空间等）
```

#### 5.2.2 WebSocket消息格式

```javascript
// 客户端 -> 服务端
{
  "type": "subscribe",
  "taskId": "task_123456"
}

// 服务端 -> 客户端
{
  "type": "progress",
  "taskId": "task_123456",
  "progress": 45.5,
  "status": "converting",
  "message": "正在转码..."
}
```

### 5.3 跨域处理方案

由于前后端运行在同一本地环境，采用以下方案：

```javascript
// 1. 服务端配置CORS
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// 2. 开发环境使用代理
// 前端开发服务器代理API请求到后端
```

## 6. 启动流程设计

### 6.1 启动脚本逻辑

```
用户双击 start.sh/start.bat
    │
    ├── 检查 Node.js 是否安装
    │   └── 未安装 -> 提示安装 Node.js 18+
    │
    ├── 检查依赖是否安装
    │   └── 未安装 -> 自动执行 npm install
    │
    ├── 检查 FFmpeg 是否可用
    │   └── 未安装 -> 自动下载配置 FFmpeg
    │
    ├── 启动后端服务 (node src/backend/server.js)
    │
    └── 自动打开浏览器访问 http://localhost:3000
```

### 6.2 自动打开浏览器

```javascript
const open = require('open');

// 启动服务后自动打开浏览器
server.listen(PORT, () => {
  console.log(`服务已启动: http://localhost:${PORT}`);
  open(`http://localhost:${PORT}`);
});
```

## 7. 安全性设计

### 7.1 文件安全

- 上传文件大小限制：2GB
- 文件类型白名单验证
- 临时文件定期清理（24小时自动删除）
- 输出文件存储在用户目录，避免权限问题

### 7.2 网络安全

- 仅监听本地回环地址 (127.0.0.1)
- 不暴露到外网
- WebSocket连接验证来源

## 8. 性能优化

### 8.1 并发控制

- 最大同时转码任务数：3（可根据CPU核心数调整）
- 任务队列管理，避免资源耗尽

### 8.2 内存管理

- 流式处理大文件，避免一次性加载到内存
- 及时释放临时文件
- 监控内存使用，超过阈值暂停新任务

## 9. 错误处理

### 9.1 错误分类

| 错误类型 | 处理方式 |
|----------|----------|
| FFmpeg执行错误 | 捕获错误输出，返回用户友好提示 |
| 文件权限错误 | 提示用户检查目录权限 |
| 磁盘空间不足 | 检查并提示清理空间 |
| 网络连接错误 | 提示检查网络连接 |

### 9.2 日志记录

```javascript
// 日志级别
- ERROR: 严重错误，影响核心功能
- WARN: 警告，功能可用但有问题
- INFO: 一般信息，操作记录
- DEBUG: 调试信息，开发时使用

// 日志文件
logs/app.log        # 应用日志
logs/error.log      # 错误日志
logs/access.log     # 访问日志
```

## 10. 版本兼容性

### 10.1 浏览器兼容性

| 浏览器 | 最低版本 | 内核要求 |
|--------|----------|----------|
| Google Chrome | 100+ | Chromium 100+ |
| Microsoft Edge | 100+ | Chromium 100+ |
| 360极速浏览器 | 15+ | Chromium 86+ |
| 其他Chromium系 | - | Chromium 100+ |

### 10.2 操作系统兼容性

| 操作系统 | 版本要求 | 架构 |
|----------|----------|------|
| Windows | 10/11 | x64 |
| Ubuntu | 22.04+ | x64 |
| macOS | 13+ (Ventura) | x64/ARM64 |

---

**文档版本**: v1.0  
**最后更新**: 2026-06-17  
**作者**: Bilibili2Audio开发团队