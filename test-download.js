const https = require('https');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

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

async function test() {
  const cookies = loadCookies();
  const bvid = 'BV1wXJW69EMo';
  
  // 1. 获取视频信息
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
      res.on('end', () => resolve(JSON.parse(data).data));
    }).on('error', reject);
  });
  
  console.log('视频标题:', videoInfo.title);
  console.log('CID:', videoInfo.cid);
  
  // 2. 获取播放地址
  const playInfo = await new Promise((resolve, reject) => {
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
      res.on('end', () => resolve(JSON.parse(data).data));
    }).on('error', reject);
  });
  
  const audio = playInfo.dash.audio[0];
  console.log('\n音频流信息:');
  console.log('  ID:', audio.id);
  console.log('  编码:', audio.codecs);
  console.log('  baseUrl:', audio.baseUrl.substring(0, 100) + '...');
  
  // 3. 测试下载
  console.log('\n测试下载...');
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com',
      'Cookie': cookies
    }
  };
  
  https.get(audio.baseUrl, options, (res) => {
    console.log('状态码:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Content-Length:', res.headers['content-length']);
    
    // 读取前100字节看看是什么内容
    let chunks = [];
    let totalSize = 0;
    res.on('data', (chunk) => {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize > 1000) {
        res.destroy();
        const buffer = Buffer.concat(chunks);
        console.log('\n前100字节内容:');
        console.log(buffer.slice(0, 100).toString('utf8'));
        console.log('\n是否为JSON:', buffer.slice(0, 1).toString() === '{');
      }
    });
  }).on('error', console.error);
}

test().catch(console.error);