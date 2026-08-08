/* =====================================================================
   TRAFFIC
   ===================================================================== */
const WHEEL = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 9).rotateZ(PI / 2);
const V_AUTO = mergeGeos([
  { geo: BOXB, matrix: M4(0, 0.42, 0, 1.5, 0.85, 2.5), color: 0xe0b217 },
  { geo: BOXB, matrix: M4(0, 1.25, -0.15, 1.42, 0.95, 1.9), color: 0x1c1c1e },
  { geo: BOXB, matrix: M4(0, 0.95, 1.15, 1.0, 0.55, 0.4), color: 0x2b2b2d },
  { geo: WHEEL, matrix: M4(0.78, 0.36, -0.85), color: 0x1a1a1c },
  { geo: WHEEL, matrix: M4(-0.78, 0.36, -0.85), color: 0x1a1a1c },
  { geo: WHEEL, matrix: M4(0, 0.36, 1.15), color: 0x1a1a1c }]);
const V_CAR = mergeGeos([
  { geo: BOXB, matrix: M4(0, 0.42, 0, 1.75, 0.72, 4.1), color: 0xffffff },
  { geo: BOXB, matrix: M4(0, 1.14, -0.25, 1.6, 0.66, 2.2), color: 0x2a3138 },
  { geo: WHEEL, matrix: M4(0.86, 0.36, -1.35), color: 0x141416 },
  { geo: WHEEL, matrix: M4(-0.86, 0.36, -1.35), color: 0x141416 },
  { geo: WHEEL, matrix: M4(0.86, 0.36, 1.35), color: 0x141416 },
  { geo: WHEEL, matrix: M4(-0.86, 0.36, 1.35), color: 0x141416 }]);
const V_BUS = mergeGeos([
  { geo: BOXB, matrix: M4(0, 0.55, 0, 2.55, 2.4, 10.4), color: 0xf1ece0 },
  { geo: BOXB, matrix: M4(0, 1.55, 0, 2.62, 0.95, 9.6), color: 0x21343f },
  { geo: BOXB, matrix: M4(0, 0.62, 0, 2.62, 0.5, 10.2), color: 0x2f6b46 },
  { geo: WHEEL, matrix: M4(1.25, 0.42, -3.6, 1.2, 1.2, 1.2), color: 0x141416 },
  { geo: WHEEL, matrix: M4(-1.25, 0.42, -3.6, 1.2, 1.2, 1.2), color: 0x141416 },
  { geo: WHEEL, matrix: M4(1.25, 0.42, 3.4, 1.2, 1.2, 1.2), color: 0x141416 },
  { geo: WHEEL, matrix: M4(-1.25, 0.42, 3.4, 1.2, 1.2, 1.2), color: 0x141416 }]);
const V_TRUCK = mergeGeos([
  { geo: BOXB, matrix: M4(0, 0.6, -1.9, 2.35, 2.1, 2.6), color: 0x3a6ea5 },
  { geo: BOXB, matrix: M4(0, 0.6, 1.6, 2.45, 2.6, 4.6), color: 0xc4562f },
  { geo: BOXB, matrix: M4(0, 2.6, -1.9, 2.0, 0.5, 2.2), color: 0xe6d9a8 },
  { geo: WHEEL, matrix: M4(1.15, 0.44, -2.4, 1.25, 1.25, 1.25), color: 0x141416 },
  { geo: WHEEL, matrix: M4(-1.15, 0.44, -2.4, 1.25, 1.25, 1.25), color: 0x141416 },
  { geo: WHEEL, matrix: M4(1.15, 0.44, 2.4, 1.25, 1.25, 1.25), color: 0x141416 },
  { geo: WHEEL, matrix: M4(-1.15, 0.44, 2.4, 1.25, 1.25, 1.25), color: 0x141416 }]);

const segs = [];
(function buildLanes() {
  const blocked = (axis, k, t) => {
    const x = axis === 'x' ? t : k, z = axis === 'x' ? k : t;
    if (x > SAND_X - 10) return true;
    if (Math.abs(x) < TEMPLE.r + 16 && Math.abs(z) < TEMPLE.r + 16) return true;
    if (Math.abs(z - riverZ(x)) < RIVER_HW + 18) {
      let near = false;
      for (const bx of BRIDGES) if (Math.abs(x - bx) < 9) near = true;
      if (!near) return true;
    }
    return false;
  };
  for (const axis of ['x', 'z']) {
    for (let k = -EXT - PITCH; k <= EXT + PITCH; k += PITCH) {
      let run = null;
      for (let t = -EXT - PITCH; t <= EXT + PITCH; t += 6) {
        if (blocked(axis, k, t)) { if (run && t - run > 150) segs.push({ axis, k, a: run, b: t - 8 }); run = null; }
        else if (run === null) run = t + 8;
      }
      if (run !== null && (EXT + PITCH) - run > 150) segs.push({ axis, k, a: run, b: EXT + PITCH });
    }
  }
})();
const vehicles = [];
const vMeshes = [];
for (const [geo, n, spd] of [[V_AUTO, 130, [7, 12]], [V_CAR, 120, [9, 16]], [V_BUS, 34, [7, 11]], [V_TRUCK, 40, [6, 10]]]) {
  const im = new THREE.InstancedMesh(geo, vegMat, n);
  im.castShadow = true; im.frustumCulled = false; scene.add(im); vMeshes.push(im);
  for (let i = 0; i < n; i++) {
    const s = pick(segs);
    vehicles.push({ mesh: vMeshes.length - 1, idx: i, seg: s, t: rnd(s.a, s.b), dir: R() < 0.5 ? 1 : -1, v: rnd(spd[0], spd[1]) });
  }
}
function updateTraffic(dt) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const v of vehicles) {
    v.t += v.dir * v.v * dt;
    if (v.t > v.seg.b) v.t = v.seg.a; if (v.t < v.seg.a) v.t = v.seg.b;
    let x, z, yaw;
    if (v.seg.axis === 'x') { x = v.t; z = v.seg.k - v.dir * 3.7; yaw = v.dir > 0 ? PI / 2 : -PI / 2; }
    else { x = v.seg.k + v.dir * 3.7; z = v.t; yaw = v.dir > 0 ? 0 : PI; }
    e.set(0, yaw, 0); q.setFromEuler(e);
    m.compose(V3(x, 0, z), q, V3(1, 1, 1));
    vMeshes[v.mesh].setMatrixAt(v.idx, m);
  }
  for (const im of vMeshes) im.instanceMatrix.needsUpdate = true;
}

/* boats + kites */
const V_BOAT = mergeGeos([
  { geo: taper(2.2, 8.5, 0.6, 6.0, 1.0), matrix: M4(0, 0, 0), color: 0x2f6f8f },
  { geo: BOXB, matrix: M4(0, 1.0, 0, 2.0, 0.16, 7.6), color: 0xd9c9a4 },
  { geo: BOXB, matrix: M4(0, 1.0, -0.5, 0.18, 5.4, 0.18), color: 0x7a6544 },
  { geo: BOXB, matrix: M4(0.02, 1.6, 1.0, 0.06, 3.6, 2.9), color: 0xe6dcc4 }]);
const boats = [];
{
  const im = new THREE.InstancedMesh(V_BOAT, vegMat, 34);
  im.castShadow = true; im.frustumCulled = false; scene.add(im);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 34; i++) {
    const wet = i > 17;
    const x = wet ? rnd(SEA_X + 20, SEA_X + 300) : rnd(SAND_X + 8, SEA_X - 6);
    const z = rnd(-420, 300);
    boats.push({ x, z, wet, yaw: rnd(0, TAU), ph: rnd(0, TAU) });
    m.compose(V3(x, 0, z), new THREE.Quaternion(), V3(1, 1, 1));
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true; boats.mesh = im;
}
const V_KITE = mergeGeos([
  { geo: BOXB, matrix: M4(0, 0, 0, 1.5, 0.04, 1.5, PI / 4), color: 0xe0402c },
  { geo: BOXB, matrix: M4(0, -0.02, -1.6, 0.12, 0.03, 2.6), color: 0xf0c93a }]);
const kites = [];
{
  const im = new THREE.InstancedMesh(V_KITE, vegMat, 26);
  im.frustumCulled = false; scene.add(im);
  for (let i = 0; i < 26; i++) kites.push({ x: rnd(-EXT, EXT), z: rnd(-EXT, EXT), y: rnd(55, 150), ph: rnd(0, TAU), r: rnd(9, 26) });
  kites.mesh = im;
}
/* ---------------------------------------------------------------
   AIRCRAFT — moving anchors. Latching one tows you, so the rope
   constraint has to be solved against a point that is itself moving.
   --------------------------------------------------------------- */
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 12).rotateX(PI / 2);   // long axis on Z
const NOSE = new THREE.ConeGeometry(1, 1, 12).rotateX(PI / 2);
const V_PLANE = mergeGeos([
  { geo: TUBE, matrix: M4(0, 0, 0, 2.7, 2.5, 22), color: 0xdfe3e6 },
  { geo: NOSE, matrix: M4(0, 0, 12.4, 2.6, 3.4, 1), color: 0xe8ebec },
  { geo: BOXB, matrix: M4(0, -1.05, -0.5, 26, 0.5, 4.6), color: 0xd7dbde },
  { geo: BOXB, matrix: M4(0, -0.05, -9.2, 9.5, 0.4, 2.2), color: 0xd7dbde },
  { geo: BOXB, matrix: M4(0, 0.6, -9.0, 0.5, 4.0, 2.8), color: 0xcf3a2a },
  { geo: TUBE, matrix: M4(-7.0, -1.9, 0.4, 1.8, 1.8, 4.6), color: 0x8f9699 },
  { geo: TUBE, matrix: M4(7.0, -1.9, 0.4, 1.8, 1.8, 4.6), color: 0x8f9699 },
  { geo: BOXB, matrix: M4(0, 1.15, 8.4, 1.9, 0.5, 3.0), color: 0x2b3238 }   // cockpit glass
]);
const PLANE_HX = 13.0, PLANE_HY = 3.4, PLANE_HZ = 12.0;   // AABB half-extents
const DECK_Y = 1.45;     // top of the fuselage, where a rider stands
const planes = [];
{
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(V_PLANE, mat);
    mesh.castShadow = true; mesh.frustumCulled = false;
    scene.add(mesh);
    planes.push({
      mesh,
      y: rnd(78, 168),
      r: rnd(210, 470),          // radius of the circuit it flies
      cx: rnd(-120, 120), cz: rnd(-160, 120),
      ph: (i / 5) * TAU + rnd(0, 1),
      w: (i % 2 ? -1 : 1) * rnd(0.055, 0.10),   // angular speed, both directions
      p: V3(), v: V3(), yaw: 0
    });
  }
}
function updatePlanes(dt) {
  for (const pl of planes) {
    pl.ph += pl.w * dt;
    const px = pl.cx + Math.cos(pl.ph) * pl.r, pz = pl.cz + Math.sin(pl.ph) * pl.r;
    const py = pl.y + Math.sin(pl.ph * 2.1) * 6;
    pl.v.set(px - pl.p.x, py - pl.p.y, pz - pl.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
    pl.p.set(px, py, pz);
    /* nose points along the tangent; bank into the turn */
    pl.yaw = Math.atan2(-Math.sin(pl.ph) * pl.w, Math.cos(pl.ph) * pl.w);
    pl.mesh.position.copy(pl.p);
    pl.mesh.rotation.set(0, pl.yaw, pl.w > 0 ? -0.22 : 0.22);
  }
}
/* local offset -> world, so a latched anchor rides the hull */
function planePoint(pl, lx, ly, lz, out) {
  const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
  return out.set(pl.p.x + lx * c + lz * sn, pl.p.y + ly, pl.p.z - lx * sn + lz * c);
}
function worldToPlane(pl, wx, wy, wz, out) {
  const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
  const dx = wx - pl.p.x, dy = wy - pl.p.y, dz = wz - pl.p.z;
  return out.set(dx * c - dz * sn, dy, dx * sn + dz * c);
}
/* slab test against each hull; only five of them, so brute force */
const _ph2 = { t: 0, x: 0, y: 0, z: 0, pl: null };
function rayHitPlanes(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, hitPl = null;
  for (const pl of planes) {
    let t0 = 0.02, t1 = best, ok = true;
    const lo = [pl.p.x - PLANE_HX - 2, pl.p.y - PLANE_HY - 1, pl.p.z - PLANE_HZ - 2];
    const hi = [pl.p.x + PLANE_HX + 2, pl.p.y + PLANE_HY + 1, pl.p.z + PLANE_HZ + 2];
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let a = 0; a < 3 && ok; a++) {
      if (Math.abs(d[a]) < 1e-8) { if (o[a] < lo[a] || o[a] > hi[a]) ok = false; continue; }
      const inv = 1 / d[a];
      let n = (lo[a] - o[a]) * inv, f = (hi[a] - o[a]) * inv;
      if (n > f) { const tmp = n; n = f; f = tmp; }
      if (n > t0) t0 = n;
      if (f < t1) t1 = f;
      if (t0 > t1) ok = false;
    }
    if (ok && t0 > 0.02 && t0 < best) { best = t0; hitPl = pl; }
  }
  if (!hitPl) return null;
  _ph2.t = best; _ph2.pl = hitPl;
  _ph2.x = ox + dx * best; _ph2.y = oy + dy * best; _ph2.z = oz + dz * best;
  return _ph2;
}

function updateProps(t) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i];
    const bob = b.wet ? Math.sin(t * 1.1 + b.ph) * 0.35 : 0;
    e.set(b.wet ? Math.sin(t * 0.9 + b.ph) * 0.08 : 0.12, b.yaw, b.wet ? Math.cos(t * 0.7 + b.ph) * 0.06 : 0.05);
    m.compose(V3(b.x, bob - (b.wet ? 0.3 : 0), b.z), q.setFromEuler(e), V3(1, 1, 1));
    boats.mesh.setMatrixAt(i, m);
  }
  boats.mesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < kites.length; i++) {
    const k = kites[i];
    const a = t * 0.22 + k.ph;
    e.set(Math.sin(a * 1.7) * 0.5, a, Math.cos(a * 1.3) * 0.4);
    m.compose(V3(k.x + Math.cos(a) * k.r, k.y + Math.sin(a * 1.6) * 5, k.z + Math.sin(a) * k.r), q.setFromEuler(e), V3(1.6, 1.6, 1.6));
    kites.mesh.setMatrixAt(i, m);
  }
  kites.mesh.instanceMatrix.needsUpdate = true;
}

