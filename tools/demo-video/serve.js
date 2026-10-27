// 本地预览服务：node tools/demo-video/serve.js [port]
// 浏览器打开 http://localhost:5179 即可在网页里操作小程序（数据来自本地演示数据 + seed）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build } = require('./compile');
const { seedScript } = require('./seed');

const ROOT = path.resolve(__dirname, '../..');
const ROUTES = {
  '/runtime/': path.join(__dirname, 'runtime'),
  '/dist/': path.join(__dirname, 'dist'),
  '/miniprogram/': path.join(ROOT, 'miniprogram'),
  '/docs/': path.join(ROOT, 'docs')
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webp': 'image/webp'
};

function createServer() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === '/' || url === '/index.html') return send(res, path.join(__dirname, 'runtime', 'index.html'));
    if (url === '/seed.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' });
      return res.end(seedScript());
    }
    for (const prefix of Object.keys(ROUTES)) {
      if (url.startsWith(prefix)) {
        const base = ROUTES[prefix];
        const file = path.normalize(path.join(base, url.slice(prefix.length)));
        if (!file.startsWith(base)) break;
        return send(res, file);
      }
    }
    res.writeHead(404);
    res.end('not found');
  });
}

function send(res, file) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

function start(port) {
  build();
  const server = createServer();
  return new Promise((resolve) => server.listen(port || 0, '127.0.0.1', () => resolve(server)));
}

module.exports = { start };

if (require.main === module) {
  start(+process.argv[2] || 5179).then((s) => {
    console.log('[serve] http://localhost:%d  （?keep=1 保留上次本地数据）', s.address().port);
  });
}
