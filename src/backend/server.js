const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const open = require('open');

// 导入路由
const apiRoutes = require('./routes/api');

// 导入服务
const { logger } = require('./utils/logger');
const { checkDependencies } = require('./services/dependency-service');

const app = express();
const server = http.createServer(app);

// WebSocket服务
const wss = new WebSocketServer({ server });

// 配置
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

// 中间件
app.use(cors({
  origin: [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务 - 前端
app.use(express.static(path.join(__dirname, '../frontend')));

// API路由
app.use('/api', apiRoutes);

// WebSocket连接处理
const clients = new Map();

wss.on('connection', (ws) => {
  const clientId = Date.now().toString();
  clients.set(clientId, ws);
  
  logger.info(`WebSocket客户端连接: ${clientId}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      logger.info(`收到消息: ${JSON.stringify(data)}`);
      
      // 处理订阅任务进度
      if (data.type === 'subscribe' && data.taskId) {
        ws.taskId = data.taskId;
      }
    } catch (e) {
      logger.error(`消息解析错误: ${e.message}`);
    }
  });
  
  ws.on('close', () => {
    clients.delete(clientId);
    logger.info(`WebSocket客户端断开: ${clientId}`);
  });
});

// 广播进度更新
function broadcastProgress(taskId, progress) {
  clients.forEach((ws) => {
    if (ws.taskId === taskId && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'progress',
        taskId,
        ...progress
      }));
    }
  });
}

// 导出广播函数供其他模块使用
app.set('broadcastProgress', broadcastProgress);

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 启动服务
async function startServer() {
  try {
    // 检查依赖
    logger.info('正在检查系统依赖...');
    const depStatus = await checkDependencies();
    logger.info('依赖检查完成:', depStatus);
    
    // 处理端口占用错误
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`端口 ${PORT} 已被占用`);
        console.error(`\n❌ 错误: 端口 ${PORT} 已被占用\n`);
        console.error('请先停止占用该端口的程序，或修改 PORT 环境变量使用其他端口');
        console.error('示例: PORT=3001 node src/backend/server.js\n');
        process.exit(1);
      } else {
        logger.error(`服务错误: ${error.message}`);
        console.error('❌ 服务错误:', error.message);
        process.exit(1);
      }
    });
    
    // 启动HTTP服务
    server.listen(PORT, HOST, async () => {
      logger.info(`服务已启动: http://${HOST}:${PORT}`);
      console.log(`\n✅ 服务已启动: http://${HOST}:${PORT}\n`);
      
      // 自动打开浏览器
      try {
        await open(`http://${HOST}:${PORT}`);
        logger.info('已自动打开浏览器');
      } catch (e) {
        logger.warn('无法自动打开浏览器，请手动访问');
      }
    });
  } catch (error) {
    logger.error(`服务启动失败: ${error.message}`);
    console.error('❌ 服务启动失败:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, broadcastProgress };