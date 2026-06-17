// Bilibili2Audio 启动页面交互逻辑

document.addEventListener('DOMContentLoaded', () => {
  initLauncher();
});

function initLauncher() {
  // 尝试建立 SSE 连接
  const eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    console.log('[Launcher] SSE 连接已建立');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleStatusUpdate(data);
    } catch (e) {
      console.warn('[Launcher] 消息解析失败:', e);
    }
  };

  eventSource.addEventListener('progress', (event) => {
    try {
      const data = JSON.parse(event.data);
      handleStatusUpdate(data);
    } catch (e) {
      console.warn('[Launcher] 进度消息解析失败:', e);
    }
  });

  eventSource.onerror = () => {
    console.warn('[Launcher] SSE 连接断开，切换到轮询模式');
    eventSource.close();
    startPolling();
  };

  // 自动触发启动
  fetch('/api/start', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      if (data.status === 'already_running') {
        handleStatusUpdate({ phase: 'ready', progress: 100 });
      }
    })
    .catch(() => {
      // 如果 SSE 和 start 都失败，显示错误
      showError('无法连接到启动器服务，请检查服务是否正在运行。');
    });
}

// 轮询回退模式
function startPolling() {
  let pollCount = 0;
  const maxPolls = 120; // 最多 2 分钟

  function poll() {
    pollCount++;
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        handleStatusUpdate(data);
        if (data.phase !== 'ready' && data.phase !== 'error') {
          if (pollCount < maxPolls) {
            setTimeout(poll, 1000);
          } else {
            showError('后端启动超时，请检查日志或手动启动。');
          }
        }
      })
      .catch(() => {
        if (pollCount < maxPolls) {
          setTimeout(poll, 1500);
        } else {
          showError('无法连接到启动器服务。');
        }
      });
  }

  setTimeout(poll, 500);
}

// 处理状态更新
function handleStatusUpdate(data) {
  const phase = data.phase;
  const progress = data.progress || 0;
  const message = data.message || '';

  // 更新进度条
  const progressFill = document.getElementById('progressFill');
  const progressLabel = document.getElementById('progressLabel');
  progressFill.style.width = progress + '%';
  progressLabel.textContent = message;

  // 更新步骤状态
  switch (phase) {
    case 'checking_env':
      activateStep('env');
      unactivateStep('deps');
      unactivateStep('start');
      unactivateStep('ready');
      setStatusBadge('检查环境');
      break;

    case 'installing_deps':
      completeStep('env');
      activateStep('deps');
      setStatusBadge('安装依赖');
      if (message) {
        document.getElementById('stepDepsDesc').textContent = message;
      }
      break;

    case 'starting_backend':
      completeStep('env');
      completeStep('deps');
      activateStep('start');
      setStatusBadge('启动服务');
      if (message) {
        document.getElementById('stepStartDesc').textContent = message;
      }
      break;

    case 'waiting_ready':
      completeStep('env');
      completeStep('deps');
      activateStep('start');
      setStatusBadge('等待就绪');
      if (message) {
        document.getElementById('stepStartDesc').textContent = message;
      }
      break;

    case 'ready':
      completeStep('env');
      completeStep('deps');
      completeStep('start');
      activateStep('ready');
      document.getElementById('stepReadyDesc').textContent = message || '准备就绪！即将跳转到主页面...';
      setStatusBadge('就绪', 'ready');
      // 延迟 1.5 秒后跳转
      setTimeout(() => redirectToMain(), 1500);
      break;

    case 'error':
      showError(message || '启动过程中发生未知错误');
      break;

    default:
      break;
  }

  // 更新步骤描述（如果有）
  if (phase === 'checking_env' && message) {
    document.getElementById('stepEnvDesc').textContent = message;
  }
}

// 步骤状态控制
function activateStep(stepName) {
  const step = document.querySelector(`.step[data-step="${stepName}"]`);
  if (step) {
    step.classList.add('active');
    step.classList.remove('done', 'error');
  }
}

function unactivateStep(stepName) {
  const step = document.querySelector(`.step[data-step="${stepName}"]`);
  if (step) {
    step.classList.remove('active');
  }
}

function completeStep(stepName) {
  const step = document.querySelector(`.step[data-step="${stepName}"]`);
  if (step) {
    step.classList.remove('active', 'error');
    step.classList.add('done');
  }
}

function failStep(stepName) {
  const step = document.querySelector(`.step[data-step="${stepName}"]`);
  if (step) {
    step.classList.remove('active', 'done');
    step.classList.add('error');
  }
}

// 状态徽章
function setStatusBadge(text, type) {
  const badge = document.getElementById('statusBadge');
  badge.textContent = text;
  badge.className = 'status-badge';
  if (type) {
    badge.classList.add(type);
  }
}

// 错误显示
function showError(message) {
  const errorSection = document.getElementById('errorSection');
  const errorMessage = document.getElementById('errorMessage');
  errorSection.classList.remove('d-none');
  errorMessage.textContent = message;
  setStatusBadge('错误', 'error');

  // 标记当前活跃步骤为错误
  document.querySelectorAll('.step.active').forEach(step => {
    step.classList.remove('active');
    step.classList.add('error');
  });
}

// 跳转到主页面
function redirectToMain() {
  const BACKEND_PORT = 3001;
  const mainUrl = `http://127.0.0.1:${BACKEND_PORT}`;
  console.log(`[Launcher] 跳转到主页面: ${mainUrl}`);

  // 用渐隐过渡效果
  const container = document.querySelector('.launcher-container');
  container.style.transition = 'opacity 0.5s ease';
  container.style.opacity = '0';

  setTimeout(() => {
    window.location.href = mainUrl;
  }, 500);
}
