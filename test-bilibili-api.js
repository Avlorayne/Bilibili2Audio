const https = require('https');
const fs = require('fs');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

// 读取cookies文件
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

// 从URL提取BV号
function extractBvid(url) {
  const match = url.match(/BV[a-zA-Z0-9]+/);
  return match ? match[0] : null;
}

// 调用B站API获取视频信息
async function getVideoInfo(bvid) {
  return new Promise((resolve, reject) => {
    const cookies = loadCookies();
    const options = {
      hostname: 'api.bilibili.com',
      path: `/x/web-interface/view?bvid=${bvid}`,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Cookie': cookies
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) {
            resolve(json.data);
          } else {
            reject(new Error(json.message || 'API请求失败'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 测试
async function main() {
  const urls = [
    'https://www.bilibili.com/video/BV1JobQzTEwR/',
    'https://www.bilibili.com/video/BV11QupzEE8M',
    'https://www.bilibili.com/video/BV1MjPzzSEq8/'
  ];

  for (const url of urls) {
    const bvid = extractBvid(url);
    console.log(`\n解析: ${url}`);
    console.log(`  BV号: ${bvid}`);

    try {
      const info = await getVideoInfo(bvid);
      console.log(`  标题: ${info.title}`);
      console.log(`  时长: ${info.duration}秒`);
      console.log(`  UP主: ${info.owner.name}`);
      console.log(`  封面: ${info.pic}`);
    } catch (e) {
      console.log(`  错误: ${e.message}`);
    }
  }
}

main();