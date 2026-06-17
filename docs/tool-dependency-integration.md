# Bilibili2Audio 工具依赖集成方案文档

## 1. 概述

本文档详细说明Bilibili2Audio项目所需的外部工具依赖集成方案，包括yt-dlp集成（用于B站视频解析下载）、FFmpeg部署和浏览器兼容性处理。

## 2. yt-dlp集成方案（B站视频解析）

### 2.1 工具简介

yt-dlp是一个功能强大的命令行视频下载工具，支持包括B站在内的众多视频网站。相比浏览器插件方案，yt-dlp具有以下优势：

| 对比项 | 猫抓插件方案 | yt-dlp方案 |
|--------|-------------|------------|
| 依赖 | 需要安装浏览器扩展 | 独立命令行工具 |
| 维护 | 依赖插件开发者 | 社区活跃，更新快 |
| 可靠性 | 受浏览器限制 | 直接请求，稳定 |
| 集成难度 | 需要扩展通信 | 命令行调用简单 |
| 格式支持 | 需手动解析 | 内置格式选择 |
| 错误处理 | 复杂 | 完善的错误码 |

### 2.2 yt-dlp部署方案

#### 2.2.1 版本选型

| 平台 | 下载源 | 版本 | 文件名 | 大小 |
|------|--------|------|--------|------|
| Windows x64 | https://github.com/yt-dlp/yt-dlp/releases | latest | yt-dlp.exe | ~10MB |
| Linux x64 | https://github.com/yt-dlp/yt-dlp/releases | latest | yt-dlp | ~10MB |
| macOS x64/ARM64 | https://github.com/yt-dlp/yt-dlp/releases | latest | yt-dlp_macos | ~10MB |

#### 2.2.2 自动下载配置流程

```javascript
const ytdlpDownloader = {
  // 平台对应下载URL
  urls: {
    'win32-x64': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
    'linux-x64': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp',
    'darwin-x64': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
    'darwin-arm64': 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
  },
  
  // 下载完成后配置
  async configure(downloadPath) {
    // 1. 移动到 resources/ytdlp/{platform}/
    // 2. 设置执行权限 (Linux/macOS)
    // 3. 验证yt-dlp可执行
  }
};
```

#### 2.2.3 目录结构

```
resources/
├── ffmpeg/
│   ├── win64/
│   ├── linux64/
│   └── macos64/
└── ytdlp/
    ├── win64/
    │   └── yt-dlp.exe
    ├── linux64/
    │   └── yt-dlp
    └── macos64/
        └── yt-dlp
```

### 2.3 B站视频解析流程

#### 2.3.1 完整解析流程

```
用户输入B站链接
    │
    ├── 前端链接格式校验
    │   ├── 标准链接: https://www.bilibili.com/video/BVxxxxxx
    │   ├── 短链接: https://b23.tv/xxxxx
    │   ├── 带参数链接: ?p=1, ?t=120 等
    │   └── 校验失败 -> 提示"请输入有效的B站视频链接"
    │
    ├── 发送链接到后端
    │   └── POST /api/convert/bilibili { url: "..." }
    │
    ├── 后端调用yt-dlp获取视频信息
    │   └── yt-dlp --dump-json --no-download <url>
    │
    ├── 解析返回的JSON数据
    │   ├── 视频标题 (title)
    │   ├── 视频时长 (duration)
    │   ├── 封面图片 (thumbnail)
    │   ├── UP主 (uploader)
    │   └── 可用格式列表 (formats)
    │
    └── 返回前端显示
        ├── 视频封面图
        ├── 视频标题
        ├── UP主名称
        ├── 视频时长
        ├── 可选音频质量
        └── [开始转换] 按钮
```

#### 2.3.2 yt-dlp命令行调用

```javascript
const { execFile } = require('child_process');
const path = require('path');

// 获取yt-dlp路径
function getYtdlpPath() {
  const platform = process.platform;
  const arch = process.arch === 'arm64' ? 'macos64' : 
               platform === 'win32' ? 'win64' : 
               platform === 'darwin' ? 'macos64' : 'linux64';
  
  const filename = platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(__dirname, '../../resources/ytdlp', arch, filename);
}

// 获取视频信息
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = getYtdlpPath();
    
    execFile(ytdlpPath, [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      url
    ], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`yt-dlp执行失败: ${error.message}`));
        return;
      }
      
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title,
          duration: info.duration,
          thumbnail: info.thumbnail,
          uploader: info.uploader,
          formats: info.formats.filter(f => f.acodec !== 'none')
        });
      } catch (e) {
        reject(new Error(`解析视频信息失败: ${e.message}`));
      }
    });
  });
}
```

#### 2.3.3 音频下载转换

```javascript
// 下载并转换音频
async function downloadAudio(url, outputFormat, quality, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const ytdlpPath = getYtdlpPath();
    
    // 构建yt-dlp参数
    const args = [
      '--extract-audio',
      '--audio-format', outputFormat,
      '--audio-quality', quality,
      '--output', outputPath,
      '--newline',  // 进度输出换行
      '--progress',
      url
    ];
    
    const process = execFile(ytdlpPath, args);
    
    // 解析进度
    process.stdout.on('data', (data) => {
      const progressMatch = data.toString().match(/(\d+\.?\d*)%/);
      if (progressMatch && onProgress) {
        onProgress(parseFloat(progressMatch[1]));
      }
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`yt-dlp退出码: ${code}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`yt-dlp执行错误: ${error.message}`));
    });
    
    // 返回进程对象用于取消
    return process;
  });
}
```

### 2.4 yt-dlp验证逻辑

```javascript
async function verifyYtdlp(ytdlpPath) {
  try {
    // 1. 检查文件是否存在
    if (!fs.existsSync(ytdlpPath)) {
      return { success: false, error: 'yt-dlp文件不存在' };
    }
    
    // 2. 检查执行权限 (Linux/macOS)
    if (process.platform !== 'win32') {
      const stats = fs.statSync(ytdlpPath);
      if (!(stats.mode & 0o111)) {
        return { success: false, error: 'yt-dlp没有执行权限' };
      }
    }
    
    // 3. 执行验证命令
    const { execFile } = require('child_process');
    const result = await new Promise((resolve, reject) => {
      execFile(ytdlpPath, ['--version'], { encoding: 'utf8' }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout.trim());
      });
    });
    
    return {
      success: true,
      version: result,
      path: ytdlpPath
    };
  } catch (error) {
    return {
      success: false,
      error: `yt-dlp验证失败: ${error.message}`
    };
  }
}
```

### 2.5 异常提示方案

| 异常场景 | 错误码 | 提示内容 | 解决方案 |
|----------|--------|----------|----------|
| yt-dlp未安装 | YTDLP_NOT_FOUND | "B站解析组件未安装" | 自动下载或提供手动安装 |
| 链接格式错误 | INVALID_URL | "请输入有效的B站视频链接" | 示例链接格式 |
| 视频不存在 | VIDEO_NOT_FOUND | "视频不存在或已被删除" | 检查链接有效性 |
| 视频需要登录 | LOGIN_REQUIRED | "该视频需要登录才能观看" | 提示使用Cookie |
| 视频有地区限制 | GEO_RESTRICTED | "该视频在当前地区不可用" | 提示使用代理 |
| 网络连接失败 | NETWORK_ERROR | "网络连接失败，请检查网络" | 提供重试按钮 |
| 解析失败 | PARSE_FAILED | "视频信息解析失败" | 提供重试和反馈 |
| 下载失败 | DOWNLOAD_FAILED | "音频下载失败" | 提供重试按钮 |

### 2.6 高级功能支持

#### 2.6.1 Cookie支持（用于访问需要登录的视频）

```javascript
// 使用Cookie文件
async function downloadWithCookie(url, cookiePath, options) {
  const args = [
    '--cookies', cookiePath,
    // ... 其他参数
    url
  ];
  // ...
}
```

#### 2.6.2 代理支持

```javascript
// 使用代理
async function downloadWithProxy(url, proxy, options) {
  const args = [
    '--proxy', proxy,
    // ... 其他参数
    url
  ];
  // ...
}
```

#### 2.6.3 格式选择

```javascript
// 获取可用音频格式
function getAvailableFormats(videoInfo) {
  const audioFormats = videoInfo.formats
    .filter(f => f.acodec !== 'none' && f.vcodec === 'none')
    .map(f => ({
      formatId: f.format_id,
      quality: f.abr || f.tbr,
      extension: f.ext,
      description: `${f.ext} - ${f.abr || f.tbr}kbps`
    }));
  
  return audioFormats.sort((a, b) => b.quality - a.quality);
}
```

## 3. FFmpeg初始化部署方案

### 3.1 版本选型

| 平台 | 下载源 | 版本 | 文件名 | 大小 |
|------|--------|------|--------|------|
| Windows x64 | https://github.com/BtbN/FFmpeg-Builds/releases | 6.0 | ffmpeg-master-latest-win64-gpl.zip | ~80MB |
| Linux x64 | https://github.com/BtbN/FFmpeg-Builds/releases | 6.0 | ffmpeg-master-latest-linux64-gpl.tar.xz | ~75MB |
| macOS x64 | https://evermeet.cx/ffmpeg/ | 6.0 | ffmpeg-6.0.zip | ~85MB |
| macOS ARM64 | https://evermeet.cx/ffmpeg/ | 6.0 | ffmpeg-6.0.zip | ~80MB |

### 3.2 自动下载配置流程

#### 3.2.1 初始化检查流程

```
应用启动
    │
    ├── 检查 resources/ffmpeg/{platform}/ 目录
    │   ├── ffmpeg (ffmpeg.exe on Windows) 存在
    │   │   └── 验证版本 -> 通过则继续
    │   └── 不存在
    │       └── 触发自动下载
    │
    ├── 检测系统FFmpeg
    │   ├── 执行 ffmpeg -version
    │   ├── 成功 -> 使用系统FFmpeg
    │   └── 失败 -> 使用本地FFmpeg
    │
    └── 最终确认
        ├── FFmpeg可用 -> 启用核心功能
        └── FFmpeg不可用 -> 显示安装引导
```

#### 3.2.2 自动下载实现

```javascript
const ffmpegDownloader = {
  // 平台对应下载URL
  urls: {
    'win32-x64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    'linux-x64': 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    'darwin-x64': 'https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip',
    'darwin-arm64': 'https://evermeet.cx/ffmpeg/ffmpeg-6.0.zip'
  },
  
  // 下载进度回调
  onProgress: (progress) => {
    // 更新UI进度条
  },
  
  // 下载完成后解压配置
  async extractAndConfigure(downloadPath) {
    // 1. 解压到 resources/ffmpeg/{platform}/
    // 2. 设置执行权限 (Linux/macOS)
    // 3. 验证FFmpeg可执行
  }
};
```

#### 3.2.3 下载进度显示

```
┌─────────────────────────────────────────────────────────┐
│                    正在初始化组件                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  正在下载FFmpeg组件...                                   │
│                                                         │
│  ████████████████████░░░░░░░░░░  65%  (52MB/80MB)       │
│                                                         │
│  下载速度: 2.5 MB/s                                      │
│  预计剩余: 11秒                                          │
│                                                         │
│  [取消下载]                                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.3 环境变量自动写入逻辑

#### 3.3.1 Windows环境

```javascript
// Windows下不需要写入系统环境变量
// 直接使用完整路径调用FFmpeg
const ffmpegPath = path.join(__dirname, '../../resources/ffmpeg/win64/ffmpeg.exe');
```

#### 3.3.2 Linux/macOS环境

```javascript
// Linux/macOS下设置执行权限
const { execSync } = require('child_process');
const ffmpegPath = path.join(__dirname, '../../resources/ffmpeg/linux64/ffmpeg');

// 设置执行权限
execSync(`chmod +x ${ffmpegPath}`);

// 验证FFmpeg可执行
execSync(`${ffmpegPath} -version`);
```

### 3.4 初始化失败处理

#### 3.4.1 失败场景及处理

| 失败场景 | 错误信息 | 解决方案 |
|----------|----------|----------|
| 网络连接失败 | "下载FFmpeg失败，请检查网络连接" | 提供重试按钮和手动下载链接 |
| 磁盘空间不足 | "磁盘空间不足，无法下载FFmpeg" | 提示清理空间 |
| 权限不足 | "没有写入权限，请检查目录权限" | 提示以管理员权限运行 |
| 解压失败 | "FFmpeg解压失败" | 提供手动安装指引 |
| 验证失败 | "FFmpeg验证失败" | 提供手动配置方案 |

#### 3.4.2 手动配置引导

```
┌─────────────────────────────────────────────────────────┐
│                    FFmpeg手动安装引导                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  如果自动安装失败，请按以下步骤手动安装：                  │
│                                                         │
│  1. 访问FFmpeg官网下载页面                               │
│     [打开下载页面]                                       │
│                                                         │
│  2. 下载适合您系统的版本                                 │
│     Windows: 选择 "Windows builds by BtbN"              │
│     Linux: 选择 "Linux builds by BtbN"                  │
│     macOS: 选择 "macOS builds by evermeet.cx"           │
│                                                         │
│  3. 将下载的文件解压到以下目录：                          │
│     /path/to/Bilibili2Audio/resources/ffmpeg/{platform}/│
│                                                         │
│  4. 确保目录结构如下：                                   │
│     {platform}/                                         │
│       ├── ffmpeg (或 ffmpeg.exe)                        │
│       └── ffprobe (或 ffprobe.exe)                      │
│                                                         │
│  5. 完成后点击"验证安装"按钮                             │
│                                                         │
│  [验证安装]  [稍后安装，仅使用部分功能]                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.5 FFmpeg验证逻辑

```javascript
async function verifyFFmpeg(ffmpegPath) {
  try {
    // 1. 检查文件是否存在
    if (!fs.existsSync(ffmpegPath)) {
      return { success: false, error: 'FFmpeg文件不存在' };
    }
    
    // 2. 检查执行权限 (Linux/macOS)
    if (process.platform !== 'win32') {
      const stats = fs.statSync(ffmpegPath);
      if (!(stats.mode & 0o111)) {
        return { success: false, error: 'FFmpeg没有执行权限' };
      }
    }
    
    // 3. 执行验证命令
    const result = execSync(`"${ffmpegPath}" -version`, { encoding: 'utf8' });
    
    // 4. 解析版本信息
    const versionMatch = result.match(/ffmpeg version (\S+)/);
    if (!versionMatch) {
      return { success: false, error: '无法解析FFmpeg版本' };
    }
    
    return {
      success: true,
      version: versionMatch[1],
      path: ffmpegPath
    };
  } catch (error) {
    return {
      success: false,
      error: `FFmpeg验证失败: ${error.message}`
    };
  }
}
```

## 4. 浏览器兼容性方案

### 4.1 支持的浏览器范围

| 浏览器 | 最低版本 | 内核版本 | 支持状态 |
|--------|----------|----------|----------|
| Google Chrome | 100+ | Chromium 100+ | 完全支持 |
| Microsoft Edge | 100+ | Chromium 100+ | 完全支持 |
| 360极速浏览器 | 15+ | Chromium 86+ | 基本支持 |
| 360安全浏览器 | 15+ | Chromium 86+ | 基本支持 |
| QQ浏览器 | 11+ | Chromium 70+ | 有限支持 |
| 搜狗浏览器 | 12+ | Chromium 70+ | 有限支持 |
| Firefox | 100+ | Gecko 100+ | 基本支持 |
| Safari | 16+ | WebKit | 基本支持 |

### 4.2 浏览器版本检测

```javascript
function detectBrowser() {
  const userAgent = navigator.userAgent;
  
  // Chrome检测
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
  if (chromeMatch) {
    const version = parseInt(chromeMatch[1]);
    return {
      name: 'Chrome',
      version: version,
      supported: version >= 100,
      message: version >= 100 ? '浏览器版本支持' : '请升级Chrome到100+版本'
    };
  }
  
  // Edge检测
  const edgeMatch = userAgent.match(/Edg\/(\d+)/);
  if (edgeMatch) {
    const version = parseInt(edgeMatch[1]);
    return {
      name: 'Edge',
      version: version,
      supported: version >= 100,
      message: version >= 100 ? '浏览器版本支持' : '请升级Edge到100+版本'
    };
  }
  
  // Firefox检测
  const firefoxMatch = userAgent.match(/Firefox\/(\d+)/);
  if (firefoxMatch) {
    const version = parseInt(firefoxMatch[1]);
    return {
      name: 'Firefox',
      version: version,
      supported: version >= 100,
      message: version >= 100 ? '浏览器版本支持' : '请升级Firefox到100+版本'
    };
  }
  
  // Safari检测
  const safariMatch = userAgent.match(/Version\/(\d+).*Safari/);
  if (safariMatch) {
    const version = parseInt(safariMatch[1]);
    return {
      name: 'Safari',
      version: version,
      supported: version >= 16,
      message: version >= 16 ? '浏览器版本支持' : '请升级Safari到16+版本'
    };
  }
  
  return {
    name: '未知浏览器',
    version: 0,
    supported: false,
    message: '请使用Chrome、Edge、Firefox或Safari浏览器访问'
  };
}
```

### 4.3 浏览器版本低于要求时的升级提示

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器版本过低                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ⚠️  您的浏览器版本过低，可能无法正常使用本工具。          │
│                                                         │
│  当前浏览器: Chrome 95                                   │
│  要求版本: Chrome 100+                                   │
│                                                         │
│  为获得最佳体验，请升级您的浏览器：                       │
│                                                         │
│  [下载最新版Chrome]  [下载最新版Edge]                     │
│                                                         │
│  [继续使用（部分功能可能受限）]                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.4 特定浏览器兼容性处理

#### 4.4.1 360浏览器兼容模式检测

```javascript
function is360CompatibleMode() {
  // 360浏览器兼容模式使用IE内核
  if (navigator.userAgent.includes('MSIE') || navigator.userAgent.includes('Trident')) {
    return true;
  }
  
  // 检测是否为360浏览器
  if (navigator.userAgent.includes('360SE') || navigator.userAgent.includes('360EE')) {
    // 检测是否为兼容模式
    // ...
  }
  
  return false;
}

// 提示切换到极速模式
if (is360CompatibleMode()) {
  showTip('请切换到极速模式以获得最佳体验');
}
```

#### 4.4.2 功能特性检测

```javascript
// 检测必要的浏览器API支持
function checkBrowserFeatures() {
  const features = {
    fileApi: 'File' in window && 'FileReader' in window,
    dragDrop: 'draggable' in document.createElement('div'),
    webSocket: 'WebSocket' in window,
    fetch: 'fetch' in window,
    promise: 'Promise' in window
  };
  
  const unsupported = Object.entries(features)
    .filter(([, supported]) => !supported)
    .map(([name]) => name);
  
  return {
    supported: unsupported.length === 0,
    unsupported: unsupported
  };
}
```

## 5. 依赖版本锁定

### 5.1 package.json依赖版本

```json
{
  "dependencies": {
    "express": "4.18.2",
    "ws": "8.14.2",
    "cors": "2.8.5",
    "multer": "1.4.5-lts.1",
    "open": "8.4.2",
    "winston": "3.11.0",
    "axios": "1.6.2",
    "archiver": "6.0.1",
    "unzipper": "0.10.14"
  },
  "devDependencies": {
    "nodemon": "3.0.2"
  }
}
```

### 5.2 依赖检查启动时验证

```javascript
async function checkDependencies() {
  const results = {
    node: { required: '18.0.0', installed: null, status: null },
    ffmpeg: { required: '6.0', installed: null, status: null },
    ytdlp: { required: 'latest', installed: null, status: null },
    npm_packages: { required: [], installed: [], status: null }
  };
  
  // 检查Node.js版本
  results.node.installed = process.version;
  results.node.status = compareVersions(process.version, 'v18.0.0') >= 0;
  
  // 检查FFmpeg
  // ...
  
  // 检查yt-dlp
  // ...
  
  // 检查npm依赖
  // ...
  
  return results;
}
```

## 6. 依赖初始化时序

```
应用启动
    │
    ├── 1. 检查Node.js版本
    │   └── 失败 -> 提示安装Node.js 18+
    │
    ├── 2. 检查npm依赖
    │   └── 失败 -> 自动执行npm install
    │
    ├── 3. 检查FFmpeg
    │   ├── 优先使用本地FFmpeg
    │   ├── 其次使用系统FFmpeg
    │   └── 都不可用 -> 自动下载或提示手动安装
    │
    ├── 4. 检查yt-dlp
    │   ├── 优先使用本地yt-dlp
    │   └── 不可用 -> 自动下载或提示手动安装
    │
    ├── 5. 初始化日志系统
    │
    ├── 6. 创建必要目录
    │   ├── temp/uploads/
    │   ├── temp/processing/
    │   ├── output/
    │   └── logs/
    │
    └── 7. 启动Web服务
        └── 打开浏览器
```

---

**文档版本**: v1.1  
**最后更新**: 2026-06-17  
**作者**: Bilibili2Audio开发团队