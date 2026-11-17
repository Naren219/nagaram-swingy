/* What both halves of the smoke suite stand on: a server for the repo as it
   is, a headless Chromium, pages that collect their own console errors, and
   the tally of checks. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8517;
/* the reference city: no squalls, an ordinary breeze, no festival (11-city-day.js) */
const BASE = 'http://localhost:' + PORT + '/?day=plain';
const SHOTS = path.join(ROOT, 'test', 'screenshots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail !== undefined ? '  → ' + detail : ''));
  if (!ok) failures++;
}

/* serve the repo as-is, so the page loads its vendored three.js exactly as in production */
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

/* -> { BASE, SHOTS, check, newPage, finish } */
async function start() {
  await new Promise(r => server.listen(PORT, r));
  const launch = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
  if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
  let browser;
  try {
    browser = await chromium.launch(launch);
  } catch (e) {
    console.error('\nCould not start Chromium. Either install one:\n' +
      '  npx playwright install chromium\n' +
      'or point at an existing binary:\n' +
      '  CHROMIUM_PATH=/path/to/chrome npm test\n\n' + e.message);
    server.close();
    process.exit(1);
  }
  fs.mkdirSync(SHOTS, { recursive: true });

  async function newPage(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 800 } }, opts));
    const page = await ctx.newPage();
    page.errors = [];
    page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
    page.on('pageerror', e => page.errors.push('PAGEERROR: ' + e.message));
    return { ctx, page };
  }
  async function finish() {
    await browser.close();
    server.close();
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
    process.exit(failures === 0 ? 0 : 1);
  }
  return { BASE, SHOTS, check, newPage, finish };
}

module.exports = { start };
