// Bilibili2Audio 前端主逻辑

// 全局状态
let selectedFiles = [];  // 改为数组支持多文件
let parsedVideoInfo = null;
let selectedAudioStream = null;  // 用户选择的音频流
let tasks = new Map();
let ws = null;

// API基础URL
const API_BASE = window.location.origin + '/api';

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// 初始化应用
async function initApp() {
  // 初始化拖拽上传
  initDropZone();
  
  // 初始化文件选择
  initFileInput();
  
  // 初始化链接输入监听
  initBilibiliInput();
  
  // 初始化WebSocket
  initWebSocket();
  
  // 检查系统状态
  await checkSystemStatus();
  
  // 检查Cookies状态
  await checkCookiesStatus();
  
  // 检测已安装的浏览器
  await detectBrowsers();
  
  // 加载任务列表
  await loadTasks();
}

// 初始化拖拽上传
function initDropZone() {
  const dropZone = document.getElementById('dropZone');
  const selectFileBtn = document.getElementById('selectFileBtn');
  const fileInput = document.getElementById('fileInput');
  
  // 按钮点击 - 阻止冒泡
  selectFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  
  // 拖拽区域点击
  dropZone.addEventListener('click', (e) => {
    // 如果点击的是按钮，不重复触发
    if (e.target === selectFileBtn || selectFileBtn.contains(e.target)) {
      return;
    }
    fileInput.click();
  });
  
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files);
    }
  });
}

// 初始化文件选择
function initFileInput() {
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files);
    }
  });
}

// 初始化B站链接输入监听
function initBilibiliInput() {
  const input = document.getElementById('bilibiliUrl');
  
  input.addEventListener('input', () => {
    const url = input.value.trim();
    const validation = document.getElementById('urlValidation');
    
    if (url && !isValidBilibiliUrl(url)) {
      validation.textContent = '请输入有效的B站视频链接';
      validation.className = 'form-text text-danger';
    } else {
      validation.textContent = '';
    }
  });
  
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      parseBilibili();
    }
  });
}

// 初始化WebSocket连接
function initWebSocket() {
  const wsUrl = `ws://${window.location.host}`;
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('WebSocket连接已建立');
  };
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'progress') {
        updateTaskProgress(data.taskId, data);
      }
    } catch (e) {
      console.error('WebSocket消息解析错误:', e);
    }
  };
  
  ws.onclose = () => {
    console.log('WebSocket连接已断开，尝试重连...');
    setTimeout(initWebSocket, 3000);
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket错误:', error);
  };
}

// 验证B站链接
function isValidBilibiliUrl(url) {
  const patterns = [
    /^https?:\/\/www\.bilibili\.com\/video\/BV[a-zA-Z0-9]+/,
    /^https?:\/\/www\.bilibili\.com\/video\/av\d+/,
    /^https?:\/\/b23\.tv\/\w+/,
    /^https?:\/\/bilibili\.com\/video\/BV[a-zA-Z0-9]+/,
    /^https?:\/\/bilibili\.com\/video\/av\d+/
  ];
  
  return patterns.some(pattern => pattern.test(url));
}

// 处理文件选择（支持多文件）
function handleFileSelect(files) {
  const allowedTypes = ['video/mp4', 'video/avi', 'video/x-matroska', 'video/quicktime',
    'video/x-ms-wmv', 'video/x-flv', 'video/webm', 'video/3gpp', 'video/mp2t'];
  
  const fileList = Array.from(files);
  let addedCount = 0;
  
  fileList.forEach(file => {
    // 验证文件类型
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|avi|mkv|mov|wmv|flv|webm|3gp|ts)$/i)) {
      console.warn(`跳过不支持的格式: ${file.name}`);
      return;
    }
    
    // 验证文件大小 (2GB)
    if (file.size > 2 * 1024 * 1024 * 1024) {
      console.warn(`跳过过大的文件: ${file.name}`);
      return;
    }
    
    // 检查是否已存在
    if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
      selectedFiles.push(file);
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    updateFileList();
    document.getElementById('convertLocalBtn').disabled = false;
  }
}

// 更新文件列表显示
function updateFileList() {
  const fileList = document.getElementById('fileList');
  const fileListContent = document.getElementById('fileListContent');
  const fileCount = document.getElementById('fileCount');
  
  if (selectedFiles.length === 0) {
    fileList.classList.add('d-none');
    document.getElementById('convertLocalBtn').disabled = true;
    return;
  }
  
  fileList.classList.remove('d-none');
  fileCount.textContent = selectedFiles.length;
  
  let html = '';
  selectedFiles.forEach((file, index) => {
    html += `
      <div class="list-group-item list-group-item-action py-2">
        <div class="d-flex justify-content-between align-items-center">
          <div class="text-truncate me-2">
            <i class="bi bi-file-earmark-play"></i>
            <span class="ms-1">${escapeHtml(file.name)}</span>
            <span class="text-muted ms-2">${formatFileSize(file.size)}</span>
          </div>
          <button class="btn btn-sm btn-outline-danger" onclick="removeFileAt(${index})">
            <i class="bi bi-x"></i>
          </button>
        </div>
      </div>
    `;
  });
  
  fileListContent.innerHTML = html;
}

// 移除指定索引的文件
function removeFileAt(index) {
  selectedFiles.splice(index, 1);
  updateFileList();
}

// 清空所有文件
function clearAllFiles() {
  selectedFiles = [];
  document.getElementById('fileInput').value = '';
  updateFileList();
}

// 解析B站链接
async function parseBilibili() {
  const url = document.getElementById('bilibiliUrl').value.trim();
  
  if (!url) {
    showError('请输入B站视频链接');
    return;
  }
  
  if (!isValidBilibiliUrl(url)) {
    showError('请输入有效的B站视频链接');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/bilibili/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const result = await response.json();
    
    if (result.success) {
      parsedVideoInfo = result.data.videoInfo;
      
      // 显示视频信息
      document.getElementById('videoThumbnail').src = parsedVideoInfo.thumbnail || '';
      document.getElementById('videoTitle').textContent = parsedVideoInfo.title || '未知标题';
      document.getElementById('videoUploader').textContent = parsedVideoInfo.uploader || '未知UP主';
      document.getElementById('videoDuration').textContent = formatDuration(parsedVideoInfo.duration || 0);
      document.getElementById('videoInfo').classList.remove('d-none');
      
      // 显示音频流选择
      if (parsedVideoInfo.audioStreams && parsedVideoInfo.audioStreams.length > 0) {
        showAudioStreams(parsedVideoInfo.audioStreams);
      } else {
        // 没有音频流信息，启用默认转换按钮
        document.getElementById('convertBiliBtn').disabled = false;
      }
    } else {
      showError(result.error || '解析失败');
    }
  } catch (error) {
    showError('网络请求失败: ' + error.message);
  }
}

// 显示音频流选择列表
function showAudioStreams(audioStreams) {
  const container = document.getElementById('audioStreams');
  const list = document.getElementById('audioStreamsList');
  
  let html = '';
  audioStreams.forEach((stream, index) => {
    // Hi-Res和杜比音质显示特殊标签
    const isLossless = stream.id === 30251 || stream.id === 30250;
    const badge = isLossless ? '<span class="badge bg-success ms-2">自动FLAC</span>' : '';
    
    html += `
      <label class="list-group-item d-flex align-items-center" style="cursor: pointer;">
        <input type="radio" name="audioStream" value="${stream.id}" 
               ${index === 0 ? 'checked' : ''} 
               onchange="selectAudioStream(${stream.id})">
        <div class="ms-2 flex-grow-1">
          <div class="fw-bold">${stream.description}${badge}</div>
          <small class="text-muted">编码: ${stream.codec}${isLossless ? ' · 无损格式自动保存为FLAC' : ''}</small>
        </div>
      </label>
    `;
  });
  
  list.innerHTML = html;
  container.classList.remove('d-none');
  
  // 默认选择第一个
  if (audioStreams.length > 0) {
    selectedAudioStream = audioStreams[0];
    document.getElementById('convertBiliBtn').disabled = false;
  }
}

// 选择音频流
function selectAudioStream(streamId) {
  if (parsedVideoInfo && parsedVideoInfo.audioStreams) {
    selectedAudioStream = parsedVideoInfo.audioStreams.find(s => s.id === streamId);
  }
}

// 移除视频信息
function removeVideoInfo() {
  parsedVideoInfo = null;
  selectedAudioStream = null;
  document.getElementById('videoInfo').classList.add('d-none');
  document.getElementById('audioStreams').classList.add('d-none');
  document.getElementById('convertBiliBtn').disabled = true;
}

// 开始本地视频转换（批量）
async function startLocalConvert() {
  if (selectedFiles.length === 0) {
    showError('请先选择视频文件');
    return;
  }
  
  const format = document.getElementById('formatSelect').value;
  const quality = document.getElementById('qualitySelect').value;
  
  console.log(`开始批量上传: ${selectedFiles.length} 个文件`);
  
  const btn = document.getElementById('convertLocalBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 批量上传中...';
  
  let successCount = 0;
  let failCount = 0;
  
  // 逐个上传文件
  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    
    console.log(`上传文件 ${i + 1}/${selectedFiles.length}: ${file.name}`);
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 上传中 (${i + 1}/${selectedFiles.length})...`;
    
    const formData = new FormData();
    formData.append('video', file);
    formData.append('format', format);
    formData.append('quality', quality);
    
    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        // 订阅任务进度
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'subscribe', taskId: result.data.taskId }));
        }
        
        // 添加到任务列表
        addTask(result.data.taskId, {
          type: 'local',
          input: { filename: file.name, size: file.size },
          output: { format, quality }
        });
        
        successCount++;
      } else {
        console.error(`上传失败: ${file.name} - ${result.error}`);
        failCount++;
      }
    } catch (error) {
      console.error(`上传错误: ${file.name} - ${error.message}`);
      failCount++;
    }
  }
  
  // 显示结果
  if (failCount > 0) {
    showError(`批量上传完成：成功 ${successCount} 个，失败 ${failCount} 个`);
  }
  
  // 清空文件列表
  clearAllFiles();
  
  btn.disabled = false;
  btn.innerHTML = '<i class="bi bi-arrow-right-circle"></i> 开始转换';
}

// 开始B站链接转换
async function startBilibiliConvert() {
  const url = document.getElementById('bilibiliUrl').value.trim();
  const format = document.getElementById('biliFormatSelect').value;
  
  if (!url || !parsedVideoInfo) {
    showError('请先解析B站链接');
    return;
  }
  
  if (!selectedAudioStream) {
    showError('请选择音频质量');
    return;
  }
  
  try {
    document.getElementById('convertBiliBtn').disabled = true;
    document.getElementById('convertBiliBtn').innerHTML = '<span class="spinner-border spinner-border-sm"></span> 创建任务...';
    
    const response = await fetch(`${API_BASE}/convert/bilibili/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url, 
        audioStreamId: selectedAudioStream.id,
        format 
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // 订阅任务进度
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'subscribe', taskId: result.data.taskId }));
      }
      
      // 添加到任务列表
      addTask(result.data.taskId, {
        type: 'bilibili',
        input: {
          url: url,
          title: parsedVideoInfo.title || '未知标题',
          thumbnail: parsedVideoInfo.thumbnail || '',
          uploader: parsedVideoInfo.uploader || ''
        },
        output: { format, quality: selectedAudioStream.quality }
      });
      
      // 清除输入
      removeVideoInfo();
      document.getElementById('bilibiliUrl').value = '';
    } else {
      showError(result.error || '任务创建失败');
    }
  } catch (error) {
    showError('任务创建失败: ' + error.message);
  } finally {
    document.getElementById('convertBiliBtn').disabled = false;
    document.getElementById('convertBiliBtn').innerHTML = '<i class="bi bi-arrow-right-circle"></i> 开始转换';
  }
}

// 添加任务到列表
function addTask(taskId, taskData) {
  tasks.set(taskId, {
    id: taskId,
    status: 'queued',
    progress: 0,
    ...taskData
  });
  
  renderTaskList();
  
  // 启动轮询确保任务状态更新
  pollTaskStatus(taskId);
}

// 轮询任务状态
async function pollTaskStatus(taskId) {
  const pollInterval = setInterval(async () => {
    const task = tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed') {
      clearInterval(pollInterval);
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/task/${taskId}`);
      const result = await response.json();
      
      if (result.success && result.data) {
        const serverTask = result.data;
        task.status = serverTask.status || task.status;
        task.progress = serverTask.progress || task.progress || 0;
        
        if (serverTask.status === 'completed') {
          task.completedAt = serverTask.completedAt;
          if (serverTask.output && serverTask.output.path) {
            task.output = task.output || {};
            task.output.path = serverTask.output.path;
          }
          clearInterval(pollInterval);
        } else if (serverTask.status === 'failed') {
          task.error = serverTask.error || '转换失败';
          clearInterval(pollInterval);
        }
        
        renderTaskList();
      }
    } catch (error) {
      console.error('轮询任务状态失败:', error);
    }
  }, 500); // 每500ms检查一次
}

// 更新任务进度
function updateTaskProgress(taskId, progressData) {
  const task = tasks.get(taskId);
  if (task) {
    task.progress = progressData.progress || 0;
    task.status = progressData.status || 'processing';
    
    if (progressData.status === 'completed') {
      task.completedAt = new Date().toISOString();
    }
    
    renderTaskList();
  }
}

// 渲染任务列表
function renderTaskList() {
  const container = document.getElementById('taskList');
  
  if (tasks.size === 0) {
    container.innerHTML = `
      <div class="list-group-item text-center text-muted py-4">
        <i class="bi bi-inbox fs-1"></i>
        <p class="mb-0">暂无任务</p>
        <small>选择文件或输入链接开始转换</small>
      </div>
    `;
    return;
  }
  
  let html = '';
  
  tasks.forEach((task, taskId) => {
    const statusClass = task.status === 'processing' ? 'processing' : 
                       task.status === 'completed' ? 'completed' : 
                       task.status === 'failed' ? 'failed' : '';
    
    const statusText = getStatusText(task.status);
    const fileName = (task.input && (task.input.filename || task.input.title)) || '未知文件';
    const format = (task.output && task.output.format) ? task.output.format.toUpperCase() : 'MP3';
    const quality = (task.output && task.output.quality) ? `${task.output.quality}kbps` : '无损';
    
    html += `
      <div class="list-group-item task-card ${statusClass}">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="text-truncate me-2">
            <span class="status-dot ${task.status}"></span>
            <strong>${escapeHtml(fileName)}</strong>
            <span class="text-muted ms-2">${format} · ${quality}</span>
          </div>
          <div class="btn-group btn-group-sm">
            ${task.status === 'completed' ? `
              <a href="${API_BASE}/task/${taskId}/download" class="btn btn-success btn-sm" download>
                <i class="bi bi-download"></i>
              </a>
            ` : ''}
            <button class="btn btn-outline-danger btn-sm" onclick="deleteTask('${taskId}')">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
        ${task.status === 'queued' ? `
          <div class="text-muted small mt-1">
            <i class="bi bi-hourglass-split"></i> 等待处理中...
          </div>
        ` : ''}
        ${task.status === 'processing' || task.status === 'downloading' ? `
          <div class="progress" style="height: 20px;">
            <div class="progress-bar progress-bar-striped progress-bar-animated" 
                 role="progressbar" 
                 style="width: ${task.progress}%">
              ${task.progress}%
            </div>
          </div>
        ` : ''}
        ${task.status === 'failed' ? `
          <div class="text-danger small mt-1">
            <i class="bi bi-exclamation-circle"></i> ${escapeHtml(task.error || '转换失败')}
          </div>
        ` : ''}
        ${task.status === 'completed' ? `
          <div class="text-success small mt-1">
            <i class="bi bi-check-circle"></i> 转换完成
          </div>
        ` : ''}
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// 删除任务
async function deleteTask(taskId) {
  try {
    await fetch(`${API_BASE}/task/${taskId}`, { method: 'DELETE' });
    tasks.delete(taskId);
    renderTaskList();
  } catch (error) {
    console.error('删除任务失败:', error);
  }
}

// 清除已完成任务
async function clearCompletedTasks() {
  const completedTasks = Array.from(tasks.entries()).filter(([, task]) => task.status === 'completed');
  
  for (const [taskId] of completedTasks) {
    await deleteTask(taskId);
  }
}

// 检查系统状态
async function checkSystemStatus() {
  try {
    const response = await fetch(`${API_BASE}/status`);
    const result = await response.json();
    
    if (result.success) {
      const status = result.data;
      const statusDiv = document.getElementById('systemStatus');
      const statusText = document.getElementById('statusText');
      
      statusDiv.classList.remove('d-none');
      
      let statusMsg = [];
      
      if (status.dependencies.ffmpeg.available) {
        statusMsg.push(`FFmpeg: ${status.dependencies.ffmpeg.version}`);
      } else {
        statusMsg.push('FFmpeg: 未安装');
      }
      
      if (status.dependencies.ytdlp.available) {
        statusMsg.push(`yt-dlp: ${status.dependencies.ytdlp.version}`);
      } else {
        statusMsg.push('yt-dlp: 未安装');
      }
      
      statusText.textContent = statusMsg.join(' · ');
      
      // 更新任务计数
      document.getElementById('taskCount').textContent = `任务: ${status.tasks.total}/3`;
    }
  } catch (error) {
    console.error('获取系统状态失败:', error);
  }
}

// 加载任务列表
async function loadTasks() {
  try {
    const response = await fetch(`${API_BASE}/tasks`);
    const result = await response.json();
    
    if (result.success) {
      result.data.forEach(task => {
        tasks.set(task.id, task);
      });
      renderTaskList();
    }
  } catch (error) {
    console.error('加载任务列表失败:', error);
  }
}

// 获取状态文本
function getStatusText(status) {
  const statusMap = {
    'queued': '等待中',
    'processing': '处理中',
    'downloading': '下载中',
    'converting': '转换中',
    'completed': '已完成',
    'failed': '失败'
  };
  return statusMap[status] || status;
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 格式化时长
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 显示错误
function showError(message) {
  document.getElementById('errorMessage').textContent = message;
  const modal = new bootstrap.Modal(document.getElementById('errorModal'));
  modal.show();
}

// ========== Cookies管理 ==========

// 检测已安装的浏览器
async function detectBrowsers() {
  const select = document.getElementById('browserSelect');
  const detectText = document.getElementById('browserDetectText');
  
  try {
    const response = await fetch(`${API_BASE}/cookies/browsers`);
    const result = await response.json();
    
    if (result.success && result.data.browsers.length > 0) {
      const browsers = result.data.browsers;
      let html = '';
      browsers.forEach(browser => {
        html += `<option value="${browser.id}">${browser.name}</option>`;
      });
      select.innerHTML = html;
      detectText.textContent = `检测到 ${browsers.length} 个浏览器`;
      detectText.className = 'form-text text-success';
    } else {
      select.innerHTML = '<option value="">未检测到浏览器</option>';
      detectText.textContent = '未检测到已安装的浏览器，请手动粘贴Cookies';
      detectText.className = 'form-text text-warning';
    }
  } catch (error) {
    select.innerHTML = '<option value="">检测失败</option>';
    detectText.textContent = '浏览器检测失败: ' + error.message;
    detectText.className = 'form-text text-danger';
    console.error('检测浏览器失败:', error);
  }
}

// 从浏览器自动提取Cookies
async function autoExtractCookies() {
  const browser = document.getElementById('browserSelect').value;
  
  if (!browser) {
    showError('请先选择一个浏览器');
    return;
  }
  
  const btn = document.getElementById('autoExtractBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 提取中...';
  
  try {
    const response = await fetch(`${API_BASE}/cookies/auto-extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser })
    });
    
    const result = await response.json();
    
    if (result.success) {
      updateCookiesStatus(true);
      showSuccess(result.data.message || 'Cookies提取成功！');
    } else {
      showError(result.error || '提取失败');
    }
  } catch (error) {
    showError('提取失败: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-download"></i> 一键获取';
  }
}

// 切换cookies面板显示
function toggleCookiesPanel() {
  const panel = document.getElementById('cookiesPanel');
  const icon = document.getElementById('cookiesToggleIcon');
  
  if (panel.classList.contains('d-none')) {
    panel.classList.remove('d-none');
    icon.classList.replace('bi-chevron-down', 'bi-chevron-up');
  } else {
    panel.classList.add('d-none');
    icon.classList.replace('bi-chevron-up', 'bi-chevron-down');
  }
}

// 保存cookies
async function saveCookies() {
  const cookies = document.getElementById('cookiesInput').value.trim();
  
  if (!cookies) {
    showError('请输入cookies内容');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/cookies/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookies })
    });
    
    const result = await response.json();
    
    if (result.success) {
      updateCookiesStatus(true);
      showSuccess('Cookies保存成功！');
    } else {
      showError(result.error || '保存失败');
    }
  } catch (error) {
    showError('保存失败: ' + error.message);
  }
}

// 清除cookies
async function clearCookies() {
  try {
    const response = await fetch(`${API_BASE}/cookies`, { method: 'DELETE' });
    const result = await response.json();
    
    if (result.success) {
      document.getElementById('cookiesInput').value = '';
      updateCookiesStatus(false);
      showSuccess('Cookies已清除');
    }
  } catch (error) {
    showError('清除失败: ' + error.message);
  }
}

// 测试cookies
async function testCookies() {
  try {
    showSuccess('正在测试cookies...');
    const response = await fetch(`${API_BASE}/bilibili/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.bilibili.com/video/BV1JobQzTEwR/' })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showSuccess(`Cookies有效！视频: ${result.data.videoInfo.title}`);
    } else {
      showError('Cookies无效或已过期，请重新获取');
    }
  } catch (error) {
    showError('测试失败: ' + error.message);
  }
}

// 更新cookies状态显示
function updateCookiesStatus(configured) {
  const badge = document.getElementById('cookiesStatus');
  if (configured) {
    badge.textContent = '已配置';
    badge.classList.remove('bg-secondary');
    badge.classList.add('bg-success');
  } else {
    badge.textContent = '未配置';
    badge.classList.remove('bg-success');
    badge.classList.add('bg-secondary');
  }
}

// 检查cookies状态
async function checkCookiesStatus() {
  try {
    const response = await fetch(`${API_BASE}/cookies/status`);
    const result = await response.json();
    
    if (result.success) {
      updateCookiesStatus(result.data.configured);
    }
  } catch (error) {
    console.error('检查cookies状态失败:', error);
  }
}

// 显示成功消息
function showSuccess(message) {
  // 创建临时提示
  const toast = document.createElement('div');
  toast.className = 'position-fixed top-0 end-0 p-3';
  toast.style.zIndex = '9999';
  toast.innerHTML = `
    <div class="toast show" role="alert">
      <div class="toast-header bg-success text-white">
        <i class="bi bi-check-circle me-2"></i>
        <strong class="me-auto">成功</strong>
        <button type="button" class="btn-close btn-close-white" onclick="this.closest('.position-fixed').remove()"></button>
      </div>
      <div class="toast-body">${message}</div>
    </div>
  `;
  document.body.appendChild(toast);
  
  // 3秒后自动消失
  setTimeout(() => toast.remove(), 3000);
}