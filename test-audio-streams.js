const https = require('https');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

// 读取cookies
function loadCookies() {
  if (!fs.existsSync(COOKIES_FILE)) return '';
  const lines = fs.readFileSync(COOKIES_FILE, 'utf8').split('\n');
  const cookies = [];
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) {
      cookies.push(`${parts[5]}=${parts[6]}`);
    }
  }
  return cookies.join('; ');
}

// 获取视频信息和音频流
async function getVideoStreams(bvid) {
  const cookies = loadCookies();

  // 1. 先获取视频信息（cid）
  const videoInfo = await new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
        'Cookie': cookies
      }
    };

    https.get(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.code === 0) resolve(json.data);
        else reject(new Error(json.message));
      });
    }).on('error', reject);
  });

  // 2. 获取播放地址（音频流）
  const playInfo = await new Promise((resolve, reject) => {
    // fnval=16 表示请求DASH格式，包含分离的音视频流
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
        'Cookie': cookies
      }
    };

    https.get(`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${videoInfo.cid}&fnval=16`, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.code === 0) resolve(json.data);
        else reject(new Error(json.message));
      });
    }).on('error', reject);
  });

  return { videoInfo, playInfo };
}

// 测试
async function main() {
  const bvid = 'BV1JobQzTEwR';
  console.log(`获取视频音频流: ${bvid}\n`);

  try {
    const { videoInfo, playInfo } = await getVideoStreams(bvid);

    console.log(`标题: ${videoInfo.title}`);
    console.log(`时长: ${videoInfo.duration}秒\n`);

    console.log('=== 音频流列表 ===');
    if (playInfo.dash && playInfo.dash.audio) {
      playInfo.dash.audio.forEach((audio, index) => {
        console.log(`\n音频 ${index + 1}:`);
        console.log(`  ID: ${audio.id}`);
        console.log(`  编码: ${audio.codecs}`);
        console.log(`  码率: ${audio.bandwidth} bps`);
        console.log(`  质量: ${getAudioQuality(audio.id)}`);
      });
    } else {
      console.log('没有找到音频流');
      console.log('playInfo:', JSON.stringify(playInfo, null, 2).slice(0, 500));
    }
  } catch (e) {
    console.error('错误:', e.message);
  }
}

function getAudioQuality(id) {
  const qualityMap = {
    30216: '64kbps',
    30232: '128kbps',
    30280: '192kbps',
    30250: '杜比全景声',
    30251: 'Hi-Res无损'
  };
  return qualityMap[id] || '未知';
}

main();