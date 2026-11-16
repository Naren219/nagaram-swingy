/* =====================================================================
   RUNS — a course of rings through the city, flown against the clock
   G starts (or restarts) the selected course, N picks the next course,
   X leaves. The clock starts when you pass the first ring, so the approach
   is free. A course is nothing but a seed: today's date makes the daily
   one, and ?run=1234 in the address makes any other, so a course can be
   shared as a link. Your best time on each is kept with a ghost of the
   flight that set it.
   ===================================================================== */
const RUN_GATES = 12;      // rings in a course
const GATE_R = 11;         // metres from the centre that count as through
const RING_R = 9;          // drawn radius: a little inside what counts
const GHOST_HZ = 10, GHOST_MAX = 3000;   // five minutes of ghost at most
const RUN_KEY = 'nagaram.runs';

const runSeedToday = () => { const d = new Date(); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const COURSES = [
  { id: 'day-' + runSeedToday(), name: 'today', seed: runSeedToday() },
  { id: 'c1', name: 'course one', seed: 1101 },
  { id: 'c2', name: 'course two', seed: 2202 },
  { id: 'c3', name: 'course three', seed: 3303 }
];
{
  const m = /[?&]run=(\d{1,9})\b/.exec(location.search);
  if (m) COURSES.unshift({ id: 'seed-' + m[1], name: 'seed ' + m[1], seed: +m[1] });
}

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
    const gates = [];
    let head = rr(0, TAU), g = null;
    for (let t = 0; t < 40 && !g; t++) g = place(rr(-LIM * 0.7, LIM * 0.6), rr(-LIM * 0.7, LIM * 0.7));
    while (g) {
      gates.push(g);
      if (gates.length === RUN_GATES) break;
      let nx = null;
      for (let t = 0; t < 60 && !nx; t++) {
        const a = head + rr(-1.2, 1.2), d = rr(130, 230);
        nx = place(g.x + Math.sin(a) * d, g.z + Math.cos(a) * d, g);
        if (nx) head = a;
      }
      g = nx;
    }
    if (gates.length < RUN_GATES) continue;
    /* each ring faces the way you leave it; the last faces the way you came */
    for (let i = 0; i < RUN_GATES; i++) {
      const a = gates[Math.min(i, RUN_GATES - 2)], b = gates[Math.min(i, RUN_GATES - 2) + 1];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      gates[i].ux = (b.x - a.x) / l; gates[i].uz = (b.z - a.z) / l;
    }
    return gates;
  }
  return null;
}

/* ---- saved bests ---- */
let runSaves = {};
try { runSaves = JSON.parse(localStorage.getItem(RUN_KEY)) || {}; } catch (e) {}
function saveRuns() {
  /* yesterday's daily course can never be flown again; its ghost only costs space */
  for (const k of Object.keys(runSaves)) if (k.startsWith('day-') && k !== 'day-' + runSeedToday()) delete runSaves[k];
  try { localStorage.setItem(RUN_KEY, JSON.stringify(runSaves)); } catch (e) {}
}
/* ghost path: x, y, z in decimetres as int16, base64 */
function packGhost(a, n) {
  const b = new Uint8Array(new Int16Array(a.subarray(0, n)).buffer);
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function unpackGhost(s) {
  try {
    const raw = atob(s), b = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i);
    return new Int16Array(b.buffer);
  } catch (e) { return null; }
}

/* ---- what you see ---- */
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb52e, fog: false, toneMapped: false });
const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xffb52e, fog: false, toneMapped: false, transparent: true, opacity: 0.32, depthWrite: false });
const RING_GEO = new THREE.TorusGeometry(RING_R, 0.42, 6, 30);
const runRing = new THREE.Mesh(RING_GEO, ringMat), runRing2 = new THREE.Mesh(RING_GEO, ringMat2);
/* a shaft of light over the next ring, so it can be found from across the city */
const runBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 420, 8, 1, true).translate(0, 210, 0),
  new THREE.MeshBasicMaterial({ color: 0xffc85a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }));
const runGhost = new THREE.Mesh(
  new THREE.OctahedronGeometry(1, 0).scale(0.55, 1.05, 0.55),
  new THREE.MeshBasicMaterial({ color: 0x3ef0ff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
for (const m of [runRing, runRing2, runBeam, runGhost]) { m.visible = false; m.frustumCulled = false; scene.add(m); }

const runEl = document.getElementById('run'), runArrow = document.getElementById('garrow');
const runNm = runEl.querySelector('.nm'), runGt = runEl.querySelector('.gt');
const runTm = runEl.querySelector('.tm'), runDf = runEl.querySelector('.df');
const fmtRun = (t) => Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (Math.floor(t % 60 * 10) / 10).toFixed(1);
const fmtDiff = (d) => (d < 0 ? '−' : '+') + Math.abs(d).toFixed(1);

/* ---- state ---- */
const ringRun = {
  state: 'off',            // off · armed (waiting at ring one) · live · done
  ci: 0, gates: null, next: 0, t: 0, dPrev: 1e9,
  splits: [], best: null, ghost: null,
  rec: new Int16Array(GHOST_MAX * 3), recN: 0, hudT: 0
};
function placeRings() {
  const on = ringRun.state === 'armed' || ringRun.state === 'live';
  const a = on ? ringRun.gates[ringRun.next] : null, b = on ? ringRun.gates[ringRun.next + 1] : null;
  runRing.visible = runBeam.visible = !!a;
  runRing2.visible = !!b;
  if (a) { runRing.position.set(a.x, a.y, a.z); runRing.rotation.y = Math.atan2(a.ux, a.uz); runBeam.position.set(a.x, a.y + RING_R, a.z); }
  if (b) { runRing2.position.set(b.x, b.y, b.z); runRing2.rotation.y = Math.atan2(b.ux, b.uz); }
}
function armRun() {
  const c = COURSES[ringRun.ci];
  if (!c.gates) c.gates = buildCourse(c.seed);
  if (!c.gates) { toast('no course for that seed'); return; }
  ringRun.gates = c.gates; ringRun.state = 'armed'; ringRun.next = 0; ringRun.t = 0; ringRun.dPrev = 1e9; ringRun.recN = 0;
  ringRun.splits.length = 0;
  const s = runSaves[c.id];
  ringRun.best = s && typeof s.t === 'number' ? s : null;
  ringRun.ghost = ringRun.best && ringRun.best.g ? unpackGhost(ringRun.best.g) : null;
  runGhost.visible = false;
  /* the approach: back along the line the course leaves ring one on, as far
     as there is clear air, a little above it and already moving */
  const g = ringRun.gates[0], l = Math.hypot(1, 0.25);
  const hit = rayHit(g.x, g.y, g.z, -g.ux / l, 0.25 / l, -g.uz / l, 70);
  const d = hit ? Math.max(4, hit.t - 5) : 70;
  respawn();
  player.p.set(g.x - g.ux / l * d, g.y + 0.25 / l * d, g.z - g.uz / l * d);
  player.v.set(g.ux * 20, 0, g.uz * 20);
  held[0] = held[1] = false;
  yaw = Math.atan2(-g.ux, g.uz); pitch = -0.1;
  placeRings();
  runEl.classList.add('on'); runEl.classList.remove('done');
  document.body.classList.add('run');
  runNm.textContent = c.name;
  toast(c.name + ' · ' + RUN_GATES + ' rings · ' + (ringRun.best ? 'best ' + fmtRun(ringRun.best.t) : 'no time yet'));
  drawRunHud(true);
}
function quitRun() {
  if (ringRun.state === 'off') return;
  ringRun.state = 'off'; placeRings(); runGhost.visible = false;
  runEl.classList.remove('on'); runArrow.classList.remove('on');
  document.body.classList.remove('run');
}
function nextCourse() {
  ringRun.ci = (ringRun.ci + 1) % COURSES.length;
  armRun();
}
function gateChime(last) {
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
  const c = COURSES[ringRun.ci], t = ringRun.t, old = ringRun.best;
  ringRun.state = 'done'; placeRings(); runGhost.visible = false; runArrow.classList.remove('on');
  runEl.classList.add('done');
  if (!old || t < old.t) {
    runSaves[c.id] = { t, s: ringRun.splits.map(v => +v.toFixed(2)), g: packGhost(ringRun.rec, ringRun.recN * 3) };
    saveRuns();
    toast(fmtRun(t) + (old ? ' · new best by ' + (old.t - t).toFixed(1) + ' s' : ' · first time set'));
  } else {
    toast(fmtRun(t) + ' · ' + fmtDiff(t - old.t) + ' on your best');
  }
  drawRunHud(true);
}
function drawRunHud(force) {
  ringRun.hudT -= 1; if (!force && ringRun.hudT > 0) return; ringRun.hudT = 4;   // every fourth frame is plenty
  runGt.textContent = Math.min(ringRun.next, RUN_GATES) + '/' + RUN_GATES;
  runTm.textContent = ringRun.state === 'armed' ? 'fly through the ring' : fmtRun(ringRun.t);
  /* against your best: at the last ring passed while flying, overall once done */
  let d = null;
  if (ringRun.best) {
    if (ringRun.state === 'done') d = ringRun.t - ringRun.best.t;
    else if (ringRun.state === 'live' && ringRun.next > 1 && ringRun.best.s) d = ringRun.splits[ringRun.next - 1] - ringRun.best.s[ringRun.next - 1];
  }
  runDf.textContent = d === null || !isFinite(d) ? '' : fmtDiff(d);
  runDf.classList.toggle('up', d !== null && d < 0);
}
/* called once a frame, after physics, while the simulation is running */
function updateRun(dt) {
  if (ringRun.state !== 'armed' && ringRun.state !== 'live') return;
  if (ringRun.state === 'live') {
    ringRun.t += dt;
    /* the ghost is sampled on simulation time, so it replays at any frame rate */
    while (ringRun.recN < GHOST_MAX && ringRun.recN <= ringRun.t * GHOST_HZ) {
      const o = ringRun.recN++ * 3;
      ringRun.rec[o] = Math.round(player.p.x * 10); ringRun.rec[o + 1] = Math.round(player.p.y * 10); ringRun.rec[o + 2] = Math.round(player.p.z * 10);
    }
    if (ringRun.ghost) {
      const f = ringRun.t * GHOST_HZ, i = Math.floor(f), n = ringRun.ghost.length / 3;
      runGhost.visible = i + 1 < n;
      if (runGhost.visible) {
        const a = i * 3, k = f - i, G = ringRun.ghost;
        runGhost.position.set(lerp(G[a], G[a + 3], k) / 10, lerp(G[a + 1], G[a + 4], k) / 10 + 0.4, lerp(G[a + 2], G[a + 5], k) / 10);
        runGhost.rotation.y = ringRun.t * 2.2;
      }
    }
  }
  const g = ringRun.gates[ringRun.next];
  const d = Math.hypot(player.p.x - g.x, player.p.y - g.y, player.p.z - g.z);
  if (d < GATE_R) {
    /* the frame saw you already inside: back the clock up to the crossing */
    const late = ringRun.dPrev > d && ringRun.dPrev < 1e8 ? dt * clamp((GATE_R - d) / (ringRun.dPrev - d), 0, 1) : 0;
    if (ringRun.next === 0) { ringRun.state = 'live'; ringRun.t = late; ringRun.recN = 0; }
    ringRun.splits[ringRun.next] = ringRun.t - late;
    ringRun.next++; ringRun.dPrev = 1e9;
    gateChime(ringRun.next === RUN_GATES);
    if (ringRun.next === RUN_GATES) { ringRun.t -= late; finishRun(); return; }
    placeRings(); drawRunHud(true);
  } else ringRun.dPrev = d;
  /* a pointer at the screen edge when the next ring is not in view */
  const n = ringRun.gates[ringRun.next];
  _d.set(n.x, n.y, n.z).sub(camera.position);
  const sx = _d.dot(camRight), sy = _d.dot(camUp), sz = _d.dot(camFwd);
  const off = sz < 0 || Math.abs(sx) > sz * 0.62 || Math.abs(sy) > sz * 0.4;
  if (runArrow.classList.contains('on') !== off) runArrow.classList.toggle('on', off);
  if (off) runArrow.style.transform = 'rotate(' + Math.atan2(sx, sy).toFixed(3) + 'rad) translateY(-118px)';
  drawRunHud(false);
}
/* rings still to fly, on the minimap (called inside its scaled transform) */
function drawRunOnMap(c, f) {
  if (ringRun.state !== 'armed' && ringRun.state !== 'live') return;
  for (let i = RUN_GATES - 1; i >= ringRun.next; i--) {
    const g = ringRun.gates[i], first = i === ringRun.next;
    c.fillStyle = first ? '#ffb52e' : 'rgba(255,181,46,.4)';
    c.beginPath(); c.arc((g.x - player.p.x) * f, (g.z - player.p.z) * f, first ? 3.2 : 1.8, 0, TAU); c.fill();
  }
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
