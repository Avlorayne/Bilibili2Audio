const { execFile } = require('child_process');
const path = require('path');

const COOKIES_FILE = path.join(__dirname, 'cookies.txt');

const urls = [
  'https://www.bilibili.com/video/BV1JobQzTEwR/',
  'https://www.bilibili.com/video/BV11QupzEE8M',
  'https://www.bilibili.com/video/BV1MjPzzSEq8/'
];

async function testUrl(url) {
  return new Promise((resolve) => {
    console.log(`\n解析: ${url}`);
    execFile('yt-dlp', [
      '--dump-json',
      '--no-download',
      '--no-warnings',
      '--no-playlist',
      '--cookies', COOKIES_FILE,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--referer', 'https://www.bilibili.com',
      url
    ], { encoding: 'utf8', timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.log(`  错误: ${error.message.split('\n')[0]}`);
        resolve();
        return;
      }

      try {
        const info = JSON.parse(stdout);
        console.log(`  标题: ${info.title}`);
        console.log(`  时长: ${info.duration}秒`);
        console.log(`  UP主: ${info.uploader}`);
        resolve();
      } catch (e) {
        console.log(`  JSON解析错误: ${e.message}`);
        resolve();
      }
    });
  });
}

async function main() {
  for (const url of urls) {
    await testUrl(url);
  }
  console.log('\n测试完成');
}

main();