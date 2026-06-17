// Bilibili2Audio 启动管理器
// 职责：提供启动页面 HTTP 服务，管理后端进程生命周期
// 监听端口 3000，将后端启动在端口 3001

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const http = require('http');

// ========== 配置 ==========

const LAUNCHER_PORT = parseInt(process.env.LAUNCHER_PORT || '3000', 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);
const ROOT_DIR = path.resolve(__dirname);
const LAUNCHER_DIR = path.join(ROOT_DIR, 'launcher');
const BACKEND_SCRIPT = path.join(ROOT_DIR, 'src/backend/server.js');

// ========== 启动状态机 ==========

const state = {
  phase: 'idle',           // idle | checking_env | installing_deps | starting_backend | waiting_ready | ready | error
  progress: 0,
  message: '',
  error: null,
  backendProcess: null,
  backendReady: false,
  started: false,
};

function setPhase(phase, progress, message) {
  state.phase = phase;
  state.progress = progress;
  state.message = message;
  broadcastState();
}

function setError(msg) {
  state.phase = 'error';
  state.error = msg;
  state.message = msg;
  broadcastState();
}

// ========== SSE 广播 ==========

const sseClients = [];

function broadcastState() {
  const data = JSON.stringify({
    phase: state.phase,
    progress: state.progress,
    message: state.message,
  });

  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(`event: progress\ndata: ${data}\n\n`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// ========== 后端进程管理 ==========

function spawnBackend() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(BACKEND_PORT),
      STARTER_MODE: 'true',
      NODE_ENV: process.env.NODE_ENV || 'production',
    };

    setPhase('starting_backend', 55, '正在启动后端服务...');
    console.log(`[Starter] 启动后端进程: node ${BACKEND_SCRIPT} (端口: ${BACKEND_PORT})`);

    const child = spawn('node', [BACKEND_SCRIPT], {
      cwd: ROOT_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    state.backendProcess = child;

    let stdoutBuf = '';
    child.stdout.on('data', (data) => {
      stdoutBuf += data.toString();
      process.stdout.write(`[Backend] ${data}`);
    });

    let stderrBuf = '';
    child.stderr.on('data', (data) => {
      stderrBuf += data.toString();
      process.stderr.write(`[Backend] ${data}`);
    });

    child.on('error', (err) => {
      console.error(`[Starter] 后端进程启动失败:`, err.message);
      reject(err);
    });

    child.on('exit', (code, signal) => {
      console.log(`[Starter] 后端进程退出 (code: ${code}, signal: ${signal})`);
      state.backendProcess = null;
      if (state.phase === 'ready') {
        // 后端运行中突然退出，显示错误
        if (code !== 0 && signal !== 'SIGTERM') {
          setError(`后端进程异常退出 (code: ${code})，请查看日志。`);
        }
      }
      // 如果是 starter 主动 kill，不报错
    });

    // 不等子进程退出，我们直接去轮询端口
    resolve();
  });
}

// 等待后端就绪（轮询端口）
async function waitForBackend(timeoutMs = 30000) {
  const startTime = Date.now();
  const pollInterval = 500;

  setPhase('waiting_ready', 70, '等待后端服务就绪...');

  while (Date.now() - startTime < timeoutMs) {
    try {
      const alive = await checkPort(BACKEND_PORT);
      if (alive) {
        try {
          await httpGet(`http://127.0.0.1:${BACKEND_PORT}/api/status`);
          state.backendReady = true;
          setPhase('ready', 100, '后端服务已就绪');
          return true;
        } catch {
          // 端口通了但 API 还没就绪
          setPhase('waiting_ready', 80, '后端已启动，等待 API 就绪...');
        }
      }
    } catch {
      // 端口还没通
    }

    await sleep(pollInterval);
  }

  // 超时
  return false;
}

// 检查端口是否可连接
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new http.Socket();
    socket.setTimeout(2000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

// 简单的 HTTP GET
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// ========== 启动流程 ==========

async function runStartup() {
  if (state.started) return;
  state.started = true;

  try {
    // Step 1: 检查环境
    setPhase('checking_env', 5, '检查 Node.js 版本...');
    await sleep(800);

    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.replace('v', '').split('.')[0], 10);
    if (nodeMajor < 18) {
      throw new Error(`Node.js 版本过低 (${nodeVersion})，需要 >= 18.0.0`);
    }
    setPhase('checking_env', 10, `Node.js ${nodeVersion} ✓`);

    // 检测平台
    const platform = process.platform;
    setPhase('checking_env', 12, `平台: ${platform} ✓`);
    await sleep(500);

    // Step 2: 检查/安装依赖
    const hasNodeModules = fs.existsSync(path.join(ROOT_DIR, 'node_modules'));
    if (!hasNodeModules) {
      setPhase('installing_deps', 15, 'node_modules 不存在，正在安装依赖...');
      await sleep(500);
      await runNpmInstall();
    } else {
      // 检查 package-lock.json 是否存在
      const hasLock = fs.existsSync(path.join(ROOT_DIR, 'package-lock.json'));
      setPhase('installing_deps', 20, hasLock ? '依赖已安装 ✓' : '依赖检测通过 ✓');
      await sleep(600);
    }

    // Step 3: 启动后端
    setPhase('starting_backend', 40, '正在启动后端进程...');
    await spawnBackend();

    // Step 4: 等待就绪
    setPhase('waiting_ready', 65, '等待后端服务就绪...');
    const ready = await waitForBackend(45000);

    if (!ready) {
      // 检查子进程是否还活着
      if (state.backendProcess && state.backendProcess.exitCode === null) {
        setError('后端启动超时，请检查端口占用或查看日志。');
      } else {
        setError('后端进程已退出，请检查日志了解详情。');
      }
    }
    // waitForBackend 成功时会自己设置 phase = ready
  } catch (err) {
    console.error('[Starter] 启动失败:', err.message);
    setError(err.message);
  }
}

// 运行 npm install
function runNpmInstall() {
  return new Promise((resolve, reject) => {
    setPhase('installing_deps', 18, '正在运行 npm install...');

    const child = spawn('npm', ['install', '--no-audit', '--no-fund'], {
      cwd: ROOT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, npm_config_progress: 'false' },
    });

    let lastLine = '';
    child.stdout.on('data', (data) => {
      const text = data.toString().trim();
      if (text) lastLine = text;
      // 提取进度信息
      const progressMatch = text.match(/(\d+)\/(\d+)/);
      if (progressMatch) {
        const pct = Math.min(35, 18 + (parseInt(progressMatch[1], 10) / parseInt(progressMatch[2], 10)) * 17);
        setPhase('installing_deps', Math.round(pct), `正在安装依赖 (${progressMatch[1]}/${progressMatch[2]})...`);
      } else if (text && !text.startsWith('npm') && !text.startsWith(' added') && !text.startsWith(' removed')) {
        setPhase('installing_deps', 25, text);
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString().trim();
      if (text) {
        process.stderr.write(`[npm] ${text}\n`);
      }
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      if (code === 0) {
        setPhase('installing_deps', 38, '依赖安装完成 ✓');
        resolve();
      } else {
        reject(new Error(`npm install 失败 (exit code: ${code})`));
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ========== HTTP 服务 ==========

const app = express();

// CORS（允许启动页面跨域访问本地后端）
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// 静态文件服务 - 启动页面
app.use(express.static(LAUNCHER_DIR));

// SSE 端点：推送启动状态
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // 立即发送当前状态
  const initialData = JSON.stringify({
    phase: state.phase,
    progress: state.progress,
    message: state.message,
  });
  res.write(`event: progress\ndata: ${initialData}\n\n`);

  sseClients.push(res);

  // 心跳（保持连接）
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// 触发启动
app.post('/api/start', (req, res) => {
  if (state.phase === 'ready' && state.backendReady) {
    return res.json({ status: 'already_running' });
  }
  if (state.started && state.phase !== 'error' && state.phase !== 'idle') {
    return res.json({ status: 'already_started', phase: state.phase });
  }
  // 重置状态，允许重新启动
  if (state.phase === 'error') {
    state.started = false;
    state.error = null;
  }
  // 异步启动，不阻塞响应
  res.json({ status: 'starting' });
  runStartup().catch(err => console.error('[Starter] 启动异常:', err));
});

// 获取当前状态（轮询回退用）
app.get('/api/status', (req, res) => {
  res.json({
    phase: state.phase,
    progress: state.progress,
    message: state.message,
    error: state.error,
    backendReady: state.backendReady,
    backendPort: BACKEND_PORT,
  });
});

// 兜底路由 - 所有其他请求返回启动页面
app.get('*', (req, res) => {
  res.sendFile(path.join(LAUNCHER_DIR, 'index.html'));
});

// ========== 启动 HTTP 服务 ==========

const server = app.listen(LAUNCHER_PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${LAUNCHER_PORT}`;
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║      Bilibili2Audio 启动管理器          ║`);
  console.log(`  ╠══════════════════════════════════════════╣`);
  console.log(`  ║  启动页面: ${url.padEnd(33)}║`);
  console.log(`  ║  后端端口: ${String(BACKEND_PORT).padEnd(33)}║`);
  console.log(`  ║  启动中自动打开浏览器...                 ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);

  // 自动打开浏览器
  try {
    const open = require('open');
    open(url).catch(() => {});
  } catch {
    console.log(`  请手动打开浏览器访问: ${url}`);
  }

  console.log('[Starter] 等待启动页面连接...');
});

// 优雅退出
function shutdown() {
  console.log('\n[Starter] 正在关闭...');

  // 关闭 SSE 连接
  for (const client of sseClients) {
    try { client.end(); } catch {}
  }

  // 关闭后端进程
  if (state.backendProcess && state.backendProcess.exitCode === null) {
    console.log('[Starter] 关闭后端进程...');
    state.backendProcess.kill('SIGTERM');
    setTimeout(() => {
      if (state.backendProcess && state.backendProcess.exitCode === null) {
        state.backendProcess.kill('SIGKILL');
      }
    }, 3000);
  }

  // 关闭 HTTP 服务
  server.close(() => {
    console.log('[Starter] 已关闭');
    process.exit(0);
  });

  // 强制退出
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (err) => {
  console.error('[Starter] 未捕获异常:', err);
  shutdown();
});
