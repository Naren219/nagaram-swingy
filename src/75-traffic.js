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
    if (onOpenGround(x, z, ROADW / 2, ROADW / 2)) return true;
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
const IDENT = new THREE.Matrix4();
for (const [geo, n, spd] of [[V_AUTO, 130, [7, 12]], [V_CAR, 120, [9, 16]], [V_BUS, 34, [7, 11]], [V_TRUCK, 40, [6, 10]]]) {
  const im = new THREE.InstancedMesh(geo, vegMat, n);
  im.castShadow = true; im.frustumCulled = false; scene.add(im); vMeshes.push(im);
  for (let i = 0; i < n; i++) {
    im.setMatrixAt(i, IDENT);   // updateTraffic only rewrites the six entries that change
    const s = pick(segs);
    vehicles.push({ mesh: vMeshes.length - 1, idx: i, seg: s, t: rnd(s.a, s.b), dir: R() < 0.5 ? 1 : -1, v: rnd(spd[0], spd[1]) });
  }
}
/* 324 vehicles every frame: each is a quarter-turn about Y plus a position,
   so the six matrix entries that change are written straight into the
   instance buffer. Composing through Euler -> Quaternion -> Matrix4 with
   fresh vectors was the largest source of per-frame garbage in the game. */
function updateTraffic(dt) {
  for (const v of vehicles) {
    v.t += v.dir * v.v * dt;
    if (v.t > v.seg.b) v.t = v.seg.a; if (v.t < v.seg.a) v.t = v.seg.b;
    let x, z, c, s;   // cos and sin of the heading
    if (v.seg.axis === 'x') { x = v.t; z = v.seg.k - v.dir * 3.7; c = 0; s = v.dir; }
    else { x = v.seg.k + v.dir * 3.7; z = v.t; c = v.dir; s = 0; }
    const a = vMeshes[v.mesh].instanceMatrix.array, o = v.idx * 16;
    a[o] = c; a[o + 2] = -s; a[o + 8] = s; a[o + 10] = c; a[o + 12] = x; a[o + 14] = z;
  }
  for (const im of vMeshes) im.instanceMatrix.needsUpdate = true;
}

/* boats + kites */
const V_BOAT = mergeGeos([
  { geo: taper(2.2, 8.5, 0.6, 6.0, 1.0), matrix: M4(0, 0, 0), color: 0x2f6f8f },
  { geo: BOXB, matrix: M4(0, 1.0, 0, 2.0, 0.16, 7.6), color: 0xd9c9a4 },
  { geo: BOXB, matrix: M4(0, 1.0, -0.5, 0.18, 5.4, 0.18), color: 0x7a6544 },
  { geo: BOXB, matrix: M4(0.02, 1.6, 1.0, 0.06, 3.6, 2.9), color: 0xe6dcc4 }]);
/* Boats and kites used to be scenery. They are carriers now (see AIRCRAFT
   below): what is drawn is where the carrier is, and the carrier is what a
   web latches and a landing stands on. Their own random stream, so the city
   placed after them is the city it was. */
const RIDE_UP = 0.85;      // a rider's centre above the surface they stand on
const BOAT_HX = 1.1, BOAT_HY = 0.58, BOAT_HZ = 4.25;   // hull and deck, about the hull's centre
const boats = [];
const kites = [];
const KITE_MAX = 72;       // a festival day (11-city-day.js) flies all of them; any other day, 26
const KITES_ON = CITY_DAY.kites ? KITE_MAX : 26;
{
  const im = new THREE.InstancedMesh(V_BOAT, vegMat, 34);
  im.castShadow = true; im.frustumCulled = false; scene.add(im);
  const m = new THREE.Matrix4(), br = mulberry32(7310);
  for (let i = 0; i < 34; i++) {
    const wet = i > 17;
    let x = wet ? rnd(SEA_X + 20, SEA_X + 300) : rnd(SAND_X + 8, SEA_X - 6);
    const z = rnd(-420, 300);
    /* afloat, each sails a slow circle offshore; on the sand it stays put */
    const r = wet ? 30 + br() * 70 : 0, spd = 2.5 + br() * 2.5, th = br() * TAU;
    if (wet) x = Math.max(x, SEA_X + 18 + 2 * r);
    boats.push({ x, z, wet, yaw: rnd(0, TAU), ph: rnd(0, TAU),
      kind: 'boat', step: sailBoat, cx: x - r * Math.cos(th), cz: z - r * Math.sin(th), r, th, w: wet ? (br() < 0.5 ? -1 : 1) * spd / r : 0,
      p: V3(x, 0, z), v: V3(), hx: BOAT_HX, hy: BOAT_HY, hz: BOAT_HZ, reach: 1.2, deck: BOAT_HY + RIDE_UP, walkX: 0.6, walkZ: 3.3 });
    m.compose(V3(x, 0, z), new THREE.Quaternion(), V3(1, 1, 1));
    im.setMatrixAt(i, m);
  }
  im.instanceMatrix.needsUpdate = true; boats.mesh = im;
}
const V_KITE = mergeGeos([
  { geo: BOXB, matrix: M4(0, 0, 0, 1.5, 0.04, 1.5, PI / 4), color: 0xe0402c },
  { geo: BOXB, matrix: M4(0, -0.02, -1.6, 0.12, 0.03, 2.6), color: 0xf0c93a }]);
{
  const im = new THREE.InstancedMesh(V_KITE, vegMat, KITE_MAX);
  im.frustumCulled = false; scene.add(im);
  const kr = mulberry32(4417), krnd = (a, b) => a + kr() * (b - a);
  for (let i = 0; i < KITE_MAX; i++) {
    /* the first 26 draw from the world's stream, as they always have */
    const k = i < 26 ? { x: rnd(-EXT, EXT), z: rnd(-EXT, EXT), y: rnd(55, 150), ph: rnd(0, TAU), r: rnd(9, 26) }
                     : { x: krnd(-EXT, EXT), z: krnd(-EXT, EXT), y: krnd(50, 140), ph: krnd(0, TAU), r: krnd(9, 26) };
    Object.assign(k, { kind: 'kite', step: flyKite, p: V3(k.x, k.y, k.z), v: V3(), yaw: 0, a: 0, held: 0, ox: 0, oy: 0, oz: 0,
      hx: 1.2, hy: 0.5, hz: 1.2, reach: 2.2, deck: null });
    kites.push(k);
  }
  im.count = KITES_ON;
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
const PLANE_BANK = 0.22; // the roll an aircraft holds round its circuit
/* the boosters: lit by the pilot (89-pilot.js), they add PLANE_BOOST to the
   cruising speed at full thrust, and burn down at PLANE_BOOST_FALL once let
   go, on the autopilot too, so handing back mid-boost slows it, not stops it */
const PLANE_BOOST = 38, PLANE_BOOST_FALL = 1.1;
const ENGINE_X = 7.0, ENGINE_Y = -1.9, NOZZLE_Z = -1.9;   // the back of each engine (V_PLANE)
const FLAME_LEN = 6;     // metres of flame at full thrust
const FLAME = new THREE.ConeGeometry(0.72, 1, 10).rotateX(-PI / 2).translate(0, 0, -0.5);   // base at the nozzle, 1 m long
/* the flame is drawn as it is, so it stays orange against a bright sky; only its core adds light */
const flameMat = new THREE.MeshBasicMaterial({ color: 0xff5a12, transparent: true, opacity: 0.85,
  depthWrite: false, toneMapped: false });
const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
function makeFlame(x) {
  const g = new THREE.Group(), core = new THREE.Mesh(FLAME, flameCoreMat);
  core.scale.set(0.5, 0.5, 0.55);
  g.add(new THREE.Mesh(FLAME, flameMat), core);
  g.position.set(x, ENGINE_Y, NOZZLE_Z); g.visible = false;
  return g;
}
const planes = [];
{
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(V_PLANE, mat);
    mesh.castShadow = true; mesh.frustumCulled = false;
    mesh.rotation.order = 'YXZ';   // heading, then nose up/down, then bank: how planePoint turns it too
    const flames = [makeFlame(-ENGINE_X), makeFlame(ENGINE_X)];
    mesh.add(...flames);
    scene.add(mesh);
    const pl = {
      kind: 'plane', step: flyPlane, mesh, flames,
      y: rnd(78, 168),
      r: rnd(210, 470),          // radius of the circuit it flies
      cx: rnd(-120, 120), cz: rnd(-160, 120),
      ph: (i / 5) * TAU + rnd(0, 1),
      w: (i % 2 ? -1 : 1) * rnd(0.055, 0.10),   // angular speed, both directions
      p: V3(), v: V3(), yaw: 0,
      /* what makes a hull a carrier (the metro train is one too, 76-metro.js):
         its box, how generously a web may find it, and where a rider walks */
      hx: PLANE_HX, hy: PLANE_HY, hz: PLANE_HZ, reach: 2, deck: DECK_Y, walkX: 1.2, walkZ: 9.5,
      /* the attitude the hull is drawn and ridden at; flown by hand, it can be (89-pilot.js) */
      pitch: 0, roll: i % 2 ? PLANE_BANK : -PLANE_BANK, oy: 0, flyable: true, flown: false, turnRate: 0, cruise: 0, boost: 0
    };
    pl.cruise = pl.r * Math.abs(pl.w);   // the speed it flies its circuit at, and is flown at
    planes.push(pl);
  }
}
/* every carrier moves itself: the aircraft here, the train in 76-metro.js,
   boats, kites, crane jibs and the wheel's cars (77-cranes-wheel.js) */
for (const b of boats) planes.push(b);
for (let i = 0; i < KITE_MAX; i++) { kites[i].off = i >= KITES_ON; planes.push(kites[i]); }
/* the autopilot. A hull being flown by hand steps with flyByHand instead (89-pilot.js) */
function flyPlane(pl, dt) {
  pl.boost = damp(pl.boost, 0, PLANE_BOOST_FALL, dt);
  pl.ph += pl.w * dt * (1 + pl.boost * PLANE_BOOST / pl.cruise);   // the circuit, faster by what boost is left
  pl.oy *= Math.exp(-dt / 7);            // a hand-back off its circuit's height eases back onto it
  const px = pl.cx + Math.cos(pl.ph) * pl.r, pz = pl.cz + Math.sin(pl.ph) * pl.r;
  const py = pl.y + Math.sin(pl.ph * 2.1) * 6 + pl.oy;
  pl.v.set(px - pl.p.x, py - pl.p.y, pz - pl.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
  pl.p.set(px, py, pz);
  /* nose points along the tangent; bank into the turn */
  pl.yaw = Math.atan2(-Math.sin(pl.ph) * pl.w, Math.cos(pl.ph) * pl.w);
  pl.pitch = damp(pl.pitch, 0, 1.6, dt);
  pl.roll = damp(pl.roll, pl.w > 0 ? -PLANE_BANK : PLANE_BANK, 1.6, dt);
  drawPlane(pl);
}
function drawPlane(pl) {
  pl.mesh.position.copy(pl.p);
  pl.mesh.rotation.set(-pl.pitch, pl.yaw, pl.roll);
  /* the flames are as long as the thrust, and never quite still */
  const lit = pl.boost > 0.01;
  for (let i = 0; i < 2; i++) {
    const f = pl.flames[i];
    f.visible = lit;
    if (lit) f.scale.set(0.75 + 0.25 * pl.boost, 0.75 + 0.25 * pl.boost, pl.boost * FLAME_LEN * (1 + 0.14 * Math.sin(T * 43 + i * 2.1)));
  }
}
/* afloat, a boat sails its circle and rides the swell; beached, it sits */
function sailBoat(b, dt) {
  if (b.wet) b.th += b.w * dt;
  const x = b.wet ? b.cx + Math.cos(b.th) * b.r : b.x, z = b.wet ? b.cz + Math.sin(b.th) * b.r : b.z;
  const y = (b.wet ? Math.sin(T * 1.1 + b.ph) * 0.35 - 0.3 : 0) + BOAT_HY;
  b.v.set(x - b.p.x, y - b.p.y, z - b.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
  b.p.set(x, y, z);
  if (b.wet) b.yaw = Math.atan2(-Math.sin(b.th) * b.w, Math.cos(b.th) * b.w);
}
/* A kite flies down-wind of whoever holds it, nose into the breeze and its
   tail streaming behind: look up and you can read which way the air is going
   and how hard. In a calm it wanders in wide lazy circles; as the wind rises
   it is carried out along it and held there. (k.x, k.z) is the hand on the
   ground. Put a web on one and it takes you where the wind is going, sinking
   under you, faster the less wind there is to hold it up; let go and it is
   walked back out to where it flew. */
const KITE_LEAN = 0.32;    // metres down-wind per metre of height, in a full breeze
const KITE_LOW = 26;       // a dragged kite comes no lower than this
function flyKite(k, dt) {
  const ws = Math.hypot(WIND.x, WIND.z), fly = sstep(0.3, 3.6, ws);
  const hx = Math.cos(windHead), hz = Math.sin(windHead);
  k.held = 0;
  for (const w of player.webs) if (w.on && w.pl === k) k.held = 1;
  if (k.held) {
    const run = 1.2 + 0.75 * ws;
    k.ox += hx * run * dt; k.oz += hz * run * dt;
    k.oy = Math.max(KITE_LOW - k.y, k.oy - (0.7 + 2.3 * (1 - fly)) * dt);
  } else {
    const f = Math.exp(-dt / 25);
    k.ox *= f; k.oy *= f; k.oz *= f;
  }
  const a = T * 0.22 + k.ph, r = k.r * (1 - 0.6 * fly), out = k.y * KITE_LEAN * fly;
  k.a = a; k.fly = fly;
  const x = k.x + hx * out + Math.cos(a) * r + k.ox, y = k.y + Math.sin(a * 1.6) * 5 + k.oy, z = k.z + hz * out + Math.sin(a) * r + k.oz;
  k.v.set(x - k.p.x, y - k.p.y, z - k.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
  k.p.set(x, y, z);
}
function updatePlanes(dt) {
  for (const pl of planes) if (!pl.off) pl.step(pl, dt);
}
/* A hull's frame. Every carrier turns about the vertical (yaw); an aircraft
   also has an attitude, pitch nose-up and roll right-wing-down, turned first
   and in the order its mesh is (YXZ): bank, then nose, then heading. These
   two turn a vector between the frames, an offset or a direction alike, so
   riding, boarding, landing and aiming all see one and the same hull. */
function hullToWorld(pl, x, y, z, out) {
  if (pl.pitch || pl.roll) {
    const cr = Math.cos(pl.roll), sr = Math.sin(pl.roll), cp = Math.cos(pl.pitch), sp = Math.sin(pl.pitch);
    const x1 = x * cr - y * sr, y1 = x * sr + y * cr;
    x = x1; y = y1 * cp + z * sp; z = z * cp - y1 * sp;
  }
  const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
  return out.set(x * c + z * sn, y, z * c - x * sn);
}
function worldToHull(pl, x, y, z, out) {
  const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
  const x1 = x * c - z * sn, z1 = x * sn + z * c;
  if (!pl.pitch && !pl.roll) return out.set(x1, y, z1);
  const cr = Math.cos(pl.roll), sr = Math.sin(pl.roll), cp = Math.cos(pl.pitch), sp = Math.sin(pl.pitch);
  const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
  return out.set(x1 * cr + y2 * sr, y2 * cr - x1 * sr, z2);
}
/* local offset -> world, so a latched anchor rides the hull, and back */
function planePoint(pl, lx, ly, lz, out) { return hullToWorld(pl, lx, ly, lz, out).add(pl.p); }
function worldToPlane(pl, wx, wy, wz, out) { return worldToHull(pl, wx - pl.p.x, wy - pl.p.y, wz - pl.p.z, out); }
/* Slab test against each hull, in the hull's own frame: a crane jib is a long
   thin box turned to wherever it is pointing, and a world-aligned box round
   it would catch rays a jib's length away. A sphere round each hull turns
   most of them away before the slab test. No arrays: this runs for every aim
   ray, every frame. */
const _ph2 = { t: 0, x: 0, y: 0, z: 0, pl: null }, _rayO = V3(), _rayD = V3();
function rayHitPlanes(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, hitPl = null;
  for (const pl of planes) {
    if (pl.off) continue;
    const ex = pl.hx + pl.reach, ey = pl.hy + pl.reach * 0.5, ez = pl.hz + pl.reach;
    const qx = pl.p.x - ox, qy = pl.p.y - oy, qz = pl.p.z - oz;
    const tc = qx * dx + qy * dy + qz * dz, r2 = ex * ex + ey * ey + ez * ez;
    if (tc < -Math.sqrt(r2) || tc - Math.sqrt(r2) > best) continue;
    if (qx * qx + qy * qy + qz * qz - tc * tc > r2) continue;
    /* the ray in the hull's frame, about the hull's centre */
    worldToHull(pl, -qx, -qy, -qz, _rayO); worldToHull(pl, dx, dy, dz, _rayD);
    let t0 = 0.02, t1 = best, ok = true;
    for (let a = 0; a < 3 && ok; a++) {
      const o = a === 0 ? _rayO.x : a === 1 ? _rayO.y : _rayO.z;
      const d = a === 0 ? _rayD.x : a === 1 ? _rayD.y : _rayD.z;
      const h = a === 0 ? ex : a === 1 ? ey : ez;
      if (Math.abs(d) < 1e-8) { if (o < -h || o > h) ok = false; continue; }
      const inv = 1 / d;
      let n = (-h - o) * inv, f = (h - o) * inv;
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
const KITE_SCALE = V3(1.6, 1.6, 1.6);
/* what is drawn is where the carriers are */
function updateProps(t) {
  const { m, q, e, p } = scratch;
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i];
    e.set(b.wet ? Math.sin(t * 0.9 + b.ph) * 0.08 : 0.12, b.yaw, b.wet ? Math.cos(t * 0.7 + b.ph) * 0.06 : 0.05);
    m.compose(p.set(b.p.x, b.p.y - BOAT_HY, b.p.z), q.setFromEuler(e), UNIT);
    boats.mesh.setMatrixAt(i, m);
  }
  boats.mesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < KITES_ON; i++) {
    const k = kites[i], a = k.a, fly = k.fly || 0;
    /* a dragged kite stands up in the wind, nose high */
    e.set(Math.sin(a * 1.7) * (0.5 - 0.3 * fly) - 0.35 * fly - 0.5 * k.held, -PI / 2 - windHead + Math.sin(a * 1.3) * (0.9 - 0.7 * fly), Math.cos(a * 1.3) * 0.4);
    m.compose(k.p, q.setFromEuler(e), KITE_SCALE);
    kites.mesh.setMatrixAt(i, m);
  }
  kites.mesh.instanceMatrix.needsUpdate = true;
}
