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
  beds.rail    = makeBed('lowpass',  150, 2.2, noiseBuf);   // steel on steel, heard through a viaduct
  beds.rain    = makeBed('bandpass', 2400, 0.45, noiseBuf); // a squall going over (88-weather.js)
  /* the engine also needs a pitched core, not just filtered noise */
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 58;
  const of = AC.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 320;
  const og = AC.createGain(); og.gain.value = 0;
  o.connect(of); of.connect(og); og.connect(ambBus); o.start();
  beds.engineTone = { g: og, o, cur: 0 };
  initMotion();
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
/* How much of the street reaches you, 0..1 and a little over. Everything on
   the ground thins out as you climb, unless you have stopped to listen
   (91-perch.js): then most of it comes back up to you. */
function ambAlt(y) {
  const alt = clamp(1 - (y - 22) / 230, 0, 1);
  return (alt + (1 - alt) * 0.55 * perchK) * (1 + 0.5 * perchK);
}
let tBell = 6, tGull = 3;
function updateAudio(dt) {
  if (!AC || !ambBus) return;
  const p = player.p;
  const alt = ambAlt(p.y);
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
  let rail = 0;                                   // and the train, which is not a jet
  for (const pl of planes) {
    if (pl.kind !== 'plane' && pl.kind !== 'train') continue;
    const d = Math.hypot(p.x - pl.p.x, p.y - pl.p.y, p.z - pl.p.z);
    if (pl.train) rail = clamp(1 - d / 110, 0, 1) * clamp(pl.v.length() / 12, 0.15, 1);
    else if (pl.kind === 'plane') eng = Math.max(eng, clamp(1 - d / 150, 0, 1));
  }
  if (player.riding) { if (player.riding.train) rail = Math.max(rail, 0.8); else if (player.riding.kind === 'plane') eng = 1; }

  const wob = 0.82 + 0.18 * Math.sin(T * 0.31) + 0.06 * Math.sin(T * 0.83);
  const tgt = {
    surf: surfN * alt * 0.30 * wob,
    traffic: trafficN * alt * 0.20 * (1 - night * 0.55),
    bazaar: bazaarN * alt * 0.085 * (1 - night * 0.75),
    night: night * alt * 0.030 * (0.7 + 0.3 * Math.sin(T * 1.7)),
    engine: eng * 0.16,
    rail: rail * rail * 0.26,
    engineTone: eng * eng * 0.055,
    rain: rainHere * 0.34
  };
  const k = 1 - Math.exp(-2.2 * dt);
  for (const name in tgt) {
    const b = beds[name]; if (!b) continue;
    b.cur += (tgt[name] - b.cur) * k;
    b.g.gain.value = b.cur;
  }
  if (beds.engineTone && beds.engineTone.o)
    beds.engineTone.o.frequency.value = 52 + eng * 14;
  updateMotionAudio(dt);

  /* one-shots, scheduled by where you are */
  tBell -= dt; tGull -= dt;
  if (tBell <= 0) {
    tBell = 11 + Math.random() * 26;
    if (templeN > 0.25 && alt > 0.12) bell(0.05 + 0.16 * templeN * alt);
  }
  if (tGull <= 0) {
    tGull = 2.5 + Math.random() * 7;
    if (surfN > 0.45 && night < 0.5) gull(0.5 + 0.5 * surfN);
  }
}

/* thunder: a long low roll that arrives a beat after the flash */
listen('thunder', thunder);
function thunder(vol) {
  if (!AC) return;
  const t = AC.currentTime + 0.4 + Math.random() * 1.6;
  const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 140; f.Q.value = 0.8;
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.18 * vol, t + 1.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 3.7);
}

/* water impact: a broadband slap that darkens fast, then a short hiss of foam */
function splashSound(vol) {
  if (!AC) return;
  const t = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass';
  f.frequency.setValueAtTime(1900, t);
  f.frequency.exponentialRampToValueAtTime(280, t + 0.34);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.42 * vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 0.56);
}

listen('attach', thwip);
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


/* ---------------------------------------------------------------
   MOTION — what the body and the line sound like. The city had a
   voice and the swing had none: a thwip, then wind. All of it is
   driven by numbers the simulation already has (line tension, the
   speed of a landing, how close a wall is going by), so the sound
   cannot disagree with what the physics is doing.
   --------------------------------------------------------------- */
const lineV = { o1: null, o2: null, lfo: null, g: null, strain: null, lvl: 0, f: 92 };
const passV = { g: null, f: null, pan: null, lvl: 0 };
function initMotion() {
  /* the line: a string under load. Two partials an octave apart so the note
     survives small speakers, and a slow waver so it creaks instead of beeping. */
  const g = AC.createGain(); g.gain.value = 0;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 620; f.Q.value = 0.7;
  const o1 = AC.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 92;
  const o2 = AC.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 184;
  const g2 = AC.createGain(); g2.gain.value = 0.22;
  const lfo = AC.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6.3;
  const lg = AC.createGain(); lg.gain.value = 1.4;
  lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
  o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(ambBus);
  o1.start(); o2.start(); lfo.start();
  lineV.o1 = o1; lineV.o2 = o2; lineV.lfo = lfo; lineV.g = g;
  lineV.strain = makeBed('bandpass', 1500, 2.6, noiseBuf);
  /* air squeezed between you and whatever you are passing */
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  passV.f = AC.createBiquadFilter(); passV.f.type = 'bandpass'; passV.f.frequency.value = 800; passV.f.Q.value = 0.9;
  passV.g = AC.createGain(); passV.g.gain.value = 0;
  src.connect(passV.f); passV.f.connect(passV.g);
  if (AC.createStereoPanner) { passV.pan = AC.createStereoPanner(); passV.g.connect(passV.pan); passV.pan.connect(ambBus); }
  else passV.g.connect(ambBus);
  src.start();
}

/* How close the world is going by, 0..1, and on which side. Three short rays
   (either side of the direction of travel, and overhead) plus the street
   itself, which is a plane and not a box. Nothing here needs the audio
   context, so it can be measured without one. */
const PASS_REACH = 11;
const near = { l: 0, r: 0, up: 0, lvl: 0, pan: 0 };
function proximity(p, v) {
  const spd = v.length(), vh = Math.hypot(v.x, v.z);
  near.l = near.r = near.up = near.lvl = near.pan = 0;
  if (spd < 12 || player.riding || player.inWater) return near;
  /* straight up or down there is no "beside": fall back to the camera's */
  const sx = vh > 2 ? -v.z / vh : camRight.x, sz = vh > 2 ? v.x / vh : camRight.z;
  let h = rayHit(p.x, p.y, p.z, sx, 0, sz, PASS_REACH); if (h) near.l = 1 - h.t / PASS_REACH;
  h = rayHit(p.x, p.y, p.z, -sx, 0, -sz, PASS_REACH); if (h) near.r = 1 - h.t / PASS_REACH;
  h = rayHit(p.x, p.y, p.z, 0, 1, 0, PASS_REACH * 0.7); if (h) near.up = 1 - h.t / (PASS_REACH * 0.7);
  const low = player.grounded ? 0 : clamp(1 - (p.y - RAD) / 5, 0, 1);
  const n = Math.max(near.l, near.r, near.up, low);
  near.lvl = n * Math.sqrt(n) * sstep(12, 46, spd);
  near.pan = clamp((near.l - near.r) * (sx * camRight.x + sz * camRight.z), -1, 1);
  return near;
}

function updateMotionAudio(dt) {
  if (!lineV.g) return;
  const w0 = player.webs[0], w1 = player.webs[1];
  const w = w0.tension > w1.tension ? w0 : w1;
  const tn = clamp(w.tension / 9000, 0, 1);
  /* a string's pitch goes with the root of its tension and falls with its
     length: a long line groans, a short one winched tight sings */
  const want = 92 * Math.sqrt(Math.max(w.tension, 400) / 1800) * clamp(Math.sqrt(42 / Math.max(w.len, WEB_MIN)), 0.7, 1.7);
  lineV.f = damp(lineV.f, clamp(want, 60, 420), 9, dt);
  lineV.lvl = damp(lineV.lvl, w.on ? tn * Math.sqrt(tn) * 0.15 : 0, w.on ? 9 : 22, dt);
  lineV.o1.frequency.value = lineV.f; lineV.o2.frequency.value = lineV.f * 2.005;
  lineV.g.gain.value = lineV.lvl;
  const st = lineV.strain;
  st.cur = damp(st.cur, w.on ? tn * tn * 0.05 : 0, 10, dt);
  st.g.gain.value = st.cur; st.f.frequency.value = 900 + 1900 * tn;

  const n = proximity(player.p, player.v);
  /* arrives at once, leaves slowly: a wall going by is an event, not a hum */
  passV.lvl = damp(passV.lvl, n.lvl, n.lvl > passV.lvl ? 16 : 3.2, dt);
  passV.g.gain.value = passV.lvl * 0.30;
  passV.f.frequency.value = 480 + clamp(player.v.length() * 20, 0, 1500);
  if (passV.pan) passV.pan.pan.value = damp(passV.pan.pan.value, n.pan * 0.85, 10, dt);
}

/* a short burst of the shared noise through one filter; most one-shots are this */
function noiseHit(type, f0, f1, sweep, q, vol, attack, dur) {
  const t = AC.currentTime;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; if (q) f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  /* start somewhere new in the buffer each time, or every hit is the same hit */
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.04);
}

/* landing: the weight arriving (a falling sine) and the surface answering
   (noise, duller on a roof or the street than against a wall) */
listen('land', (hit, ny) => {
  if (!AC) return;
  const vol = clamp(hit / 26, 0.06, 1), t = AC.currentTime;
  const o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(118, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.17);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.27);
  const wall = ny < 0.6;
  noiseHit('lowpass', wall ? 1500 : 760, wall ? 380 : 170, 0.12, 0.7, 0.34 * vol, 0.006, 0.19);
});
listen('step', (amp) => {
  if (!AC) return;
  const f = 520 + Math.random() * 260;
  noiseHit('lowpass', f, f * 0.45, 0.05, 0.8, 0.07 * clamp(amp, 0.3, 1.1), 0.004, 0.075);
});
/* letting go at speed: the line whips away. A tap, or a release at a
   standstill, has nothing to whip. */
listen('release', (spd, age) => {
  if (!AC || spd < 14 || age < 0.3) return;
  const vol = clamp((spd - 14) / 38, 0.12, 1);
  noiseHit('bandpass', 620, 2100, 0.2, 1.3, 0.17 * vol, 0.03, 0.34);
});
/* the line taking a corner (81-wrap.js): a short dry knock as it comes to
   bear on the edge, a lighter one as it comes off */
listen('bend', (n, on) => {
  if (!AC) return;
  const f = on ? 1500 : 2300;
  noiseHit('bandpass', f, f * 0.55, 0.05, 5, on ? 0.13 : 0.06, 0.003, 0.08);
});
/* a flock going up: a second of wingbeats, which is noise chopped at the rate
   wings beat; gulls complain as well */
listen('flush', (sea) => {
  if (!AC) return;
  const t = AC.currentTime, dur = 1.5;
  const src = AC.createBufferSource(); src.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(sea ? 1500 : 2300, t); f.frequency.exponentialRampToValueAtTime(sea ? 900 : 1300, t + dur);
  const chop = AC.createGain(); chop.gain.value = 0.5;
  const lfo = AC.createOscillator(); lfo.type = 'sine';
  lfo.frequency.setValueAtTime(sea ? 9 : 15, t); lfo.frequency.linearRampToValueAtTime(sea ? 6 : 9, t + dur);
  const lg = AC.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(chop.gain);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(chop); chop.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
  if (sea) gull(0.8);
});
/* a web on a gopuram rings it. Not twice in a breath: two hands landing
   together are one strike. */
let bellQuiet = 0;
listen('bell', () => {
  if (!AC || AC.currentTime < bellQuiet) return;
  bellQuiet = AC.currentTime + 0.35;
  bell(0.26);
});
