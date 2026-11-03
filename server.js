/**
 * AULA F3287 — HIGH-SPEED PRODUCT EXPERIENCE SERVER
 * Multi-port listener with aggressive cache-invalidation headers
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PRIMARY_PORT = process.env.PORT || 3000;
const SECONDARY_PORT = 3001;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function getNetworkAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

// Map frame numbers between different naming conventions
function resolveFramePath(reqPath) {
  const frameMatch = reqPath.match(/(?:assets\/keyboard-frames\/|keyboard-frames\/)?(?:frame_|ezgif-frame-)(\d+)\.(jpg|png|jpeg)/i);
  if (frameMatch) {
    const num = parseInt(frameMatch[1], 10);
    const pad3 = String(num).padStart(3, '0');
    const directCandidate = path.join(ROOT_DIR, `ezgif-frame-${pad3}.jpg`);
    if (fs.existsSync(directCandidate)) {
      return directCandidate;
    }
  }
  return path.normalize(path.join(ROOT_DIR, reqPath));
}

function handleRequest(req, res) {
  // Clear any existing browser cache from older local projects on this port
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Clear-Site-Data', '"cache", "storage"');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  let safePath = resolveFramePath(reqPath);

  // Security check: must reside inside ROOT_DIR
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': ext === '.html' || ext === '.css' || ext === '.js' 
        ? 'no-store, no-cache, must-revalidate, max-age=0' 
        : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
}

function createStaticServer(port, isPrimary = true) {
  const server = http.createServer(handleRequest);

  server.listen(port, () => {
    const netIp = getNetworkAddress();
    if (isPrimary) {
      console.log('\n======================================================');
      console.log('  AULA F3287 CINEMATIC PRODUCT EXPERIENCE SERVER');
      console.log('======================================================');
      console.log(`\n  > Primary:   http://localhost:${port}/`);
      console.log(`  > Direct IP: http://127.0.0.1:${port}/`);
      if (netIp) {
        console.log(`  > Network:   http://${netIp}:${port}/`);
      }
      console.log('======================================================\n');
    } else {
      console.log(`  > Alternative Clean Port: http://localhost:${port}/ (Zero cache history)`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      createStaticServer(port + 1, isPrimary);
    } else {
      console.error('Server error on port ' + port, err);
    }
  });

  return server;
}

// Start primary server on port 3000
createStaticServer(PRIMARY_PORT, true);

// Start secondary clean server on port 3001 to bypass any old browser disk cache
createStaticServer(SECONDARY_PORT, false);
