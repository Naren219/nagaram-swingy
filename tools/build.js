#!/usr/bin/env node
/* Concatenates src/ back into the single self-contained index.html that is
   committed and deployed. Grade-1 split: the parts share one runtime scope,
   exactly as they did when this was one file, so ORDER IS SEMANTIC — the
   manifest below is the source of truth, not the filesystem sort. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'src');

const ORDER = [
  'head.html',
  '00-core.js', '10-world.js', '20-geometry.js', '30-facade.js',
  '40-buildings.js', '45-ground.js', '50-water.js', '55-daycycle.js',
  '60-monuments.js', '65-broadphase.js', '70-vegetation.js', '75-traffic.js',
  '80-physics.js', '82-thermal-motes.js', '85-rig.js', '90-camera.js',
  '92-input.js', '94-audio.js', '96-hud.js', '99-loop.js',
  'tail.html',
];

/* every part must be listed: a new file that nobody wired in is a silent no-op */
const onDisk = fs.readdirSync(SRC).filter(f => /\.(js|html)$/.test(f)).sort();
const missing = onDisk.filter(f => !ORDER.includes(f));
if (missing.length) {
  console.error('src/ contains files missing from the build manifest: ' + missing.join(', '));
  process.exit(1);
}

const out = ORDER.map(f => {
  const p = path.join(SRC, f);
  if (!fs.existsSync(p)) { console.error('missing part: src/' + f); process.exit(1); }
  return fs.readFileSync(p, 'utf8');
}).join('');

const dest = path.join(ROOT, 'index.html');
const prev = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : null;
if (process.argv.includes('--check')) {
  if (prev !== out) { console.error('index.html is STALE — run `npm run build`'); process.exit(1); }
  console.log('index.html is up to date with src/');
  process.exit(0);
}
fs.writeFileSync(dest, out);
console.log((prev === out ? 'unchanged' : 'updated') + ': index.html  (' +
  out.split('\n').length + ' lines, ' + (Buffer.byteLength(out) / 1024).toFixed(0) + ' KB)');
