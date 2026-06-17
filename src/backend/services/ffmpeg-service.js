const { execFile, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { getFFmpegPath, checkFFmpeg } = require('./dependency-service');
const { logger } = require('../utils/logger');

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '../../../output');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 获取视频时长（秒）
async function getVideoDuration(inputPath) {
  const ffprobePath = getFFmpegPath().replace('ffmpeg', 'ffprobe');
  
  // 检查ffprobe是否存在
  let probeCommand = ffprobePath;
  if (!fs.existsSync(ffprobePath)) {
    probeCommand = 'ffprobe';
  }
  
  return new Promise((resolve, reject) => {
    execFile(probeCommand, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath
    ], { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        logger.warn(`获取视频时长失败: ${error.message}`);
        resolve(0);
      } else {
        resolve(parseFloat(stdout) || 0);
      }
    });
  });
}

// 转换本地视频为音频
async function convertLocalVideo(task, onProgress) {
  const ffmpegPath = getFFmpegPath();
  
  // 检查FFmpeg
  const ffmpegStatus = await checkFFmpeg();
  if (!ffmpegStatus.available) {
    throw new Error('FFmpeg未安装，请先安装FFmpeg');
  }
  
  // 确定FFmpeg命令
  const ffmpegCommand = ffmpegStatus.source === 'local' ? ffmpegPath : 'ffmpeg';
  
  const { input, output } = task;
  const outputFilename = `${path.parse(input.filename).name}.${output.format}`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  
  // 获取视频时长
  const duration = await getVideoDuration(input.path);
  
  // 构建FFmpeg参数
  const args = [
    '-i', input.path,
    '-vn',  // 不包含视频
    '-acodec', getAudioCodec(output.format),
    '-ab', `${output.quality}k`,
    '-y',  // 覆盖输出文件
    outputPath
  ];
  
  // 如果是无损格式，不设置码率
  if (output.format === 'flac' || output.format === 'wav') {
    args.splice(args.indexOf('-ab'), 2);
  }
  
  return new Promise((resolve, reject) => {
    logger.info(`开始转换: ${input.filename} -> ${outputFilename}`);
    
    const process = spawn(ffmpegCommand, args);
    let stderrData = '';
    
    process.stderr.on('data', (data) => {
      stderrData += data.toString();
      
      // 解析进度
      const timeMatch = data.toString().match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (timeMatch && duration > 0) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseInt(timeMatch[3]);
        const currentTime = hours * 3600 + minutes * 60 + seconds;
        const progress = Math.min(100, (currentTime / duration) * 100);
        
        if (onProgress) {
          onProgress({
            progress: Math.round(progress * 10) / 10,
            status: 'converting',
            currentTime: `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}`,
            message: '正在转码...'
          });
        }
      }
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        logger.info(`转换完成: ${outputPath}`);
        
        if (onProgress) {
          onProgress({
            progress: 100,
            status: 'completed',
            message: '转换完成'
          });
        }
        
        resolve(outputPath);
      } else {
        logger.error(`转换失败，退出码: ${code}`);
        logger.error(`错误信息: ${stderrData}`);
        reject(new Error(`FFmpeg转换失败: ${stderrData.slice(-200)}`));
      }
    });
    
    process.on('error', (error) => {
      logger.error(`FFmpeg执行错误: ${error.message}`);
      reject(new Error(`FFmpeg执行错误: ${error.message}`));
    });
  });
}

// 获取音频编码器
function getAudioCodec(format) {
  const codecs = {
    'mp3': 'libmp3lame',
    'aac': 'aac',
    'flac': 'flac',
    'wav': 'pcm_s16le',
    'ogg': 'libvorbis',
    'opus': 'libopus',
    'm4a': 'aac'
  };
  
  return codecs[format] || 'libmp3lame';
}

module.exports = {
  convertLocalVideo,
  getVideoDuration,
  getAudioCodec
};