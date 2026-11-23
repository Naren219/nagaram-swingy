/* =====================================================================
   CHARACTER RIG
   ===================================================================== */
const SUIT = 0x1b2a4f, SUIT2 = 0x0e1728, PANEL = 0x2d4372,
      ACCENT = 0xd4aa2e, TEAL = 0x14837c, VISOR = 0xf1f3e4, SKIN = 0x8a6a4a;
/* the suit gets its own material — a little specular makes the panels read as
   fabric-over-plate instead of flat paint */
const suitMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 26, specular: 0x2b323d });
const SPH12 = new THREE.SphereGeometry(1, 14, 10);
/* M4 can only yaw; limb stripes and the chest chevron need roll */
const M4z = (x, y, z, sx, sy, sz, rz) => new THREE.Matrix4().compose(
  V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz || 0)),
  V3(sx, sy, sz));

/* A limb hangs from its joint down -Y. Each one carries a ball at the joint so
   bending never opens a gap, and a stripe down the outside so the silhouette
   still reads which way a limb is swinging at 60 m. */
function limb(len, rTop, rBot, color, side, extra) {
  const parts = [
    { geo: new THREE.CylinderGeometry(rTop, rBot, len, 12).translate(0, -len / 2, 0),
      matrix: new THREE.Matrix4(), color },
    { geo: SPH12, matrix: M4(0, 0, 0, rTop * 1.16, rTop * 1.10, rTop * 1.16), color: PANEL },
    { geo: BOXB, matrix: M4(side * rTop * 0.92, -len * 0.82, 0, 0.022, len * 0.66, rBot * 1.5),
      color: ACCENT }
  ];
  if (extra) parts.push(...extra);
  const m = new THREE.Mesh(mergeGeos(parts), suitMat);
  return m;
}
const rig = new THREE.Group(); scene.add(rig);
const rigParts = [];
function node(parent, x, y, z, mesh) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  if (mesh) { g.add(mesh); mesh.castShadow = true; rigParts.push(mesh); }
  parent.add(g); return g;
}
const ARM = 0.72, FORE = 0.6, THIGH = 0.5, SHIN = 0.48;

/* torso: tapered so the shoulders are broader than the waist */
const torsoMesh = new THREE.Mesh(mergeGeos([
  { geo: taper(0.34, 0.21, 0.43, 0.25, 0.30), matrix: M4(0, 0.00, 0), color: SUIT },
  { geo: taper(0.43, 0.25, 0.50, 0.26, 0.34), matrix: M4(0, 0.30, 0), color: SUIT },
  { geo: taper(0.50, 0.26, 0.41, 0.23, 0.10), matrix: M4(0, 0.64, 0), color: SUIT2 },
  { geo: BOXB, matrix: M4(0, 0.30, 0.005, 0.25, 0.30, 0.27), color: PANEL },
  /* chevron emblem */
  { geo: BOXB, matrix: M4z(-0.075, 0.34, 0.152, 0.19, 0.045, 0.02, 0.62), color: TEAL },
  { geo: BOXB, matrix: M4z(0.075, 0.34, 0.152, 0.19, 0.045, 0.02, -0.62), color: TEAL },
  { geo: SPH12, matrix: M4(0, 0.47, 0.145, 0.05, 0.05, 0.03), color: ACCENT },
  /* belt and shoulder caps */
  { geo: BOXB, matrix: M4(0, -0.04, 0, 0.45, 0.075, 0.26), color: ACCENT },
  { geo: SPH12, matrix: M4(-0.245, 0.60, 0, 0.113, 0.098, 0.120), color: PANEL },
  { geo: SPH12, matrix: M4(0.245, 0.60, 0, 0.113, 0.098, 0.120), color: PANEL },
  { geo: BOXB, matrix: M4(0, 0.585, 0, 0.55, 0.045, 0.275), color: TEAL }
]), suitMat);

const headMesh = new THREE.Mesh(mergeGeos([
  { geo: SPH12, matrix: M4(0, 0.185, -0.005, 0.138, 0.160, 0.150), color: SUIT },
  { geo: SPH12, matrix: M4(0, 0.115, 0.025, 0.114, 0.105, 0.136), color: SUIT },
  /* wraparound visor: a flattened sphere reads as a curved lens */
  { geo: SPH12, matrix: M4(0, 0.195, 0.022, 0.146, 0.058, 0.155), color: VISOR },
  { geo: BOXB, matrix: M4(0, 0.250, -0.02, 0.040, 0.095, 0.27), color: ACCENT },
  { geo: BOXB, matrix: M4(0, 0.055, 0, 0.175, 0.055, 0.175), color: TEAL }
]), suitMat);

const pelvisMesh = new THREE.Mesh(mergeGeos([
  { geo: taper(0.40, 0.24, 0.35, 0.21, 0.20), matrix: M4(0, -0.24, 0), color: SUIT2 },
  { geo: SPH12, matrix: M4(-0.135, -0.22, 0, 0.112, 0.095, 0.112), color: PANEL },
  { geo: SPH12, matrix: M4(0.135, -0.22, 0, 0.112, 0.095, 0.112), color: PANEL }
]), suitMat);

/* The model faces +z, with +y up; its own right hand is on -x. The pelvis is
   the root, the waist a joint above it, so the upper body can lean and twist
   over legs that stay under it. (The hips hung from the waist before: any
   lean of the torso swung the legs with it.) */
const pelvis = node(rig, 0, 0, 0, null);
node(pelvis, 0, 0, 0, pelvisMesh);
const spine = node(pelvis, 0, 0, 0, null);
node(spine, 0, 0, 0, torsoMesh);
const neck = node(spine, 0, 0.68, 0, headMesh);
const shoulderL = node(spine, -0.245, 0.60, 0, limb(ARM, 0.092, 0.070, SUIT, -1));
const shoulderR = node(spine, 0.245, 0.60, 0, limb(ARM, 0.092, 0.070, SUIT, 1));
/* hand: palm block, a thumb, and a gold cuff at the wrist */
const hand = (side) => [
  { geo: BOXB, matrix: M4(0, -FORE - 0.115, 0.012, 0.085, 0.125, 0.10), color: SKIN },
  { geo: BOXB, matrix: M4z(side * 0.055, -FORE - 0.075, 0.012, 0.05, 0.075, 0.075, side * 0.5), color: SKIN },
  { geo: SPH12, matrix: M4(0, -FORE - 0.02, 0, 0.088, 0.05, 0.088), color: ACCENT }
];
const elbowL = node(shoulderL, 0, -ARM, 0, limb(FORE, 0.074, 0.053, SUIT2, -1, hand(-1)));
const elbowR = node(shoulderR, 0, -ARM, 0, limb(FORE, 0.074, 0.053, SUIT2, 1, hand(1)));

const hipL = node(pelvis, -0.135, -0.22, 0, limb(THIGH, 0.118, 0.092, SUIT, -1));
const hipR = node(pelvis, 0.135, -0.22, 0, limb(THIGH, 0.118, 0.092, SUIT, 1));

/* boot: sole, toe box and a raised heel so feet aren't flat slabs */
const boot = () => [
  { geo: BOXB, matrix: M4(0, -SHIN - 0.075, 0.050, 0.135, 0.080, 0.27), color: TEAL },
  { geo: BOXB, matrix: M4(0, -SHIN - 0.02, 0.005, 0.152, 0.09, 0.158), color: SUIT2 },
  { geo: BOXB, matrix: M4(0, -SHIN - 0.10, -0.068, 0.122, 0.045, 0.10), color: SUIT2 },
  { geo: SPH12, matrix: M4(0, -SHIN + 0.02, 0, 0.10, 0.07, 0.10), color: ACCENT }
];
const kneeL = node(hipL, 0, -THIGH, 0, limb(SHIN, 0.092, 0.068, SUIT2, -1, boot()));
const kneeR = node(hipR, 0, -THIGH, 0, limb(SHIN, 0.092, 0.068, SUIT2, 1, boot()));
for (const m of rigParts) m.castShadow = true;

/* web strands */
const webMat = new THREE.MeshBasicMaterial({ color: 0xf2f4ef, transparent: true, opacity: 0.92 });
/* Each line is STRAND_SEG short cylinders, not one rigid rod, so it can do the
   two things a rope does that a rod cannot: leave the hand and travel to the
   anchor, and hang in a curve when it is longer than the gap it spans. Pure
   picture: the solver's line is a length, and stays one.
   One instanced mesh for both lines; a segment not in use is scaled to nothing. */
const STRAND_SEG = 12, SHOOT_V = 600;      // segments per line · m/s the strand travels at
/* and after those, one straight piece for each stretch of rope lying against
   the city between the anchor and the last corner it bends round (81-wrap.js) */
const STRAND_ALL = STRAND_SEG + WRAP_MAX;
const strandMesh = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0), webMat, STRAND_ALL * 2);
strandMesh.frustumCulled = false; scene.add(strandMesh);
const strandTip = [V3(), V3()];           // where each strand has got to
const strandSag = [0, 0];                 // metres its middle hangs below the straight line
const strandPts = new Float32Array((STRAND_SEG + 1) * 3);
const ZERO4 = new THREE.Matrix4().makeScale(0, 0, 0);
for (let k = 0; k < STRAND_ALL * 2; k++) strandMesh.setMatrixAt(k, ZERO4);
/* seconds for a strand to cross d metres: quick enough to be on the anchor
   before the line takes weight, slow enough to be seen leaving */
const shootTime = (d) => clamp(d / SHOOT_V, 0.05, 0.2);
function drawStrand(i, w, dt) {
  const { m, q, p, s } = scratch, base = i * STRAND_ALL;
  if (!w.on) {
    if (strandSag[i] !== -1) { for (let k = 0; k < STRAND_ALL; k++) strandMesh.setMatrixAt(base + k, ZERO4); strandSag[i] = -1; }
    return false;
  }
  if (strandSag[i] < 0) strandSag[i] = 0;
  /* the part that swings runs from the hand to the last bend; with no bends
     that is the anchor, and all of this is as it was */
  const end = webEnd(w);
  _d.copy(end).sub(w.hand);
  const d = _d.length(), f = clamp(w.age / shootTime(d), 0, 1);
  _d.multiplyScalar(1 / d);
  strandTip[i].copy(w.hand).addScaledVector(_d, d * f);
  /* a rope of length L across a gap d hangs sqrt(3 d (L - d) / 8) at the
     middle (the parabola a shallow catenary nearly is). Straight down, less
     whatever part of "down" lies along the rope: a vertical line cannot sag. */
  /* Slack is the solver's: its length less the gap from the BODY to the
     anchor. Measured from the hand, an arm's reach up the line always looked
     like a metre and a half of slack, and a taut line hung in a bow. */
  const slack = f < 1 ? 0 : Math.max(0, webFree(w) - player.p.distanceTo(end));
  strandSag[i] = damp(strandSag[i], Math.min(Math.sqrt(0.375 * d * slack), 0.3 * d), 16, dt);
  const sag = strandSag[i], gx = _d.y * _d.x, gy = _d.y * _d.y - 1, gz = _d.y * _d.z;
  for (let k = 0; k <= STRAND_SEG; k++) {
    const t = k / STRAND_SEG, along = d * f * t, hang = sag * 4 * t * (1 - t);
    strandPts[k * 3] = w.hand.x + _d.x * along + gx * hang;
    strandPts[k * 3 + 1] = w.hand.y + _d.y * along + gy * hang;
    strandPts[k * 3 + 2] = w.hand.z + _d.z * along + gz * hang;
  }
  const th = 1 + clamp(w.tension / 9000, 0, 1) * 0.7;
  for (let k = 0; k < STRAND_SEG; k++) {
    const o = k * 3;
    p.set(strandPts[o], strandPts[o + 1], strandPts[o + 2]);
    _d.set(strandPts[o + 3], strandPts[o + 4], strandPts[o + 5]).sub(p);
    const L = _d.length();
    if (L < 1e-5) { strandMesh.setMatrixAt(base + k, ZERO4); continue; }
    q.setFromUnitVectors(YUP, _d.multiplyScalar(1 / L));
    strandMesh.setMatrixAt(base + k, m.compose(p, q, s.set(th, L, th)));
  }
  /* the rope lying on the buildings: anchor, bend, bend ... taut and straight */
  for (let k = 0; k < WRAP_MAX; k++) {
    if (k >= w.nb) { strandMesh.setMatrixAt(base + STRAND_SEG + k, ZERO4); continue; }
    if (k) p.set(w.bp[k * 3 - 3], w.bp[k * 3 - 2], w.bp[k * 3 - 1]); else p.copy(w.a);
    _d.set(w.bp[k * 3], w.bp[k * 3 + 1], w.bp[k * 3 + 2]).sub(p);
    const L = _d.length();
    if (L < 1e-5) { strandMesh.setMatrixAt(base + STRAND_SEG + k, ZERO4); continue; }
    q.setFromUnitVectors(YUP, _d.multiplyScalar(1 / L));
    strandMesh.setMatrixAt(base + STRAND_SEG + k, m.compose(p, q, s.set(th, L, th)));
  }
  return f >= 1;     // the splat belongs to a strand that has arrived
}
const splats = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), webMat);
  m.visible = false; scene.add(m); return m;
});

const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _d = V3(), _up = V3(0, -1, 0);
const _sa = V3(), _sb = V3();   // shoulder world positions, for arm assignment
/* the rotation that hangs a limb (which points down its own -y) along a world direction */
function aimQ(worldDir, parentQ, out) {
  _d.copy(worldDir).applyQuaternion(_qi.copy(parentQ).invert()).normalize();
  return out.setFromUnitVectors(_up, _d);
}

/* ---------------------------------------------------------------------
   JOINTS ON SPRINGS
   Every joint is driven toward a target pose by a critically damped spring,
   solved exactly for the frame's dt: no overshoot, no dependence on the frame
   rate for a target that holds still, and the velocity carries across a
   change of target, so one pose flows into the next instead of each joint
   starting over from rest (which is what made the old blends look robotic).
   pose() sets a target; the springs run once per frame after all of them.
   --------------------------------------------------------------------- */
const JOINTS = [];
function joint(o) { o.tg = V3(); o.jv = V3(); o.w = 16; o.free = false; JOINTS.push(o); return o; }
for (const o of [pelvis, spine, neck, shoulderL, shoulderR, elbowL, elbowR, hipL, hipR, kneeL, kneeR]) joint(o);
let poseDt = 1 / 60;
/* w: how quick (rad/s of the spring); larger is snappier */
function pose(o, x, y, z, w) { o.tg.set(x, y, z); if (w) o.w = w; }
function springAxis(cur, tgt, v, w, dt, o, k) {
  const e0 = cur - tgt, a = v + w * e0, ex = Math.exp(-w * dt);
  o.jv.setComponent(k, (v - w * a * dt) * ex);
  return tgt + (e0 + a * dt) * ex;
}
function runSprings(dt) {
  for (const o of JOINTS) {
    if (o.free) { o.free = false; o.jv.set(0, 0, 0); continue; }   // set directly this frame (an arm on a line)
    const r = o.rotation;
    r.set(springAxis(r.x, o.tg.x, o.jv.x, o.w, dt, o, 0),
          springAxis(r.y, o.tg.y, o.jv.y, o.w, dt, o, 1),
          springAxis(r.z, o.tg.z, o.jv.z, o.w, dt, o, 2));
  }
}
/* the same pose on both sides of the body: z mirrors (the -x limbs are L) */
function pair(l, r, x, y, z, w) { pose(l, x, -y, -z, w); pose(r, x, y, z, w); }

const rigQ = new THREE.Quaternion();
const _bx = V3(), _by = V3(), _bz = V3(), _bm = new THREE.Matrix4();
let runPhase = 0;
/* Somersault state: rotation about the rig's side axis, layered on top of the
   smoothed base orientation. The base is kept SEPARATELY — feeding the flipped
   quaternion back through the orientation slerp corrupted the base and made
   the spin rate erratic. flipA is the applied angle in radians; flipSign is
   which way: a release tumbles backward, carrying on the turn the swing gave
   the body, and a landing rolls forward over the shoulder. */
let flipT = 1e9, flipDur = 1, flipN = 1, flipA = 0, flipGround = false, flipSign = -1;
listen('flip', (turns) => { flipN = turns; flipSign = -1; flipDur = turns > 1 ? 2.2 : 1.4; flipT = 0; flipGround = false; });
let landSq = 0;
listen('land', (hit, ny, rolling) => {
  if (ny > 0.6) landSq = Math.max(landSq, clamp(hit / 24, 0, 1));
  /* a somersault still unwinding owns the layer; let it finish */
  if (rolling && flipA === 0) { flipN = 1; flipSign = 1; flipDur = 0.5; flipT = 0; flipGround = true; }
});
const _fx = V3(1, 0, 0), _fq = new THREE.Quaternion();
const rigBaseQ = new THREE.Quaternion();
/* trapezoidal position profile: soft ramp in and out, constant tumble between.
   A somersault conserves its rate — smoothstep's mid-flip whip read as a glitch. */
function trapEase(p, r) {
  const vmax = 1 / (1 - r);
  if (p < r) return vmax * p * p / (2 * r);
  if (p > 1 - r) { const q = 1 - p; return 1 - vmax * q * q / (2 * r); }
  return vmax * (p - r / 2);
}

/* ---------------------------------------------------------------------
   WHICH WAY THE BODY POINTS
   heading: the horizontal way the body faces. It follows where you are going
   when you are going somewhere, and otherwise stays put, so a figure at rest
   does not spin with the camera; the head turns to look where you aim, and
   only past what a neck can do does the body turn to follow.
   Then the up axis: straight up on the ground; along the rope while a line
   carries you, so the body hangs from it and swings through the arc with it;
   tipped forward in the air by how the body is falling or flying.
   --------------------------------------------------------------------- */
const rigHead = V3(0, 0, 1), _hv = V3(), _ropeU = V3(), _camL = V3();
let T_rig = 0, rigY = 0.44, rigPitch = 0, gaitBlend = 0, flail = 0, armSwap = 0;
function turnHeading(x, z, rate, dt) {
  const l = Math.hypot(x, z); if (l < 1e-4) return;
  _hv.set(x / l, 0, z / l);
  rigHead.lerp(_hv, 1 - Math.exp(-rate * dt));
  if (rigHead.lengthSq() < 1e-6) rigHead.copy(_hv); else rigHead.normalize();
}
/* the rope's pull on the body: toward the ends of whatever lines carry weight */
function ropeUp(P) {
  _ropeU.set(0, 0, 0); let wt = 0;
  for (const w of player.webs) {
    if (!w.on) continue;
    const k = 0.15 + sstep(150, 1400, w.tension);
    _d.copy(webEnd(w)).sub(P); const l = _d.length(); if (l < 0.5) continue;
    _ropeU.addScaledVector(_d, k / l); wt += k;
  }
  if (wt > 0) _ropeU.multiplyScalar(1 / wt);
  return Math.min(1, wt);
}

function poseRig(dt, inp) {
  poseDt = dt;
  const V = player.v, spd = V.length(), vh = Math.hypot(V.x, V.z), P = pRender;
  const swinging = player.webs[0].on || player.webs[1].on;
  const onFoot = (player.grounded || player.wallRun) && !(flipT < flipDur && !flipGround);
  const rolling = flipGround && flipT < flipDur && player.grounded;
  const riding = !!player.riding;
  T_rig += dt;

  /* ---- heading ---- */
  if (player.clinging) turnHeading(-player.cn.x, -player.cn.z, 14, dt);
  else if (riding && player.riding.flown) turnHeading(Math.sin(player.riding.yaw), Math.cos(player.riding.yaw), 8, dt);   // facing the nose
  else if (riding) { if (inp.mx || inp.mz) turnHeading(inp.mx, inp.mz, 8, dt); }
  else if (player.wallRun) turnHeading(V.x, V.z, 14, dt);
  else if (player.grounded) {
    if (vh > 0.6) turnHeading(V.x, V.z, 12, dt);
    /* standing: turn to the camera only when the head can no longer look there */
    else if (rigHead.x * camFwd.x + rigHead.z * camFwd.z < -0.05) turnHeading(camFwd.x, camFwd.z, 3.5, dt);
  } else if (vh > 1.5) turnHeading(V.x, V.z, swinging ? 7 : 5, dt);

  /* ---- up axis ---- */
  const fall = -V.y, gamma = Math.atan2(V.y, Math.max(vh, 0.01));   // flight path angle, negative going down
  let want = 0;                                                       // forward lean, rad
  if (player.clinging) want = 0.1;
  else if (onFoot) want = player.wallRun ? 0 : 0.04 + 0.2 * sstep(4, 14, vh) + 0.4 * landSq;
  else if (player.inWater) want = vh > 4 ? 1.35 : 0.25;
  else if (inp.tuck) want = clamp(PI / 2 - gamma, 0.9, 2.9);          // head first, down the line of flight
  else if (inp.glide) want = clamp(PI / 2 + gamma * 0.75 - 0.12, 0.7, 1.75);   // flat to the air, a little nose up
  else want = Math.max(0.12 + 0.55 * sstep(6, 30, vh), 1.3 * sstep(10, 36, fall)) - 0.35 * sstep(3, 16, V.y);
  rigPitch = damp(rigPitch, want, onFoot ? 14 : 7, dt);
  _by.set(0, 1, 0).multiplyScalar(Math.cos(rigPitch)).addScaledVector(rigHead, Math.sin(rigPitch));
  if (player.wallRun) _by.set(player.cn.x * 0.7, 0.72, player.cn.z * 0.7).normalize();
  /* on a line, hang from it */
  const hang = swinging && !onFoot ? ropeUp(player.p) : 0;
  if (hang > 0) {
    /* a little ahead of the rope, as a body swung through an arc leads with its chest */
    _ropeU.normalize().addScaledVector(_hv.copy(V).addScaledVector(_ropeU, -V.dot(_ropeU)), 0.008).normalize();
    _by.lerp(_ropeU, hang).normalize();
  }
  /* forward: the heading, made square to the up axis */
  _bz.copy(rigHead).addScaledVector(_by, -rigHead.dot(_by));
  if (hang > 0 && spd > 2) { _hv.copy(V).addScaledVector(_by, -V.dot(_by)); if (_hv.lengthSq() > 1) _bz.lerp(_hv.normalize(), hang); }
  if (_bz.lengthSq() < 1e-5) _bz.set(0, 0, 1).addScaledVector(_by, -_by.z);
  _bz.normalize();
  _bx.copy(_by).cross(_bz).normalize();          // the model's +x: its left
  _by.copy(_bz).cross(_bx).normalize();
  /* bank into the turn the body is being pulled through */
  const lat = player.wallRun || player.clinging ? 0 : -player.lastAccel.dot(_bx);
  player.bank = damp(player.bank, clamp(lat * (onFoot ? 0.012 : 0.018), -0.8, 0.8), 6, dt);
  _bx.applyAxisAngle(_bz, player.bank); _by.applyAxisAngle(_bz, player.bank);
  _bm.makeBasis(_bx, _by, _bz);
  rigQ.setFromRotationMatrix(_bm);
  rigBaseQ.slerp(rigQ, 1 - Math.exp(-(onFoot ? 16 : hang > 0 ? 9 : 8) * dt));
  rig.quaternion.copy(rigBaseQ);

  /* layered somersault (see above) */
  if (flipT < flipDur || flipA !== 0) {
    const interrupted = player.clinging || riding || player.inWater || (flipGround
      ? !player.grounded
      : player.grounded || player.webs[0].on || player.webs[1].on);
    if (flipT < flipDur && !interrupted) {
      flipT += dt;
      flipA = flipT >= flipDur ? 0 : flipSign * TAU * flipN * trapEase(flipT / flipDur, flipGround ? 0.3 : 0.22);
    } else {
      flipT = flipDur;
      const turn = Math.round(flipA / TAU) * TAU;
      flipA = damp(flipA, turn, 16, dt);
      if (Math.abs(flipA - turn) < 0.03) flipA = 0;
    }
    if (flipA !== 0) { _fq.setFromAxisAngle(_fx, flipA); rig.quaternion.multiply(_fq); }
  }

  /* ---- where the eyes go: the aim, in the body's own frame ---- */
  _camL.copy(camFwd).applyQuaternion(_qi.copy(rig.quaternion).invert());
  const lookY = clamp(Math.atan2(_camL.x, _camL.z), -1.15, 1.15), lookP = clamp(Math.asin(clamp(_camL.y, -1, 1)), -0.7, 0.6);

  /* ---- the pose ---- */
  landSq = damp(landSq, 0, 6, dt);
  let bob = 0;
  if (player.clinging) {
    /* spread on the wall, hands high */
    pose(pelvis, 0, 0, 0, 14); pose(spine, -0.15, 0, 0, 14);
    pair(shoulderL, shoulderR, -2.75, 0, 0.45, 14); pair(elbowL, elbowR, -0.7, 0, 0, 14);
    pair(hipL, hipR, -0.55, 0, 0.45, 14); pair(kneeL, kneeR, 1.35, 0, 0, 14);
    pose(neck, -0.35, lookY * 0.6, 0, 12);
  } else if (flipT < flipDur) {
    /* a tucked ball for the somersault and the roll, formed before the tumble picks up speed */
    pose(pelvis, 0, 0, 0, 30); pose(spine, 0.55, 0, 0, 30); pose(neck, 0.45, 0, 0, 30);
    pair(shoulderL, shoulderR, -1.4, 0, 0.25, 30); pair(elbowL, elbowR, -2.0, 0, 0, 30);
    pair(hipL, hipR, -2.15, 0, 0.12, 30); pair(kneeL, kneeR, 2.4, 0, 0, 30);
  } else if (onFoot) {
    /* WALK AND RUN. The cadence rises with speed and the stride is whatever
       carries the body that far per step, so the feet keep pace with the
       ground instead of skating over it. Arms swing against the legs, the
       shoulders turn against the hips, and the body rises and falls: at the
       passing of the legs a walker is at the top of the stride and a runner
       at the bottom. */
    const gait = riding ? (player.riding.flown ? 0 : Math.hypot(inp.mx || 0, inp.mz || 0) * 5.5) : (player.wallRun ? spd : vh);
    const cad = clamp(1.75 + 0.18 * gait, 1.75, 3.6);                  // steps per second
    const stride = Math.floor(runPhase / PI);
    runPhase += dt * PI * cad * sstep(0.15, 0.9, gait);
    if (Math.floor(runPhase / PI) !== stride && gait > 2.2) emit('step', clamp(gait / 9, 0, 1.1));
    const ph = runPhase, s = Math.sin(ph), c = Math.cos(ph);
    const run = sstep(2.6, 5.5, gait), move = sstep(0.2, 1.2, gait);
    gaitBlend = damp(gaitBlend, move, 8, dt);
    /* A walker's legs cover the step, so the hip swing is whatever spans it.
       A runner covers most of the ground in the air: the thigh swings less,
       and mostly forward of the hip, reaching and pulling back under. */
    const walkA = Math.asin(clamp(gait / cad / 1.96, 0, 0.6));
    const reach = lerp(walkA, 0.52 + 0.1 * sstep(7, 12, gait), run) * gaitBlend;
    const fore = 0.22 * run * gaitBlend;                               // the thigh's swing is centred ahead of the hip
    const swingL = Math.max(0, c), swingR = Math.max(0, -c);         // which leg is coming through
    const sq = landSq;
    const w = 14 + 20 * gaitBlend;
    pose(pelvis, 0, 0.14 * reach * s, 0.04 * reach * c, w);
    pose(spine, 0.03 + 0.14 * run + 0.35 * sq, -0.32 * reach * s, 0, w);
    pose(neck, -0.12 * run - 0.2 * sq + (1 - gaitBlend) * 0.04 * Math.sin(T_rig * 1.7), lookY * 0.85, 0, 12);
    /* legs: the coming leg folds under, more as it runs; the stance leg stays long */
    pose(hipL, -reach * s - fore - 0.75 * sq, 0, -0.05 - 0.04 * (1 - gaitBlend), w);
    pose(hipR, reach * s - fore - 0.75 * sq, 0, 0.05 + 0.04 * (1 - gaitBlend), w);
    pose(kneeL, 0.06 + (0.45 + 1.4 * run) * swingL * gaitBlend + 0.2 * run + 1.3 * sq, 0, 0, w);
    pose(kneeR, 0.06 + (0.45 + 1.4 * run) * swingR * gaitBlend + 0.2 * run + 1.3 * sq, 0, 0, w);
    /* arms: against the legs, from the shoulder, elbows folding to a runner's
       right angle and a little more as the hand comes through */
    const arm = (0.3 + 0.35 * run) * gaitBlend * clamp(reach / 0.5, 0, 1.2);
    pose(shoulderL, arm * s - 0.08 * run, 0, -0.1 - 0.05 * run - 0.4 * sq, w);
    pose(shoulderR, -arm * s - 0.08 * run, 0, 0.1 + 0.05 * run + 0.4 * sq, w);
    pose(elbowL, -0.2 - 1.15 * run * gaitBlend - 0.35 * Math.max(0, -s) * run, 0, 0, w);
    pose(elbowR, -0.2 - 1.15 * run * gaitBlend - 0.35 * Math.max(0, s) * run, 0, 0, w);
    bob = gaitBlend * (0.035 * (1 - run) * Math.cos(2 * ph) - 0.05 * run * Math.cos(2 * ph)) - 0.012 * (1 - gaitBlend) * (1 + Math.sin(T_rig * 1.7));
  } else if (player.inWater) {
    const fast = vh > 4;
    runPhase += dt * (fast ? 7 : 4);
    const s = Math.sin(runPhase);
    pose(pelvis, 0, 0, 0, 10); pose(spine, fast ? -0.2 : 0.05, 0, 0, 10); pose(neck, fast ? -0.6 : 0, 0, 0, 10);
    if (fast) { pose(shoulderL, -1.7 + 1.3 * s, 0, -0.25, 16); pose(shoulderR, -1.7 - 1.3 * s, 0, 0.25, 16); }
    else { pair(shoulderL, shoulderR, -0.5, 0, 0.9 + 0.35 * s, 10); }
    pair(elbowL, elbowR, -0.5, 0, 0, 12);
    pose(hipL, 0.25 * s, 0, -0.08, 16); pose(hipR, -0.25 * s, 0, 0.08, 16);
    pair(kneeL, kneeR, 0.35, 0, 0, 12);
  } else if (hang > 0) {
    /* ON A LINE. Through the bottom the legs trail, long; going up the far
       side they come forward and fold, and over the top they hang. The free
       arm goes out and back to balance the one on the line. */
    const up = clamp(V.y / 14, -1, 1), load = sstep(400, 2200, Math.max(player.webs[0].tension, player.webs[1].tension));
    const lift = Math.max(0, up), drop = Math.max(0, -up);
    pose(pelvis, 0, 0, 0, 9);
    pose(spine, 0.25 * lift - 0.15 * load, 0, 0, 9);
    pose(neck, -0.25 - 0.2 * load, lookY * 0.7, 0, 10);
    pose(hipL, -0.25 - 1.05 * lift + 0.3 * drop, 0, -0.08, 8);
    pose(hipR, -0.05 - 0.65 * lift + 0.45 * drop, 0, 0.1, 8);
    pose(kneeL, 0.45 + 1.4 * lift + 0.1 * drop, 0, 0, 8);
    pose(kneeR, 0.25 + 0.9 * lift + 0.35 * drop, 0, 0, 8);
    pair(shoulderL, shoulderR, 0.35, 0, 1.05, 9);
    pair(elbowL, elbowR, -0.55, 0, 0, 9);
  } else if (inp.tuck) {
    /* a dive: arms ahead of the head, the body a line behind them */
    pose(pelvis, 0, 0, 0, 12); pose(spine, -0.05, 0, 0, 12); pose(neck, -0.5, 0, 0, 12);
    pair(shoulderL, shoulderR, -2.95, 0, 0.18, 12); pair(elbowL, elbowR, -0.08, 0, 0, 12);
    pair(hipL, hipR, 0.06, 0, 0.04, 12); pair(kneeL, kneeR, 0.12, 0, 0, 12);
  } else if (inp.glide) {
    /* flat on the air, arms out like wings, chest up to look ahead */
    pose(pelvis, 0, 0, 0, 10); pose(spine, -0.22, 0, 0, 10); pose(neck, -0.7, lookY * 0.4, 0, 10);
    pair(shoulderL, shoulderR, -0.25, 0, 1.45, 10); pair(elbowL, elbowR, -0.12, 0, 0, 10);
    pair(hipL, hipR, 0.12, 0, 0.18, 10); pair(kneeL, kneeR, 0.18, 0, 0, 10);
  } else {
    /* NOTHING TO HOLD. Going up, a leap: one knee driven up, the other leg
       trailing, the arms thrown up and out. Coming down, the limbs spread to
       the air, and the faster the fall the more they work at it. */
    const rise = sstep(-2, 6, V.y);
    flail = damp(flail, sstep(8, 28, fall), 3, dt);
    runPhase += dt * (3 + 6 * flail);
    const f1 = Math.sin(runPhase), f2 = Math.sin(runPhase * 1.31 + 1.7);
    const fl = flail * 0.3;
    pose(pelvis, 0, 0, 0, 10);
    pose(spine, 0.1 * rise - 0.18 * (1 - rise), 0, 0, 10);
    pose(neck, -0.15 - 0.5 * flail, lookY * 0.8, 0, 10);
    pose(hipL, lerp(-0.35 + fl * f1, -1.1, rise), 0, lerp(-0.25, -0.06, rise), 10);
    pose(hipR, lerp(-0.1 - fl * f1, 0.3, rise), 0, lerp(0.25, 0.08, rise), 10);
    pose(kneeL, lerp(0.75 + fl * f2, 1.6, rise), 0, 0, 10);
    pose(kneeR, lerp(0.45 - fl * f2, 0.55, rise), 0, 0, 10);
    pose(shoulderL, lerp(-0.75 + fl * f2, -1.0, rise), 0.25, lerp(-0.8 - 0.25 * flail, -0.55, rise), 10);
    pose(shoulderR, lerp(-0.45 - fl * f1, 0.2, rise), -0.25, lerp(0.95 + 0.2 * flail, 0.7, rise), 10);
    pose(elbowL, lerp(-1.05 + 0.25 * fl * f1, -0.9, rise), 0, 0, 10);
    pose(elbowR, lerp(-0.75 - 0.25 * fl * f2, -0.9, rise), 0, 0, 10);
  }
  if (!(flipT < flipDur)) neck.tg.x -= lookP * 0.5;          // and up or down to where you aim
  rigY = damp(rigY, rolling ? -0.22 : onFoot && !player.wallRun ? 0.44 : 0.06, rolling ? 20 : 12, dt);
  rig.position.copy(P); rig.position.y += rigY + bob - (onFoot ? landSq * 0.3 : 0);

  /* Arms reach for live anchors. Which arm serves which line is decided by
     whichever shoulder is actually nearer the anchor, rather than a fixed
     left-click-to-left-arm mapping — a static mapping makes the arms cross
     the chest whenever the anchors happen to sit on the other side. */
  const sh = [shoulderL, shoulderR], el = [elbowL, elbowR];
  const armFor = [-1, -1];                    // armFor[armIndex] = web index
  const wA = player.webs[0], wB = player.webs[1];
  rig.updateMatrixWorld(true);
  if (wA.on || wB.on) {
    sh[0].getWorldPosition(_sa); sh[1].getWorldPosition(_sb);
    if (wA.on && wB.on) {
      const eA = webEnd(wA), eB = webEnd(wB);
      const direct = _sa.distanceToSquared(eA) + _sb.distanceToSquared(eB);
      const swap = _sa.distanceToSquared(eB) + _sb.distanceToSquared(eA);
      if (swap < direct) { armFor[0] = 1; armFor[1] = 0; } else { armFor[0] = 0; armFor[1] = 1; }
    } else {
      const wi = wA.on ? 0 : 1, w = player.webs[wi];
      armFor[_sa.distanceToSquared(webEnd(w)) <= _sb.distanceToSquared(webEnd(w)) ? 0 : 1] = wi;
    }
  }
  runSprings(dt);
  rig.updateMatrixWorld(true);
  for (let a = 0; a < 2; a++) {
    const wi = armFor[a]; if (wi < 0) continue;
    const w = player.webs[wi];
    /* the arm whips up to the line in a few hundredths of a second, then holds it */
    _d.copy(webEnd(w)).sub(sh[a].getWorldPosition(_sa)).normalize();
    sh[a].parent.getWorldQuaternion(_pq);
    aimQ(_d, _pq, _q);
    sh[a].quaternion.slerp(_q, w.age < 0.3 ? 1 - Math.exp(-40 * dt) : 1 - Math.exp(-30 * dt));
    sh[a].free = true;
    el[a].rotation.set(damp(el[a].rotation.x, -0.12, 30, dt), 0, 0); el[a].free = true;
  }
  rig.updateMatrixWorld(true);

  for (let i = 0; i < 2; i++) {
    const w = player.webs[i];
    if (w.on) el[armFor[0] === i ? 0 : 1].localToWorld(w.hand.set(0, -FORE - 0.05, 0));
    splats[i].visible = drawStrand(i, w, dt);
    if (w.on) splats[i].position.copy(w.a);
  }
  strandMesh.instanceMatrix.needsUpdate = true;
}

