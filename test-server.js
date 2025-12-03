const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const server = http.createServer((req, res) => {
  let pathname = url.parse(req.url).pathname;

  console.log(`Request for: ${pathname}`);

  // Handle root
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Handle direct /profile access
  if (pathname === '/profile') {
    // Serve profile-v2.html for direct access (will show 404 via JavaScript)
    fs.readFile(path.join(__dirname, 'profile-v2.html'), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('404 Not Found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // Handle profile routes - mimics Vercel rewrite
  const profileMatch = pathname.match(/^\/u\/([^\/\?]+)/);
  if (profileMatch) {
    const username = profileMatch[1];
    console.log(`Profile request for user: ${username}`);

    // Serve profile-v2.html for these routes
    fs.readFile(path.join(__dirname, 'profile-v2.html'), (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('404 Not Found');
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  // Handle static files
  let filePath = path.join(__dirname, pathname);

  // Security check - prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try adding .html extension for clean URLs
      fs.readFile(filePath + '.html', (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }

    const ext = path.extname(filePath);
    const mimeType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   tickIQ Profile Test Server Running!      ║
╠════════════════════════════════════════════╣
║                                            ║
║   Main site:                               ║
║   http://localhost:${PORT}                     ║
║                                            ║
║   Test profile pages:                      ║
║   http://localhost:${PORT}/u/johndoe           ║
║   http://localhost:${PORT}/u/watchcollector    ║
║   http://localhost:${PORT}/u/testuser          ║
║                                            ║
║   Dev mode:                                ║
║   http://localhost:${PORT}/u/johndoe?dev=true  ║
║                                            ║
║   Press Ctrl+C to stop                     ║
╚════════════════════════════════════════════╝
  `);
});