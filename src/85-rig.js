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

const spine = node(rig, 0, 0, 0, null);
node(spine, 0, 0, 0, torsoMesh);
node(spine, 0, 0, 0, pelvisMesh);
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

const hipL = node(spine, -0.135, -0.22, 0, limb(THIGH, 0.118, 0.092, SUIT, -1));
const hipR = node(spine, 0.135, -0.22, 0, limb(THIGH, 0.118, 0.092, SUIT, 1));

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
const strands = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0), webMat);
  m.visible = false; m.frustumCulled = false; scene.add(m); return m;
});
const splats = [0, 1].map(() => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), webMat);
  m.visible = false; scene.add(m); return m;
});

const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _d = V3(), _up = V3(0, -1, 0);
const _sa = V3(), _sb = V3();   // shoulder world positions, for arm assignment
function aimAt(nodeObj, worldDir, parentQ) {
  _d.copy(worldDir).applyQuaternion(_qi.copy(parentQ).invert()).normalize();
  _q.setFromUnitVectors(_up, _d);
  nodeObj.quaternion.slerp(_q, 1);
}
function smoothEuler(o, x, y, z, k) {
  o.rotation.x = damp(o.rotation.x, x, k, 0.016);
  o.rotation.y = damp(o.rotation.y, y, k, 0.016);
  o.rotation.z = damp(o.rotation.z, z, k, 0.016);
}
const rigQ = new THREE.Quaternion();
const _bx = V3(), _by = V3(), _bz = V3(), _bm = new THREE.Matrix4();
let runPhase = 0;
/* Somersault state: rotation about the rig's side axis, layered on top of the
   smoothed base orientation. The base is kept SEPARATELY — feeding the flipped
   quaternion back through the orientation slerp corrupted the base and made
   the spin rate erratic. flipA is the applied angle in radians. */
let flipT = 1e9, flipDur = 1, flipN = 1, flipA = 0;
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

let rigY = 0.44;
function poseRig(dt, inp) {
  const V = player.v, spd = V.length();
  /* the collision sphere sits at the hips; lift the skeleton so the feet
     land on the ground rather than through it */
  rigY = damp(rigY, player.grounded ? 0.44 : 0.06, 9, dt);
  rig.position.copy(pRender); rig.position.y += rigY;

  /* orientation */
  if (spd > 3.5) _bz.copy(V).multiplyScalar(-1 / spd);
  else _bz.copy(inp.fwd).multiplyScalar(-1);
  if (player.grounded) { _bz.y = 0; if (_bz.lengthSq() < 1e-4) _bz.set(0, 0, 1); _bz.normalize(); }
  if (player.clinging) { _bz.copy(player.cn); }
  const lat = player.lastAccel.dot(_bx.copy(_bz).cross(V3(0, 1, 0)).normalize());
  player.bank = damp(player.bank, clamp(lat * 0.020, -0.85, 0.85), 6, dt);
  _by.set(0, 1, 0);
  _bx.copy(_by).cross(_bz);
  if (_bx.lengthSq() < 1e-5) _bx.set(1, 0, 0);
  _bx.normalize(); _by.copy(_bz).cross(_bx).normalize();
  _bx.applyAxisAngle(_bz, player.bank); _by.applyAxisAngle(_bz, player.bank);
  _bm.makeBasis(_bx, _by, _bz);
  rigQ.setFromRotationMatrix(_bm);
  rigBaseQ.slerp(rigQ, 1 - Math.exp(-11 * dt));
  rig.quaternion.copy(rigBaseQ);

  /* layered somersault: constant-rate tumble with soft ends, applied on top of
     the base so the orientation filter never sees it. Ground, wall, water or a
     fresh line interrupts it — the applied angle then unwinds to the nearest
     full turn instead of snapping to identity. */
  if (flipT < flipDur || flipA !== 0) {
    const interrupted = player.grounded || player.clinging || player.riding ||
      player.inWater || player.webs[0].on || player.webs[1].on;
    if (flipT < flipDur && !interrupted) {
      flipT += dt;
      flipA = flipT >= flipDur ? 0 : TAU * flipN * trapEase(flipT / flipDur, 0.22);
    } else {
      flipT = flipDur;
      const turn = Math.round(flipA / TAU) * TAU;
      flipA = damp(flipA, turn, 16, dt);
      if (Math.abs(flipA - turn) < 0.03) flipA = 0;
    }
    if (flipA !== 0) { _fq.setFromAxisAngle(_fx, flipA); rig.quaternion.multiply(_fq); }
  }

  const swinging = player.webs[0].on || player.webs[1].on;
  const k = 14;
  if (player.clinging) {
    smoothEuler(spine, 0, 0, 0, k);
    smoothEuler(shoulderL, -0.2, 0, -1.35, k); smoothEuler(shoulderR, -0.2, 0, 1.35, k);
    smoothEuler(elbowL, -1.1, 0, 0, k); smoothEuler(elbowR, -1.1, 0, 0, k);
    smoothEuler(hipL, -0.5, 0, -0.55, k); smoothEuler(hipR, -0.5, 0, 0.55, k);
    smoothEuler(kneeL, 1.5, 0, 0, k); smoothEuler(kneeR, 1.5, 0, 0, k);
  } else if (player.grounded) {
    runPhase += dt * clamp(spd * 1.5, 0, 26);
    const s = Math.sin(runPhase), c = Math.cos(runPhase);
    const amp = clamp(spd / 9, 0, 1.1);
    smoothEuler(spine, -0.12 - amp * 0.22, 0, 0, k);
    smoothEuler(shoulderL, s * 0.9 * amp, 0, -0.16, k); smoothEuler(shoulderR, -s * 0.9 * amp, 0, 0.16, k);
    smoothEuler(elbowL, -0.6 - amp * 0.4, 0, 0, k); smoothEuler(elbowR, -0.6 - amp * 0.4, 0, 0, k);
    smoothEuler(hipL, -s * 0.85 * amp, 0, 0, k); smoothEuler(hipR, s * 0.85 * amp, 0, 0, k);
    smoothEuler(kneeL, clamp(0.5 + c * 0.9, 0.05, 1.7) * amp, 0, 0, k);
    smoothEuler(kneeR, clamp(0.5 - c * 0.9, 0.05, 1.7) * amp, 0, 0, k);
  } else if (flipT < flipDur) {
    /* tucked ball for the somersault — snappier than the other transitions so
       the tuck forms before the tumble picks up speed */
    smoothEuler(spine, 0.5, 0, 0, 22);
    smoothEuler(shoulderL, 2.3, 0, -0.3, 22); smoothEuler(shoulderR, 2.3, 0, 0.3, 22);
    smoothEuler(elbowL, -2.0, 0, 0, 22); smoothEuler(elbowR, -2.0, 0, 0, 22);
    smoothEuler(hipL, -2.1, 0, -0.1, 22); smoothEuler(hipR, -2.1, 0, 0.1, 22);
    smoothEuler(kneeL, 2.4, 0, 0, 22); smoothEuler(kneeR, 2.4, 0, 0, 22);
  } else if (inp.glide) {
    smoothEuler(spine, 0.30, 0, 0, k);
    smoothEuler(shoulderL, 0.05, 0, -1.42, k); smoothEuler(shoulderR, 0.05, 0, 1.42, k);
    smoothEuler(elbowL, -0.12, 0, 0, k); smoothEuler(elbowR, -0.12, 0, 0, k);
    smoothEuler(hipL, 0.16, 0, -0.16, k); smoothEuler(hipR, 0.16, 0, 0.16, k);
    smoothEuler(kneeL, 0.10, 0, 0, k); smoothEuler(kneeR, 0.10, 0, 0, k);
  } else if (inp.tuck) {
    smoothEuler(spine, 0.42, 0, 0, k);
    smoothEuler(shoulderL, 2.5, 0, -0.22, k); smoothEuler(shoulderR, 2.5, 0, 0.22, k);
    smoothEuler(elbowL, -0.3, 0, 0, k); smoothEuler(elbowR, -0.3, 0, 0, k);
    smoothEuler(hipL, 0.30, 0, -0.05, k); smoothEuler(hipR, 0.30, 0, 0.05, k);
    smoothEuler(kneeL, 0.12, 0, 0, k); smoothEuler(kneeR, 0.12, 0, 0, k);
  } else {
    const t = swinging ? 1 : 0.35;
    smoothEuler(spine, -0.10, 0, 0, k);
    smoothEuler(hipL, -1.25 * t, 0, -0.12, k); smoothEuler(hipR, -0.75 * t, 0, 0.12, k);
    smoothEuler(kneeL, 1.85 * t, 0, 0, k); smoothEuler(kneeR, 1.05 * t, 0, 0, k);
    if (!swinging) { smoothEuler(shoulderL, -0.5, 0, -0.9, k); smoothEuler(shoulderR, -0.5, 0, 0.9, k); }
    smoothEuler(elbowL, -0.25, 0, 0, k); smoothEuler(elbowR, -0.25, 0, 0, k);
  }

  rig.updateMatrixWorld(true);
  /* Arms reach for live anchors. Which arm serves which line is decided by
     whichever shoulder is actually nearer the anchor, rather than a fixed
     left-click-to-left-arm mapping — a static mapping makes the arms cross
     the chest whenever the anchors happen to sit on the other side. */
  const sh = [shoulderL, shoulderR], el = [elbowL, elbowR];
  const armFor = [-1, -1];                    // armFor[armIndex] = web index
  const wA = player.webs[0], wB = player.webs[1];
  if (wA.on || wB.on) {
    sh[0].getWorldPosition(_sa); sh[1].getWorldPosition(_sb);
    if (wA.on && wB.on) {
      const direct = _sa.distanceToSquared(wA.a) + _sb.distanceToSquared(wB.a);
      const swap = _sa.distanceToSquared(wB.a) + _sb.distanceToSquared(wA.a);
      if (swap < direct) { armFor[0] = 1; armFor[1] = 0; } else { armFor[0] = 0; armFor[1] = 1; }
    } else {
      const wi = wA.on ? 0 : 1, w = player.webs[wi];
      armFor[_sa.distanceToSquared(w.a) <= _sb.distanceToSquared(w.a) ? 0 : 1] = wi;
    }
  }
  for (let a = 0; a < 2; a++) {
    const wi = armFor[a]; if (wi < 0) continue;
    const w = player.webs[wi];
    sh[a].getWorldPosition(_d);
    _d.copy(w.a).sub(_d).normalize();
    sh[a].parent.getWorldQuaternion(_pq);
    aimAt(sh[a], _d, _pq);
    el[a].rotation.set(-0.12, 0, 0);
  }
  rig.updateMatrixWorld(true);

  for (let i = 0; i < 2; i++) {
    const w = player.webs[i];
    strands[i].visible = splats[i].visible = w.on;
    if (!w.on) continue;
    el[armFor[0] === i ? 0 : 1].localToWorld(w.hand.set(0, -FORE - 0.05, 0));
    _d.copy(w.a).sub(w.hand);
    const L = _d.length();
    strands[i].position.copy(w.hand);
    strands[i].quaternion.setFromUnitVectors(V3(0, 1, 0), _d.multiplyScalar(1 / L));
    strands[i].scale.set(1, L, 1);
    splats[i].position.copy(w.a);
    const th = clamp(w.tension / 9000, 0, 1);
    strands[i].scale.x = strands[i].scale.z = 1 + th * 0.7;
  }
}

