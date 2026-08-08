/* ---- audio ---- */
let AC = null, master = null, windGain = null, windFilt = null, noiseBuf = null;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AC = new Ctx();
  master = AC.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(AC.destination);
  const n = AC.sampleRate * 2;
  noiseBuf = AC.createBuffer(1, n, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  windFilt = AC.createBiquadFilter(); windFilt.type = 'lowpass'; windFilt.frequency.value = 260;
  windGain = AC.createGain(); windGain.gain.value = 0;
  src.connect(windFilt); windFilt.connect(windGain); windGain.connect(master); src.start();
  initAmbience();
}
/* ---------------------------------------------------------------
   AMBIENCE — everything below is synthesised, no samples. Beds are
   looping noise through a filter whose gain is driven by where you
   are; one-shots are short oscillator envelopes scheduled on timers.
   --------------------------------------------------------------- */
let ambBus = null;
const beds = {};
function makeBed(type, freq, q, srcBuf) {
  const src = AC.createBufferSource(); src.buffer = srcBuf; src.loop = true;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  if (q) f.Q.value = q;
  const g = AC.createGain(); g.gain.value = 0;
  src.connect(f); f.connect(g); g.connect(ambBus); src.start();
  return { g, f, cur: 0 };
}
function initAmbience() {
  ambBus = AC.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
  beds.surf    = makeBed('lowpass',  520, 0.7, noiseBuf);   // breaking water
  beds.traffic = makeBed('lowpass',  190, 0.9, noiseBuf);   // road rumble
  beds.bazaar  = makeBed('bandpass', 720, 0.6, noiseBuf);   // crowd murmur
  beds.night   = makeBed('bandpass', 5200, 9, noiseBuf);    // insects
  beds.engine  = makeBed('lowpass',  240, 1.2, noiseBuf);   // turbofan hiss
  /* the engine also needs a pitched core, not just filtered noise */
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
  const of = AC.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 320;
  const og = AC.createGain(); og.gain.value = 0;
  o.connect(of); of.connect(og); og.connect(ambBus); o.start();
  beds.engineTone = { g: og, o, cur: 0 };
}
/* struck bell: inharmonic partials, each with its own decay */
function bell(vol) {
  if (!AC) return;
  const t = AC.currentTime, base = 214 * (0.94 + Math.random() * 0.12);
  const parts = [[0.5, 0.5, 5.2], [1, 1, 4.0], [1.19, 0.5, 2.6], [1.51, 0.34, 1.9], [2.02, 0.26, 1.4]];
  for (const [r, a, dec] of parts) {
    const o = AC.createOscillator(); o.type = 'sine';
    o.frequency.value = base * r;
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(a * vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dec + 0.05);
  }
}
function gull(vol) {
  if (!AC) return;
  const t = AC.currentTime;
  for (let k = 0; k < 2 + ((Math.random() * 2) | 0); k++) {
    const st = t + k * (0.17 + Math.random() * 0.09);
    const o = AC.createOscillator(); o.type = 'sawtooth';
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    const g = AC.createGain();
    const hi = 1500 + Math.random() * 500;
    o.frequency.setValueAtTime(hi, st);
    o.frequency.exponentialRampToValueAtTime(hi * 0.45, st + 0.14);
    f.frequency.setValueAtTime(hi * 1.2, st);
    f.frequency.exponentialRampToValueAtTime(hi * 0.6, st + 0.14);
    g.gain.setValueAtTime(0.0001, st);
    g.gain.exponentialRampToValueAtTime(0.13 * vol, st + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, st + 0.15);
    o.connect(f); f.connect(g); g.connect(master); o.start(st); o.stop(st + 0.18);
  }
}
/* auto-rickshaw horn — squared tone with a fast wobble */
function honk(vol) {
  if (!AC) return;
  const t = AC.currentTime, dur = 0.18 + Math.random() * 0.22;
  const o = AC.createOscillator(); o.type = 'square';
  const base = 380 + Math.random() * 190;
  o.frequency.setValueAtTime(base, t);
  const lfo = AC.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7;
  const lg = AC.createGain(); lg.gain.value = base * 0.03;
  lfo.connect(lg); lg.connect(o.frequency);
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.02);
  g.gain.setValueAtTime(0.09 * vol, t + dur - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
}

let tBell = 6, tGull = 3, tHonk = 2;
function updateAudio(dt) {
  if (!AC || !ambBus) return;
  const p = player.p;
  /* everything on the ground thins out as you climb */
  const alt = clamp(1 - (p.y - 22) / 230, 0, 1);
  const dSea = p.x - SAND_X;                       // positive once over sand
  const surfN = clamp(1 - Math.abs(dSea) / 300, 0, 1);
  const dCore = Math.hypot(p.x, p.z);
  const templeN = clamp(1 - dCore / 260, 0, 1);
  const bazaarN = clamp(1 - Math.abs(dCore - 215) / 230, 0, 1) * clamp(1 - dSea / 120, 0, 1);
  /* the temple precinct is a walled plaza, not a road hub — traffic has to dip
     inside it, or the quietest place on the map is the loudest */
  const trafficN = clamp(1 - dCore / 620, 0, 1) * clamp((dCore - 95) / 95, 0, 1)
                 * clamp(1 - dSea / 90, 0, 1);
  const night = curNight;

  /* nearest aircraft, for engine noise and for riding */
  let eng = 0;
  for (const pl of planes) {
    const d = Math.hypot(p.x - pl.p.x, p.y - pl.p.y, p.z - pl.p.z);
    eng = Math.max(eng, clamp(1 - d / 150, 0, 1));
  }
  if (player.riding) eng = 1;

  const wob = 0.82 + 0.18 * Math.sin(T * 0.31) + 0.06 * Math.sin(T * 0.83);
  const tgt = {
    surf: surfN * alt * 0.30 * wob,
    traffic: trafficN * alt * 0.20 * (1 - night * 0.55),
    bazaar: bazaarN * alt * 0.085 * (1 - night * 0.75),
    night: night * alt * 0.030 * (0.7 + 0.3 * Math.sin(T * 1.7)),
    engine: eng * 0.16,
    engineTone: eng * eng * 0.055
  };
  const k = 1 - Math.exp(-2.2 * dt);
  for (const name in tgt) {
    const b = beds[name]; if (!b) continue;
    b.cur += (tgt[name] - b.cur) * k;
    b.g.gain.value = b.cur;
  }
  if (beds.engineTone && beds.engineTone.o)
    beds.engineTone.o.frequency.value = 52 + eng * 14;

  /* one-shots, scheduled by where you are */
  tBell -= dt; tGull -= dt; tHonk -= dt;
  if (tBell <= 0) {
    tBell = 11 + Math.random() * 26;
    if (templeN > 0.25 && alt > 0.12) bell(0.05 + 0.16 * templeN * alt);
  }
  if (tGull <= 0) {
    tGull = 2.5 + Math.random() * 7;
    if (surfN > 0.45 && night < 0.5) gull(0.5 + 0.5 * surfN);
  }
  if (tHonk <= 0) {
    tHonk = 1.4 + Math.random() * 5.5;
    if (trafficN > 0.35 && alt > 0.35) honk((0.4 + 0.6 * trafficN) * alt * (1 - night * 0.6));
  }
}

function thwip() {
  if (!AC) return;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 5;
  const g = AC.createGain();
  const t = AC.currentTime;
  f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(520, t + 0.16);
  g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.22);
}

