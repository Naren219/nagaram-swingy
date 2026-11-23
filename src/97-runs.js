/* =====================================================================
   RUNS — a course of rings through the city, flown against the clock
   G starts (or restarts) the selected course, N picks the next course,
   X leaves. The clock starts when you pass the first ring, so the approach
   is free. A course is nothing but a seed: today's date makes the daily
   one, and ?run=1234 in the address makes any other, so a course can be
   shared as a link. Your best time on each is kept with a ghost of the
   flight that set it.

   Three words, used strictly: a COURSE is a set of rings, a RING is one
   hoop, a RUN is one attempt at a course.
   ===================================================================== */
const COURSE_RINGS = 12;
const PASS_R = 11;         // metres from a ring's centre that count as through
const RING_R = 9;          // drawn radius: a little inside what counts
const GHOST_HZ = 10, GHOST_MAX = 3000;   // five minutes of ghost at most
const RUN_KEY = 'nagaram.runs';

const COURSES = (() => {
  const d = new Date(), today = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  const shared = /[?&]run=(\d{1,9})\b/.exec(location.search);
  const seeds = [['day-' + today, 'Today', today], ['c1', 'Course one', 1101], ['c2', 'Course two', 2202], ['c3', 'Course three', 3303]];
  if (shared) seeds.unshift(['seed-' + shared[1], 'Seed ' + shared[1], +shared[1]]);
  return seeds.map(([id, name, seed]) => ({ id, name, seed, rings: null, sig: '' }));   // rings are built on first use
})();

/* tallest roof within r of a point: a ring is only fair where there is
   something to swing from */
function roofNear(x, z, r) {
  let h = 0;
  for (const b of buildings) {
    const dx = Math.max(Math.abs(x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(z - b.z) - b.d / 2, 0);
    if (dx * dx + dz * dz < r * r && b.h > h) h = b.h;
  }
  return h;
}
/* nothing solid within r of a point: room for a whole ring, whether that is
   over a junction or above the rooftops */
function clearAt(x, y, z, r) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const a = hash.get(hkey(i + di, j + dj)); if (!a) continue;
    for (const b of a) {
      const o = b * 6;
      const dx = Math.max(BOXES[o] - x, 0, x - BOXES[o + 3]), dy = Math.max(BOXES[o + 1] - y, 0, y - BOXES[o + 4]);
      const dz = Math.max(BOXES[o + 2] - z, 0, z - BOXES[o + 5]);
      if (dx * dx + dy * dy + dz * dz < r * r) return false;
    }
  }
  return true;
}
/* Its own generator, never the world's: the city must come out the same
   whether or not a course was ever built. */
function buildCourse(seed) {
  const rand = mulberry32(seed), rr = (a, b) => a + rand() * (b - a);
  const LIM = EXT - 60;
  const place = (x, z, from) => {
    if (Math.abs(x) > LIM || Math.abs(z) > LIM || x > SAND_X - 20) return null;
    const roof = roofNear(x, z, 70);
    if (roof < 22) return null;
    let y = clamp(roof * rr(0.35, 0.8), 12, 140);
    /* dropping is free, climbing is work: never ask for more than 30 m of it */
    if (from) y = Math.min(y, from.y + 30);
    if (!clearAt(x, y, z, RING_R + 1.5)) return null;   // the whole ring in open air
    return { x, y, z, ux: 0, uz: 1 };
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    const rings = [];
    let head = rr(0, TAU), g = null;
    for (let t = 0; t < 40 && !g; t++) g = place(rr(-LIM * 0.7, LIM * 0.6), rr(-LIM * 0.7, LIM * 0.7));
    while (g) {
      rings.push(g);
      if (rings.length === COURSE_RINGS) break;
      let nx = null;
      for (let t = 0; t < 60 && !nx; t++) {
        const a = head + rr(-1.2, 1.2), d = rr(130, 230);
        nx = place(g.x + Math.sin(a) * d, g.z + Math.cos(a) * d, g);
        if (nx) head = a;
      }
      g = nx;
    }
    if (rings.length < COURSE_RINGS) continue;
    /* each ring faces the way you leave it; the last faces the way you came */
    for (let i = 0; i < COURSE_RINGS; i++) {
      const a = rings[Math.min(i, COURSE_RINGS - 2)], b = rings[Math.min(i, COURSE_RINGS - 2) + 1];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      rings[i].ux = (b.x - a.x) / l; rings[i].uz = (b.z - a.z) / l;
    }
    return rings;
  }
  return null;
}
/* A fingerprint of where the rings actually are. A saved time is only a
   record on the course it was flown on, and the same seed gives a different
   course the moment the generator, its constants or the city change. */
function courseSig(rings) {
  let h = 2166136261;
  for (const r of rings) for (const v of [r.x, r.y, r.z]) h = Math.imul(h ^ Math.round(v * 10), 16777619);
  return (h >>> 0).toString(36);
}

/* ---- saved bests: { [course id]: { sig, time, splits, ghost } } ---- */
const runSaves = (() => {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(RUN_KEY)); } catch (e) {}
  if (!s || typeof s !== 'object' || Array.isArray(s)) return {};
  /* a daily course that is no longer on offer can never be flown again; its
     ghost only costs space. Judged against the courses this page loaded with,
     so a run that finishes after midnight still keeps its time. */
  for (const k of Object.keys(s)) if (k.startsWith('day-') && !COURSES.some(c => c.id === k)) delete s[k];
  return s;
})();
function writeSaves() { try { localStorage.setItem(RUN_KEY, JSON.stringify(runSaves)); } catch (e) {} }
/* the one place a save is trusted: anything stale or misshapen is no best at all */
function bestFor(course) {
  const s = runSaves[course.id];
  if (!s || s.sig !== course.sig || typeof s.time !== 'number' || !Array.isArray(s.splits) || s.splits.length !== COURSE_RINGS) return null;
  return { time: s.time, splits: s.splits, ghost: unpackGhost(s.ghost) };
}
/* ghost path: x, y, z in decimetres as int16, base64 */
function packGhost(a, n) {
  const b = new Uint8Array(new Int16Array(a.subarray(0, n)).buffer);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function unpackGhost(s) {
  try {
    if (typeof s !== 'string') throw 0;
    const raw = atob(s), b = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i);
    return new Int16Array(b.buffer);
  } catch (e) { return new Int16Array(0); }   // a best with no ghost is still a best
}

/* ---- what you see ---- */
const RING_GEO = new THREE.TorusGeometry(RING_R, 0.42, 6, 30);
const RING_C = cssToken('ring');   // one colour for the ring, its pointer and its dot on the map
const ringNow = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({ color: RING_C, fog: false, toneMapped: false }));
const ringAfter = new THREE.Mesh(RING_GEO,
  new THREE.MeshBasicMaterial({ color: RING_C, fog: false, toneMapped: false, transparent: true, opacity: 0.32, depthWrite: false }));
/* a shaft of light over the next ring, so it can be found from across the city */
const ringBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 420, 8, 1, true).translate(0, 210 + RING_R, 0),
  new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
const ghostMesh = new THREE.Mesh(
  new THREE.OctahedronGeometry(1, 0).scale(0.55, 1.05, 0.55),
  new THREE.MeshBasicMaterial({ color: 0x3ef0ff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
for (const m of [ringNow, ringAfter, ringBeam, ghostMesh]) { m.visible = false; m.frustumCulled = false; scene.add(m); }

const runEl = document.getElementById('run'), runArrow = document.getElementById('runarrow');
const runNm = runEl.querySelector('.nm'), runGt = runEl.querySelector('.gt');
const runTm = runEl.querySelector('.tm'), runDf = runEl.querySelector('.df');
const fmtRun = (t) => Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (Math.floor(t % 60 * 10) / 10).toFixed(1);
const fmtDiff = (d) => (d < 0 ? '−' : '+') + Math.abs(d).toFixed(1);

/* ---- state ---- */
const run = {
  state: 'off',            // off · armed (waiting at ring one) · live · done
  ci: 0,                   // which of COURSES
  rings: null, next: 0,    // the course being flown, and the ring you are after
  t: 0, splits: [],        // the clock, and its reading at each ring
  dPrev: Infinity,         // distance to the next ring a frame ago
  best: null,              // { time, splits, ghost } to beat, or null
  rec: new Int16Array(GHOST_MAX * 3), recN: 0
};
const flying = () => run.state === 'armed' || run.state === 'live';
/* seconds against your best: at the last ring passed while flying, overall once done */
function runDelta() {
  if (!run.best) return null;
  if (run.state === 'done') return run.t - run.best.time;
  if (run.state === 'live' && run.next > 1) return run.splits[run.next - 1] - run.best.splits[run.next - 1];
  return null;
}
/* Everything on screen follows from the run's state, and this is the only
   place that says how. Call it after changing the state or the next ring;
   nothing else shows, hides or labels a thing. (The ghost and the arrow also
   move every frame while flying: see updateRun.) */
function syncRunView() {
  const shown = run.state !== 'off';
  const a = flying() ? run.rings[run.next] : null, b = flying() ? run.rings[run.next + 1] : null;
  for (const [mesh, ring] of [[ringNow, a], [ringAfter, b], [ringBeam, a]]) {
    mesh.visible = !!ring;
    if (ring) { mesh.position.set(ring.x, ring.y, ring.z); mesh.rotation.y = Math.atan2(ring.ux, ring.uz); }
  }
  if (run.state !== 'live') ghostMesh.visible = false;
  if (!flying()) runArrow.classList.remove('on');
  runEl.classList.toggle('on', shown);
  runEl.classList.toggle('done', run.state === 'done');
  document.body.classList.toggle('run', shown);
  if (!shown) return;
  const d = runDelta();
  runNm.textContent = COURSES[run.ci].name;
  runGt.textContent = run.next + '/' + COURSE_RINGS;
  runTm.textContent = run.state === 'armed' ? 'Fly through the ring' : fmtRun(run.t);
  runDf.textContent = d === null ? '' : fmtDiff(d);
  runDf.classList.toggle('up', d !== null && d < 0);
}
/* put the player on the approach: back along the line the course leaves ring
   one on, as far as there is clear air, a little above it and already moving */
function toApproach(ring) {
  const l = Math.hypot(1, 0.25), bx = -ring.ux / l, by = 0.25 / l, bz = -ring.uz / l;
  const hit = rayHit(ring.x, ring.y, ring.z, bx, by, bz, 70);
  const d = hit ? Math.max(4, hit.t - 5) : 70;
  respawn();
  player.p.set(ring.x + bx * d, ring.y + by * d, ring.z + bz * d);
  player.v.set(ring.ux * 20, 0, ring.uz * 20);
  held[0] = held[1] = false;
  yaw = Math.atan2(-ring.ux, ring.uz); pitch = -0.1;
}
function armRun() {
  const c = COURSES[run.ci];
  if (!c.rings) {
    c.rings = buildCourse(c.seed);
    if (!c.rings) { toast('No course for that seed'); return; }
    c.sig = courseSig(c.rings);
  }
  run.state = 'armed'; run.rings = c.rings; run.next = 0;
  run.t = 0; run.splits.length = 0; run.dPrev = Infinity; run.recN = 0;
  run.best = bestFor(c);
  toApproach(c.rings[0]);
  syncRunView();
  toast(c.name + ' · ' + COURSE_RINGS + ' rings · ' + (run.best ? 'best ' + fmtRun(run.best.time) : 'no time yet'));
}
function quitRun() { run.state = 'off'; syncRunView(); }
function nextCourse() { run.ci = (run.ci + 1) % COURSES.length; armRun(); }
function ringChime(last) {
  if (!AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(last ? 990 : 660, t);
  o.frequency.exponentialRampToValueAtTime(last ? 1480 : 990, t + 0.09);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (last ? 0.7 : 0.32));
  o.connect(g); g.connect(master); o.start(t); o.stop(t + (last ? 0.75 : 0.36));
}
function finishRun() {
  const c = COURSES[run.ci], old = run.best;
  run.state = 'done';
  if (!old || run.t < old.time) {
    runSaves[c.id] = { sig: c.sig, time: run.t, splits: run.splits.map(v => +v.toFixed(2)), ghost: packGhost(run.rec, run.recN * 3) };
    writeSaves();
    toast(fmtRun(run.t) + (old ? ' · new best by ' + (old.time - run.t).toFixed(1) + ' s' : ' · first time set'));
  } else {
    toast(fmtRun(run.t) + ' · ' + fmtDiff(run.t - old.time) + ' on your best');
  }
  syncRunView();   // run.best is still the time you were chasing, so the readout shows the margin
}

/* ---- one frame of a run, in four steps ---- */
/* the ghost is sampled on simulation time, so it replays at any frame rate */
function recordGhost() {
  while (run.recN < GHOST_MAX && run.recN <= run.t * GHOST_HZ) {
    const o = run.recN++ * 3;
    run.rec[o] = Math.round(player.p.x * 10); run.rec[o + 1] = Math.round(player.p.y * 10); run.rec[o + 2] = Math.round(player.p.z * 10);
  }
}
function flyGhost(path) {
  const f = run.t * GHOST_HZ, i = Math.floor(f), a = i * 3, k = f - i;
  ghostMesh.visible = a + 5 < path.length;
  if (!ghostMesh.visible) return;
  ghostMesh.position.set(lerp(path[a], path[a + 3], k) / 10, lerp(path[a + 1], path[a + 4], k) / 10 + 0.4, lerp(path[a + 2], path[a + 5], k) / 10);
  ghostMesh.rotation.y = run.t * 2.2;
}
/* Has the next ring been passed? Returns how long ago within this frame, or
   -1. A frame only ever sees you already inside, so the crossing is placed by
   how far in you are against how far you came. (On the first frame dPrev is
   infinite and that fraction is zero, which is right: there is no before.) */
function ringCrossed(dt) {
  const r = run.rings[run.next], was = run.dPrev;
  const d = Math.hypot(player.p.x - r.x, player.p.y - r.y, player.p.z - r.z);
  if (d >= PASS_R) { run.dPrev = d; return -1; }
  run.dPrev = Infinity;
  return dt * clamp((PASS_R - d) / (was - d), 0, 1);
}
function passRing(late) {
  if (run.next === 0) { run.state = 'live'; run.t = late; }
  const at = run.t - late;            // what the clock read at the crossing itself
  run.splits[run.next++] = at;
  ringChime(run.next === COURSE_RINGS);
  if (run.next === COURSE_RINGS) { run.t = at; finishRun(); } else syncRunView();
}
/* a pointer at the screen edge when the next ring is not in view */
function pointAtRing(r) {
  _d.set(r.x, r.y, r.z).sub(camera.position);
  const sx = _d.dot(camRight), sy = _d.dot(camUp), sz = _d.dot(camFwd);
  const off = sz < 0 || Math.abs(sx) > sz * 0.62 || Math.abs(sy) > sz * 0.4;
  if (runArrow.classList.contains('on') !== off) runArrow.classList.toggle('on', off);
  if (off) runArrow.style.transform = 'rotate(' + Math.atan2(sx, sy).toFixed(3) + 'rad) translateY(-118px)';
}
/* called once a frame, after physics, while the simulation is running */
function updateRun(dt) {
  if (!flying()) return;
  if (run.state === 'live') {
    run.t += dt;
    recordGhost();
    if (run.best) flyGhost(run.best.ghost);
    const clock = fmtRun(run.t);      // tenths: the text changes ten times a second, not every frame
    if (runTm.textContent !== clock) runTm.textContent = clock;
  }
  const late = ringCrossed(dt);
  if (late >= 0) passRing(late);
  if (flying()) pointAtRing(run.rings[run.next]);
}
/* rings still to fly, on the minimap (called inside its scaled transform) */
function drawRunOnMap(c, f) {
  if (!flying()) return;
  for (let i = COURSE_RINGS - 1; i >= run.next; i--) {
    const r = run.rings[i], first = i === run.next;
    c.fillStyle = RING_C; c.globalAlpha = first ? 1 : 0.4;
    c.beginPath(); c.arc((r.x - player.p.x) * f, (r.z - player.p.z) * f, first ? 3.2 : 1.8, 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}

addEventListener('keydown', e => {
  if (e.repeat || !started || paused || photoMode) return;
  if (e.code === 'KeyG') armRun();
  if (e.code === 'KeyN') nextCourse();
  if (e.code === 'KeyX') quitRun();
});
bindHold('tRun', armRun, () => {});
bindHold('tRunNext', nextCourse, () => {});
bindHold('tRunQuit', quitRun, () => {});
