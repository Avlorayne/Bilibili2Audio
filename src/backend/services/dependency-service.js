const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 获取平台标识
function getPlatform() {
  const platform = os.platform();
  const arch = os.arch();
  
  if (platform === 'win32') return 'win64';
  if (platform === 'darwin') return 'macos64';
  return 'linux64';
}

// 获取FFmpeg路径
function getFFmpegPath() {
  const platform = getPlatform();
  const filename = os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return path.join(__dirname, '../../../resources/ffmpeg', platform, filename);
}

// 获取yt-dlp路径
function getYtdlpPath() {
  const platform = getPlatform();
  const filename = os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(__dirname, '../../../resources/ytdlp', platform, filename);
}

// 检查FFmpeg
async function checkFFmpeg() {
  const ffmpegPath = getFFmpegPath();
  
  // 优先检查本地FFmpeg
  if (fs.existsSync(ffmpegPath)) {
    try {
      const result = await execCommand(ffmpegPath, ['-version']);
      const versionMatch = result.match(/ffmpeg version (\S+)/);
      return {
        available: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
        path: ffmpegPath,
        source: 'local'
      };
    } catch (e) {
      // 本地FFmpeg执行失败，尝试系统FFmpeg
    }
  }
  
  // 尝试系统FFmpeg
  try {
    const result = await execCommand('ffmpeg', ['-version']);
    const versionMatch = result.match(/ffmpeg version (\S+)/);
    return {
      available: true,
      version: versionMatch ? versionMatch[1] : 'unknown',
      path: 'system',
      source: 'system'
    };
  } catch (e) {
    return {
      available: false,
      version: null,
      path: null,
      source: null,
      error: 'FFmpeg未安装'
    };
  }
}

// 检查yt-dlp
async function checkYtdlp() {
  const ytdlpPath = getYtdlpPath();
  
  // 优先检查本地yt-dlp
  if (fs.existsSync(ytdlpPath)) {
    try {
      const version = await execCommand(ytdlpPath, ['--version']);
      return {
        available: true,
        version: version.trim(),
        path: ytdlpPath,
        source: 'local'
      };
    } catch (e) {
      // 本地yt-dlp执行失败
    }
  }
  
  // 尝试系统yt-dlp
  try {
    const version = await execCommand('yt-dlp', ['--version']);
    return {
      available: true,
      version: version.trim(),
      path: 'system',
      source: 'system'
    };
  } catch (e) {
    return {
      available: false,
      version: null,
      path: null,
      source: null,
      error: 'yt-dlp未安装'
    };
  }
}

// 检查所有依赖
async function checkDependencies() {
  const results = {
    node: {
      available: true,
      version: process.version,
      required: '>=18.0.0'
    },
    ffmpeg: await checkFFmpeg(),
    ytdlp: await checkYtdlp()
  };
  
  return results;
}

// 执行命令的Promise封装
function execCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(stdout || stderr);
      }
    });
  });
}

module.exports = {
  checkDependencies,
  checkFFmpeg,
  checkYtdlp,
  getFFmpegPath,
  getYtdlpPath,
  getPlatform
};