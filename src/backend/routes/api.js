const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// 导入服务
const { checkDependencies } = require('../services/dependency-service');
const { convertLocalVideo } = require('../services/ffmpeg-service');
const { parseBilibiliUrl, downloadBilibiliAudio, downloadAudioStream, detectInstalledBrowsers, extractBrowserCookies } = require('../services/bilibili-service');
const { logger } = require('../utils/logger');

// 配置multer用于文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../../temp/uploads');
    // 确保目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024 // 2GB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'video/mp4', 'video/avi', 'video/x-matroska', 'video/quicktime',
      'video/x-ms-wmv', 'video/x-flv', 'video/webm', 'video/3gpp',
      'video/mp2t', 'video/ogg', 'video/mpeg'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的视频格式'), false);
    }
  }
});

// 存储任务状态
const tasks = new Map();

// 系统状态接口
router.get('/status', async (req, res) => {
  try {
    const deps = await checkDependencies();
    res.json({
      success: true,
      data: {
        dependencies: deps,
        tasks: {
          total: tasks.size,
          active: Array.from(tasks.values()).filter(t => t.status === 'processing').length,
          queued: Array.from(tasks.values()).filter(t => t.status === 'queued').length
        }
      }
    });
  } catch (error) {
    logger.error(`获取状态失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cookies管理API
const COOKIES_FILE = path.join(__dirname, '../../../cookies.txt');

// 获取cookies状态
router.get('/cookies/status', (req, res) => {
  const exists = fs.existsSync(COOKIES_FILE);
  res.json({
    success: true,
    data: {
      configured: exists,
      path: COOKIES_FILE
    }
  });
});

// 保存cookies
router.post('/cookies/save', (req, res) => {
  try {
    const { cookies } = req.body;
    
    if (!cookies) {
      return res.status(400).json({ success: false, error: '请输入cookies内容' });
    }
    
    // 转换为Netscape格式
    const lines = ['# Netscape HTTP Cookie File'];
    const pairs = cookies.split(';').map(s => s.trim()).filter(Boolean);
    
    for (const pair of pairs) {
      const [name, ...valueParts] = pair.split('=');
      const value = valueParts.join('=');
      if (name && value) {
        lines.push(`.bilibili.com\tTRUE\t/\tFALSE\t0\t${name.trim()}\t${value.trim()}`);
      }
    }
    
    fs.writeFileSync(COOKIES_FILE, lines.join('\n'));
    logger.info('Cookies已保存');
    
    res.json({ success: true, message: 'Cookies保存成功' });
  } catch (error) {
    logger.error(`保存Cookies失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 检测已安装的浏览器
router.get('/cookies/browsers', (req, res) => {
  try {
    const browsers = detectInstalledBrowsers();
    res.json({
      success: true,
      data: { browsers }
    });
  } catch (error) {
    logger.error(`检测浏览器失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 从浏览器自动提取Cookies
router.post('/cookies/auto-extract', async (req, res) => {
  try {
    const { browser } = req.body;
    
    if (!browser) {
      return res.status(400).json({ success: false, error: '请选择浏览器' });
    }
    
    logger.info(`开始从 ${browser} 提取Cookies...`);
    const result = await extractBrowserCookies(browser);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error(`自动提取Cookies失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 清除cookies
router.delete('/cookies', (req, res) => {
  try {
    if (fs.existsSync(COOKIES_FILE)) {
      fs.unlinkSync(COOKIES_FILE);
      logger.info('Cookies已清除');
    }
    res.json({ success: true, message: 'Cookies已清除' });
  } catch (error) {
    logger.error(`清除Cookies失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 本地视频上传接口
router.post('/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '请选择视频文件' });
    }
    
    const { format = 'mp3', quality = '192' } = req.body;
    const taskId = uuidv4();
    
    logger.info(`收到上传请求: ${req.file.originalname} (${format}/${quality}kbps), 任务ID: ${taskId}`);
    
    // 创建任务
    const task = {
      id: taskId,
      type: 'local',
      status: 'queued',
      input: {
        filename: req.file.originalname,
        path: req.file.path,
        size: req.file.size
      },
      output: {
        format,
        quality
      },
      progress: 0,
      createdAt: new Date().toISOString()
    };
    
    tasks.set(taskId, task);
    
    // 异步执行转换
    convertLocalVideo(task, (progress) => {
      task.progress = progress.progress;
      task.status = progress.status;
      
      // 广播进度
      const broadcastProgress = req.app.get('broadcastProgress');
      if (broadcastProgress) {
        broadcastProgress(taskId, progress);
      }
    }).then((outputPath) => {
      task.status = 'completed';
      task.output.path = outputPath;
      task.completedAt = new Date().toISOString();
    }).catch((error) => {
      task.status = 'failed';
      task.error = error.message;
    });
    
    res.json({
      success: true,
      data: {
        taskId,
        message: '任务已创建'
      }
    });
  } catch (error) {
    logger.error(`上传失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// B站链接解析接口（只解析，不创建任务）
router.post('/bilibili/parse', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: '请输入B站视频链接' });
    }
    
    // 解析B站链接，获取视频信息和音频流
    const videoInfo = await parseBilibiliUrl(url);
    
    res.json({
      success: true,
      data: {
        videoInfo
      }
    });
  } catch (error) {
    logger.error(`B站链接解析失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 下载指定音频流
router.post('/convert/bilibili/stream', async (req, res) => {
  try {
    const { url, audioStreamId, format = 'mp3' } = req.body;
    
    if (!url) {
      return res.status(400).json({ success: false, error: '请输入B站视频链接' });
    }
    
    if (!audioStreamId) {
      return res.status(400).json({ success: false, error: '请选择音频流' });
    }
    
    // 解析B站链接获取视频信息和音频流
    const videoInfo = await parseBilibiliUrl(url);
    
    // 查找用户选择的音频流
    const audioStream = videoInfo.audioStreams.find(s => s.id === parseInt(audioStreamId));
    if (!audioStream) {
      return res.status(400).json({ success: false, error: '未找到指定的音频流' });
    }
    
    const taskId = uuidv4();
    
    // 创建任务
    const task = {
      id: taskId,
      type: 'bilibili',
      status: 'queued',
      input: {
        url,
        title: videoInfo.title,
        duration: videoInfo.duration,
        thumbnail: videoInfo.thumbnail,
        uploader: videoInfo.uploader
      },
      output: {
        format,
        quality: audioStream.quality
      },
      progress: 0,
      createdAt: new Date().toISOString()
    };
    
    tasks.set(taskId, task);
    
    // 异步执行下载
    downloadAudioStream(task, audioStream, (progress) => {
      task.progress = progress.progress;
      task.status = progress.status;
      
      // 广播进度
      const broadcastProgress = req.app.get('broadcastProgress');
      if (broadcastProgress) {
        broadcastProgress(taskId, progress);
      }
    }).then((outputPath) => {
      task.status = 'completed';
      task.output.path = outputPath;
      task.completedAt = new Date().toISOString();
    }).catch((error) => {
      task.status = 'failed';
      task.error = error.message;
    });
    
    res.json({
      success: true,
      data: {
        taskId,
        message: '任务已创建'
      }
    });
  } catch (error) {
    logger.error(`音频流下载失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 查询任务状态
router.get('/task/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  
  if (!task) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  res.json({ success: true, data: task });
});

// 获取所有任务
router.get('/tasks', (req, res) => {
  const taskList = Array.from(tasks.values());
  res.json({ success: true, data: taskList });
});

// 下载转换后的音频
router.get('/task/:taskId/download', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  
  if (!task) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  if (task.status !== 'completed') {
    return res.status(400).json({ success: false, error: '任务未完成' });
  }
  
  const filePath = task.output.path;
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: '文件不存在' });
  }
  
  const filename = `${task.input.filename || task.input.title}.${task.output.format}`;
  res.download(filePath, filename);
});

// 删除任务
router.delete('/task/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);
  
  if (!task) {
    return res.status(404).json({ success: false, error: '任务不存在' });
  }
  
  // 清理临时文件
  if (task.input.path && fs.existsSync(task.input.path)) {
    fs.unlinkSync(task.input.path);
  }
  if (task.output.path && fs.existsSync(task.output.path)) {
    fs.unlinkSync(task.output.path);
  }
  
  tasks.delete(taskId);
  
  res.json({ success: true, message: '任务已删除' });
});

module.exports = router;