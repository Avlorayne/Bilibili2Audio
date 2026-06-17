const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { getYtdlpPath, checkYtdlp, getFFmpegPath, checkFFmpeg } = require('./dependency-service');
const { logger } = require('../utils/logger');

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '../../../output');

// Cookies文件路径
const COOKIES_FILE = path.join(__dirname, '../../../cookies.txt');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 检查cookies文件是否存在
function hasCookiesFile() {
  return fs.existsSync(COOKIES_FILE);
}

// 读取cookies文件并解析
function parseCookies() {
  if (!hasCookiesFile()) return '';
  
  const content = fs.readFileSync(COOKIES_FILE, 'utf8');
  const cookies = [];
  
  content.split('\n').forEach(line => {
    if (line.startsWith('#') || !line.trim()) return;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      cookies.push(`${parts[5]}=${parts[6]}`);
    }
  });
  
  return cookies.join('; ');
}

// 验证B站链接格式
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

// 从URL中提取BV号
function extractBvid(url) {
  const match = url.match(/BV[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

// 使用B站API获取视频信息
function fetchBilibiliApi(bvid) {
  return new Promise((resolve, reject) => {
    const cookies = parseCookies();
    const url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Cookie': cookies
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || '获取视频信息失败'));
          }
        } catch (e) {
          reject(new Error('解析API响应失败'));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`网络请求失败: ${error.message}`));
    });
  });
}

// 音频质量映射
const AUDIO_QUALITY_MAP = {
  30216: { quality: '64kbps', description: '标准音质 (64kbps)' },
  30232: { quality: '128kbps', description: '较高音质 (128kbps)' },
  30280: { quality: '192kbps', description: '高音质 (192kbps)' },
  30250: { quality: 'dolby', description: '杜比全景声' },
  30251: { quality: 'hires', description: 'Hi-Res无损' }
};

// 解析B站链接，获取视频信息和音频流
async function parseBilibiliUrl(url) {
  // 验证链接格式
  if (!isValidBilibiliUrl(url)) {
    throw new Error('请输入有效的B站视频链接');
  }
  
  const bvid = extractBvid(url);
  if (!bvid) {
    throw new Error('无法从链接中提取BV号');
  }
  
  logger.info(`正在解析B站链接: ${url}, BV号: ${bvid}`);
  
  try {
    // 使用B站API获取视频信息
    const data = await fetchBilibiliApi(bvid);
    
    // 获取音频流列表
    let audioStreams = [];
    try {
      const playData = await fetchVideoPlayUrl(bvid, data.cid);
      if (playData.dash && playData.dash.audio) {
        audioStreams = playData.dash.audio.map(audio => ({
          id: audio.id,
          codec: audio.codecs,
          bandwidth: audio.bandwidth,
          quality: AUDIO_QUALITY_MAP[audio.id]?.quality || 'unknown',
          description: AUDIO_QUALITY_MAP[audio.id]?.description || `音频流 ${audio.id}`,
          baseUrl: audio.baseUrl,
          backupUrl: audio.backupUrl
        }));
      }
    } catch (e) {
      logger.warn(`获取音频流失败: ${e.message}`);
    }
    
    return {
      title: data.title || '未知标题',
      duration: data.duration || 0,
      thumbnail: data.pic ? `https:${data.pic}` : '',
      uploader: data.owner ? data.owner.name : '未知UP主',
      description: (data.desc || '').slice(0, 200),
      bvid: data.bvid,
      aid: data.aid,
      cid: data.cid,
      audioStreams
    };
  } catch (error) {
    logger.error(`B站API解析失败: ${error.message}`);
    throw new Error(`视频解析失败: ${error.message}`);
  }
}

// 获取视频播放地址
function fetchVideoPlayUrl(bvid, cid) {
  return new Promise((resolve, reject) => {
    const cookies = parseCookies();
    const url = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&fnval=16`;
    
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Cookie': cookies
      }
    };
    
    https.get(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || '获取播放地址失败'));
          }
        } catch (e) {
          reject(new Error('解析API响应失败'));
        }
      });
    }).on('error', (error) => {
      reject(new Error(`网络请求失败: ${error.message}`));
    });
  });
}

// 下载B站视频音频
async function downloadBilibiliAudio(task, onProgress) {
  const ytdlpStatus = await checkYtdlp();
  if (!ytdlpStatus.available) {
    throw new Error('yt-dlp未安装，请先安装yt-dlp');
  }
  
  const ffmpegStatus = await checkFFmpeg();
  if (!ffmpegStatus.available) {
    throw new Error('FFmpeg未安装，请先安装FFmpeg');
  }
  
  const ytdlpCommand = ytdlpStatus.source === 'local' ? getYtdlpPath() : 'yt-dlp';
  const ffmpegPath = ffmpegStatus.source === 'local' ? getFFmpegPath() : 'ffmpeg';
  
  const { input, output } = task;
  const outputFilename = `${sanitizeFilename(input.title)}.${output.format}`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  
  // 构建yt-dlp参数
  const args = [
    '--extract-audio',
    '--audio-format', output.format,
    '--ffmpeg-location', path.dirname(ffmpegPath),
    '--output', outputPath,
    '--newline',
    '--no-playlist',
    '--progress'
  ];
  
  // 添加cookies参数
  if (hasCookiesFile()) {
    args.push('--cookies', COOKIES_FILE);
  }
  
  // 添加音频质量参数（无损格式不需要）
  if (output.format !== 'flac' && output.format !== 'wav') {
    args.push('--audio-quality', output.quality);
  }
  
  args.push(input.url);
  
  return new Promise((resolve, reject) => {
    logger.info(`开始下载B站音频: ${input.title}`);
    
    if (onProgress) {
      onProgress({
        progress: 0,
        status: 'downloading',
        message: '正在下载...'
      });
    }
    
    const process = spawn(ytdlpCommand, args);
    let stderrData = '';
    
    process.stdout.on('data', (data) => {
      const output = data.toString();
      
      // 解析下载进度
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch && onProgress) {
        const progress = parseFloat(progressMatch[1]);
        onProgress({
          progress: Math.round(progress * 10) / 10,
          status: progress < 100 ? 'downloading' : 'converting',
          message: progress < 100 ? '正在下载...' : '正在转换...'
        });
      }
    });
    
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        logger.info(`B站音频下载完成: ${outputPath}`);
        
        // 检查输出文件是否存在
        let finalPath = outputPath;
        if (!fs.existsSync(outputPath)) {
          // 尝试查找输出文件
          const dir = path.dirname(outputPath);
          const baseName = path.basename(outputPath, path.extname(outputPath));
          const files = fs.readdirSync(dir).filter(f => f.startsWith(baseName));
          if (files.length > 0) {
            finalPath = path.join(dir, files[0]);
          }
        }
        
        if (onProgress) {
          onProgress({
            progress: 100,
            status: 'completed',
            message: '下载完成'
          });
        }
        
        resolve(finalPath);
      } else {
        logger.error(`yt-dlp下载失败，退出码: ${code}`);
        logger.error(`错误信息: ${stderrData}`);
        
        if (stderrData.includes('Video unavailable')) {
          reject(new Error('视频不存在或已被删除'));
        } else if (stderrData.includes('login')) {
          reject(new Error('该视频需要登录才能观看'));
        } else {
          reject(new Error(`音频下载失败: ${stderrData.slice(-200)}`));
        }
      }
    });
    
    process.on('error', (error) => {
      logger.error(`yt-dlp执行错误: ${error.message}`);
      reject(new Error(`yt-dlp执行错误: ${error.message}`));
    });
  });
}

// 下载指定音频流
async function downloadAudioStream(task, audioStream, onProgress) {
  logger.info(`downloadAudioStream 开始执行, taskId: ${task.id}`);
  
  const ffmpegStatus = await checkFFmpeg();
  if (!ffmpegStatus.available) {
    throw new Error('FFmpeg未安装，请先安装FFmpeg');
  }
  
  const ffmpegPath = ffmpegStatus.source === 'local' ? getFFmpegPath() : 'ffmpeg';
  const { input, output } = task;
  
  // Hi-Res和杜比音质强制使用FLAC格式保存
  const isLossless = audioStream.id === 30251 || audioStream.id === 30250;
  const finalFormat = isLossless ? 'flac' : output.format;
  
  // 输出文件名
  const outputFilename = `${sanitizeFilename(input.title)}_${audioStream.quality}.${finalFormat}`;
  const tempFile = path.join(OUTPUT_DIR, `${sanitizeFilename(input.title)}_temp.m4a`);
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  
  logger.info(`开始下载音频流: ${audioStream.description}`);
  logger.info(`输出路径: ${outputPath}`);
  logger.info(`音频URL: ${audioStream.baseUrl.substring(0, 100)}...`);
  logger.info(`无损音质: ${isLossless}, 最终格式: ${finalFormat}`);
  
  if (onProgress) {
    onProgress({
      progress: 0,
      status: 'downloading',
      message: `正在下载 ${audioStream.description}...`
    });
  }
  
  // 1. 先下载原始音频流
  await new Promise((resolve, reject) => {
    const cookies = parseCookies();
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
        'Cookie': cookies
      }
    };
    
    const file = fs.createWriteStream(tempFile);
    let downloaded = 0;
    
    https.get(audioStream.baseUrl, options, (res) => {
      const totalSize = parseInt(res.headers['content-length'] || '0');
      
      res.on('data', (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        
        if (onProgress && totalSize > 0) {
          const progress = Math.round((downloaded / totalSize) * 70); // 下载占70%
          onProgress({
            progress,
            status: 'downloading',
            message: `正在下载 ${audioStream.description}...`
          });
        }
      });
      
      res.on('end', () => {
        file.end();
        logger.info(`音频流下载完成: ${tempFile}, 大小: ${downloaded} bytes`);
        resolve();
      });
      
      res.on('error', (error) => {
        file.end();
        fs.unlinkSync(tempFile);
        reject(error);
      });
    }).on('error', (error) => {
      file.end();
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      reject(error);
    });
  });
  
  // 2. 使用FFmpeg转换格式
  if (onProgress) {
    onProgress({
      progress: 70,
      status: 'converting',
      message: '正在转换格式...'
    });
  }
  
  await new Promise((resolve, reject) => {
    const args = [
      '-i', tempFile,
      '-vn',
      '-y',
      outputPath
    ];
    
    const process = spawn(ffmpegPath, args);
    let stderrData = '';
    
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    process.on('close', (code) => {
      // 清理临时文件
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      
      if (code === 0) {
        logger.info(`FFmpeg转换完成: ${outputPath}`);
        // 更新任务的实际输出格式
        task.output.format = finalFormat;
        if (onProgress) {
          onProgress({
            progress: 100,
            status: 'completed',
            message: '下载完成'
          });
        }
        resolve();
      } else {
        logger.error(`FFmpeg转换失败, 退出码: ${code}, 错误: ${stderrData}`);
        reject(new Error(`FFmpeg转换失败: ${stderrData.slice(-200)}`));
      }
    });
    
    process.on('error', (error) => {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      reject(error);
    });
  });
  
  return outputPath;
}

// 可用的浏览器列表
const SUPPORTED_BROWSERS = [
  { id: 'chrome', name: 'Google Chrome' },
  { id: 'chromium', name: 'Chromium' },
  { id: 'firefox', name: 'Firefox' },
  { id: 'edge', name: 'Microsoft Edge' },
  { id: 'brave', name: 'Brave' },
  { id: 'opera', name: 'Opera' },
  { id: 'vivaldi', name: 'Vivaldi' }
];

// 检测已安装的浏览器
function detectInstalledBrowsers() {
  const os = require('os');
  const homeDir = os.homedir();
  const platform = process.platform;
  
  const browserPaths = {
    linux: {
      chrome: [path.join(homeDir, '.config/google-chrome')],
      chromium: [path.join(homeDir, '.config/chromium')],
      firefox: [path.join(homeDir, '.mozilla/firefox')],
      edge: [path.join(homeDir, '.config/microsoft-edge')],
      brave: [path.join(homeDir, '.config/BraveSoftware/Brave-Browser')],
      opera: [path.join(homeDir, '.config/opera')],
      vivaldi: [path.join(homeDir, '.config/vivaldi')]
    },
    darwin: {
      chrome: [path.join(homeDir, 'Library/Application Support/Google/Chrome')],
      chromium: [path.join(homeDir, 'Library/Application Support/Chromium')],
      firefox: [path.join(homeDir, 'Library/Application Support/Firefox')],
      edge: [path.join(homeDir, 'Library/Application Support/Microsoft Edge')],
      brave: [path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser')],
      opera: [path.join(homeDir, 'Library/Application Support/com.operasoftware.Opera')],
      vivaldi: [path.join(homeDir, 'Library/Application Support/Vivaldi')]
    },
    win32: {
      chrome: [path.join(homeDir, 'AppData/Local/Google/Chrome/User Data')],
      chromium: [path.join(homeDir, 'AppData/Local/Chromium/User Data')],
      firefox: [path.join(homeDir, 'AppData/Roaming/Mozilla/Firefox')],
      edge: [path.join(homeDir, 'AppData/Local/Microsoft/Edge/User Data')],
      brave: [path.join(homeDir, 'AppData/Local/BraveSoftware/Brave-Browser/User Data')],
      opera: [path.join(homeDir, 'AppData/Roaming/Opera Software/Opera Stable')],
      vivaldi: [path.join(homeDir, 'AppData/Local/Vivaldi/User Data')]
    }
  };
  
  const paths = browserPaths[platform] || browserPaths.linux;
  const detected = [];
  
  for (const browser of SUPPORTED_BROWSERS) {
    const browserPathList = paths[browser.id];
    if (browserPathList) {
      for (const p of browserPathList) {
        if (fs.existsSync(p)) {
          detected.push({ id: browser.id, name: browser.name });
          break;
        }
      }
    }
  }
  
  return detected;
}

// 使用yt-dlp从浏览器提取Cookies
async function extractBrowserCookies(browserName) {
  const ytdlpStatus = await checkYtdlp();
  if (!ytdlpStatus.available) {
    throw new Error('yt-dlp未安装，无法自动获取浏览器Cookies');
  }
  
  const ytdlpCommand = ytdlpStatus.source === 'local' ? getYtdlpPath() : 'yt-dlp';
  
  logger.info(`正在从 ${browserName} 提取Cookies...`);
  
  // 使用一个具体的B站视频页面来触发cookies保存
  const testUrl = 'https://www.bilibili.com/video/BV1GJ411x7h7';
  
  return new Promise((resolve, reject) => {
    const args = [
      '--cookies-from-browser', browserName,
      '--cookies', COOKIES_FILE,
      '--skip-download',
      '--no-check-certificates',
      testUrl
    ];
    
    const process = spawn(ytdlpCommand, args);
    let stderrData = '';
    let stdoutData = '';
    
    process.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
    });
    
    process.on('close', (code) => {
      logger.info(`yt-dlp退出码: ${code}`);
      logger.info(`yt-dlp stdout: ${stdoutData.slice(0, 500)}`);
      logger.info(`yt-dlp stderr: ${stderrData.slice(0, 500)}`);
      
      // 检查cookies文件是否已生成（即使有警告也可能成功保存了cookies）
      if (fs.existsSync(COOKIES_FILE)) {
        const content = fs.readFileSync(COOKIES_FILE, 'utf8');
        const lineCount = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
        
        if (lineCount > 0) {
          logger.info(`Cookies提取完成，共 ${lineCount} 条记录`);
          
          // 即使有v11解密警告，只要cookies文件有内容就可以继续
          const hasDecryptWarning = stderrData.includes('cannot decrypt');
          const warningMsg = hasDecryptWarning ? '（部分加密cookies可能无法解密）' : '';
          
          resolve({ 
            success: true, 
            message: `已从 ${browserName} 提取Cookies (${lineCount} 条记录)${warningMsg}`,
            count: lineCount,
            hasWarning: hasDecryptWarning
          });
          return;
        }
      }
      
      // cookies文件不存在或为空
      const errorMsg = stderrData.includes('could not find') 
        ? `未找到 ${browserName} 浏览器数据，请确认已安装并使用过` 
        : `提取失败: ${stderrData.slice(-300)}`;
      reject(new Error(errorMsg));
    });
    
    process.on('error', (error) => {
      logger.error(`yt-dlp执行错误: ${error.message}`);
      reject(new Error(`yt-dlp执行错误: ${error.message}`));
    });
  });
}

// 清理文件名中的非法字符
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200); // 限制长度
}

module.exports = {
  parseBilibiliUrl,
  downloadBilibiliAudio,
  downloadAudioStream,
  isValidBilibiliUrl,
  hasCookiesFile,
  detectInstalledBrowsers,
  extractBrowserCookies
};