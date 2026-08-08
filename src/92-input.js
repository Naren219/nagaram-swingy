/* =====================================================================
   INPUT · AUDIO · HUD
   ===================================================================== */
const keys = Object.create(null);
let jumpEdge = false, mountEdge = false, muted = false, shadowsOn = true, freeLook = false;
const locked = () => document.pointerLockElement === renderer.domElement || freeLook;
const gate = document.getElementById('gate');
const pbtn = document.getElementById('pbtn'), pauseEl = document.getElementById('pause');
let paused = false, started = false;
function setPaused(on) {
  if (paused === on) return;
  paused = on;
  pauseEl.classList.toggle('on', on);
  pbtn.classList.toggle('on', on);
  held[0] = held[1] = false;
  for (const k of Object.keys(keys)) delete keys[k];
  if (windGain) windGain.gain.value = on ? 0 : windGain.gain.value;
  if (ambBus) ambBus.gain.value = on ? 0 : 1;
  if (!on && !freeLook && !touchOn) {
    /* Browsers refuse a lock request for about a second after Esc. If it never
       lands, drop into cursor steering rather than leaving the player with no
       look control at all. */
    resumeWait = 0.7;
    try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  }
}
let resumeWait = 0;
addEventListener('pointerlockerror', () => { if (started && !paused) { resumeWait = 0; setFreeLook(true); } });
pbtn.addEventListener('click', (e) => { e.stopPropagation(); setPaused(!paused); });
pauseEl.addEventListener('click', () => setPaused(false));
/* Esc leaves pointer lock before any keydown reaches us, so pause off the
   lock state rather than the key. Losing the lock pauses; regaining it resumes. */
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (locked) { setFreeLook(false); resumeWait = 0; setPaused(false); }
  /* the gate is a first-run screen — once you've started it must never come
     back, or it covers the pause overlay and swallows the click that resumes */
  gate.classList.toggle('gone', started || locked || freeLook);
  if (!started || freeLook) return;
  if (!locked) setPaused(true);
});
const cross = document.getElementById('cross');
addEventListener('contextmenu', e => e.preventDefault());
gate.addEventListener('click', () => {
  started = true;
  initAudio();
  if (touchOn) {
    /* go fullscreen and hold landscape where the platform allows it; where it
       doesn't (iPhone Safari), the rotate overlay carries the message */
    try {
      const de = document.documentElement;
      const lock = () => {
        try {
          const l = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
          if (l && l.catch) l.catch(() => {});
        } catch (e2) {}
      };
      const fs = de.requestFullscreen ? de.requestFullscreen({ navigationUI: 'hide' }) : null;
      if (fs && fs.then) fs.then(lock, lock); else lock();
    } catch (err) {}
    gate.classList.add('gone');
    toast('left: move · drag: look · hold web to swing');
    toastT = 4.5;
    return;                              // no pointer lock on touch
  }
  try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* no lock */ }
  /* some embeds disallow pointer lock — fall back to plain mouse-delta look */
  setTimeout(() => {
    if (document.pointerLockElement !== renderer.domElement) {
      setFreeLook(true);
      gate.classList.add('gone');
    }
  }, 450);
});

const toastEl = document.getElementById('toast');
let toastT = 0;
function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('on'); toastT = 1.6; }
function setFreeLook(on) {
  if (on && touchOn) return;   // drag-look serves touch; the cursor ring would fight it
  freeLook = on;
  lookEl.classList.toggle('on', on);
  document.body.classList.toggle('freelook', on);
  if (on) toast('steer with cursor · [ ] sensitivity');
}
const lookEl = document.getElementById('look');
const lookDot = lookEl.querySelector('.dot'), lookVec = lookEl.querySelector('.vec');
addEventListener('mousemove', e => {
  /* absolute position drives the fallback steering model */
  const w = innerWidth, h = innerHeight;
  ptrX = clamp((e.clientX / w) * 2 - 1, -1, 1);
  ptrY = clamp((e.clientY / h) * 2 - 1, -1, 1);
  ptrSeen = true;
  if (freeLook) {
    lookDot.style.left = e.clientX + 'px'; lookDot.style.top = e.clientY + 'px';
    const dx = e.clientX - w / 2, dy = e.clientY - h / 2;
    lookVec.style.width = Math.hypot(dx, dy) + 'px';
    lookVec.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
    return;
  }
  if (!locked()) return;
  yaw += e.movementX * sens;
  pitch = clamp(pitch - e.movementY * sens, -PITCH_MAX, PITCH_MAX);
});

/* When the page can't grant pointer lock (most embedded frames), raw mouse
   deltas stop the moment the cursor reaches a window edge — which is why the
   view would only turn so far. Fall back to a rate model: distance from the
   centre sets turn SPEED, so the cursor stays bounded and the view doesn't. */
const LOOK_DEAD = 0.10, LOOK_RATE = 3.2;
let rateX = 0, rateY = 0;
function freeLookStep(dt) {
  if (!freeLook || !ptrSeen) { rateX = rateY = 0; return; }
  const curve = (v) => {
    const a = Math.abs(v);
    if (a < LOOK_DEAD) return 0;
    const t = (a - LOOK_DEAD) / (1 - LOOK_DEAD);
    /* mostly linear near the centre for fine aim, cubic out at the edge for
       fast scanning — the old pure-square curve was twitchy in between */
    return Math.sign(v) * (0.38 * t + 0.62 * t * t * t) * LOOK_RATE * (sens / 0.0034);
  };
  /* ramp the turn rate instead of applying it instantly, so nudging the cursor
     doesn't snap the view */
  const k = 1 - Math.exp(-14 * dt);
  rateX += (curve(ptrX) - rateX) * k;
  rateY += (curve(ptrY) - rateY) * k;
  yaw += rateX * dt;
  pitch = clamp(pitch - rateY * 0.78 * dt, -PITCH_MAX, PITCH_MAX);
}
addEventListener('mousedown', e => {
  if (!locked() || photoMode) return;
  /* holding keeps trying: a shot fired a frame before an anchor comes into
     view now connects the instant it does, instead of silently failing */
  if (e.button === 0) { held[0] = true; if (fireWebAt(0, aimPt)) thwip(); }
  if (e.button === 2) { held[1] = true; if (fireWebAt(1, aimPt)) thwip(); }
});
addEventListener('mouseup', e => {
  if (e.button === 0) { held[0] = false; releaseWeb(0); }
  if (e.button === 2) { held[1] = false; releaseWeb(1); }
});
addEventListener('blur', () => { held[0] = held[1] = false; });

/* ---- photo mode: HUD gone, player and aircraft frozen, city still alive ---- */
let photoMode = false;
function setPhoto(on) {
  photoMode = on;
  document.body.classList.toggle('photo', on);
  toast(on ? 'photo mode · C to exit' : 'photo mode off');
}

/* ---------------------------------------------------------------
   TOUCH — the whole left region of the screen is a floating
   movement stick (the base appears wherever the thumb lands),
   hold-buttons on the right drive the same key states and edge
   flags as the keyboard, and any other drag looks. The web button
   doubles as an aim surface: keep it held to stay attached and drag
   the same thumb to steer the swing — without that, holding a line
   would cost you the camera, which is most of the game.

   Every active pointer is tracked window-level by id rather than by
   per-element listeners: a finger sliding off a button still
   releases it, so no control can ever wedge on.
   --------------------------------------------------------------- */
let touchOn = false;
function enableTouch() {
  if (touchOn) return; touchOn = true;
  document.body.classList.add('touch');
  if (freeLook) { freeLook = false; lookEl.classList.remove('on'); document.body.classList.remove('freelook'); }
}
if (COARSE) enableTouch();
const tstick = { id: -1, x: 0, y: 0, cx: 0, cy: 0 };   // unit deflection, +y = down-screen
const STICK_R = 52;                                     // px of travel for full deflection
const tPtr = new Map();                                 // pointerId -> {role, ...}
const stickEl = document.getElementById('tStick');
const nubEl = stickEl.querySelector('.nub');
const boardEl = document.getElementById('tBoard');
const hasLook = () => { for (const a of tPtr.values()) if (a.role === 'look') return true; return false; };
function bindHold(id, down, up, aims) {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    tPtr.set(e.pointerId, { role: 'btn', el, up, aims, px: e.clientX, py: e.clientY });
    el.classList.add('on'); down();
  });
}
bindHold('tWeb',
  () => { held[0] = true; if (!player.webs[0].on && aimPt && fireWebAt(0, aimPt)) thwip(); },
  () => { held[0] = false; releaseWeb(0); },
  true);                                                // held web thumb also aims
bindHold('tJump', () => { jumpEdge = true; keys['Space'] = true; }, () => { keys['Space'] = false; },
  true);                                                // a held glide steers with the same thumb
bindHold('tZip', () => { keys['KeyQ'] = true; }, () => { keys['KeyQ'] = false; });
bindHold('tTuck', () => { keys['ShiftLeft'] = true; }, () => { keys['ShiftLeft'] = false; });
bindHold('tBoard', () => { mountEdge = true; }, () => {});
addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return;
  enableTouch();
  if (!started || paused) return;
  if (e.target.closest && e.target.closest('.tbtn,#pbtn,#pause,#gate')) return;
  if (e.clientX < innerWidth * 0.42 && tstick.id === -1) {
    tstick.id = e.pointerId; tstick.cx = e.clientX; tstick.cy = e.clientY;
    tPtr.set(e.pointerId, { role: 'stick' });
    stickEl.classList.add('live');
    stickEl.style.left = (e.clientX - 60) + 'px';
    stickEl.style.top = (e.clientY - 60) + 'px';
    stickEl.style.bottom = 'auto';
  } else if (!hasLook()) {
    tPtr.set(e.pointerId, { role: 'look', px: e.clientX, py: e.clientY });
  }
});
addEventListener('pointermove', e => {
  const a = tPtr.get(e.pointerId); if (!a) return;
  if (a.role === 'stick') {
    const dx = e.clientX - tstick.cx, dy = e.clientY - tstick.cy;
    const l = Math.hypot(dx, dy), m = l > STICK_R ? STICK_R / l : 1;
    tstick.x = (dx * m) / STICK_R; tstick.y = (dy * m) / STICK_R;
    nubEl.style.transform = 'translate(' + dx * m * 0.77 + 'px,' + dy * m * 0.77 + 'px)';
  } else if (a.role === 'look' || (a.role === 'btn' && a.aims)) {
    const ts = sens * 1.9;
    yaw += (e.clientX - a.px) * ts;
    pitch = clamp(pitch - (e.clientY - a.py) * ts, -PITCH_MAX, PITCH_MAX);
    a.px = e.clientX; a.py = e.clientY;
  }
});
function tEnd(e) {
  const a = tPtr.get(e.pointerId); if (!a) return;
  tPtr.delete(e.pointerId);
  if (a.role === 'stick') {
    tstick.id = -1; tstick.x = tstick.y = 0;
    stickEl.classList.remove('live');
    stickEl.style.left = stickEl.style.top = stickEl.style.bottom = '';
    nubEl.style.transform = '';
  } else if (a.role === 'btn') { a.el.classList.remove('on'); a.up(); }
}
addEventListener('pointerup', tEnd);
addEventListener('pointercancel', tEnd);
/* rotating back to portrait mid-game: pause rather than play blind behind
   the rotate overlay */
try {
  matchMedia('(orientation: portrait)').addEventListener('change', ev => {
    if (ev.matches && touchOn && started) setPaused(true);
  });
} catch (e) {}

/* ---- settings persistence ---- */
const SAVE_KEY = 'nagaram.settings';
function saveSettings() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      sens, assist, muted, shadowsOn, dayT,
      help: document.getElementById('help').classList.contains('hide')
    }));
  } catch (e) {}
}
function loadSettings() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) {}
  if (!s) return;
  if (typeof s.sens === 'number') sens = clamp(s.sens, 0.0009, 0.0130);
  if (typeof s.assist === 'boolean') assist = s.assist;
  if (typeof s.muted === 'boolean') muted = s.muted;
  if (typeof s.shadowsOn === 'boolean') { shadowsOn = s.shadowsOn; sun.castShadow = shadowsOn; }
  if (typeof s.dayT === 'number' && isFinite(s.dayT)) dayT = ((s.dayT % 1) + 1) % 1;
  if (s.help) document.getElementById('help').classList.add('hide');
}
addEventListener('pagehide', saveSettings);

addEventListener('keydown', e => {
  if (keys[e.code] === undefined || !keys[e.code]) {
    if (e.code === 'Space') jumpEdge = true;
    if (e.code === 'KeyE') mountEdge = true;
    if (e.code === 'KeyT') {
      /* time now flows continuously; T skips ahead to the next distinct preset */
      const k = daySeg();
      let nk = k + 1;
      while (DAY_SEQ[nk % DAY_SEQ.length] === DAY_SEQ[k]) nk++;
      dayT = DAY_POS[nk] % 1;
      toast(TOD[DAY_SEQ[nk % DAY_SEQ.length]].name);
      saveSettings();
    }
    if (e.code === 'KeyF') { assist = !assist; saveSettings(); }
    if (e.code === 'KeyC') setPhoto(!photoMode);
    if (e.code === 'KeyH') { document.getElementById('help').classList.toggle('hide'); saveSettings(); }
    if (e.code === 'KeyM') { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.55; saveSettings(); }
    if (e.code === 'KeyP') { shadowsOn = !shadowsOn; sun.castShadow = shadowsOn; saveSettings(); }
    if (e.code === 'KeyR') respawn();
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      sens = clamp(sens * (e.code === 'BracketRight' ? 1.18 : 1 / 1.18), 0.0009, 0.0130);
      toast('look sensitivity ' + Math.round(sens / 0.0034 * 100) + '%');
      saveSettings();
    }
  }
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
});
function respawn() {
  player.p.set(-46, 96, -230); player.v.set(6, 0, 22);
  player.webs[0].on = player.webs[1].on = false;
  player.webs[0].pl = player.webs[1].pl = null;
  player.clinging = false;
  player.riding = null;   // without this, R while riding snaps you back onto the hull
}

