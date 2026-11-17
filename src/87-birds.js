/* =====================================================================
   BIRDS, AND A BELL: things that notice you
   ---------------------------------------------------------------------
   The city was a model: nothing in it knew you were there. Pigeons roost on
   the rooftops and gulls on the sand, and they do. Arrive at speed, land
   beside them, walk into them or put a web down next to them and the flock
   goes up, wheels over the place it left and comes back down on it.

   A flock in the air is a closed curve in time: every bird's path starts and
   ends on its own roosting spot and takes FLOCK_T seconds, so nothing is
   integrated, nothing drifts, and a flock is exactly where it was once it has
   settled. Only flocks in the air are touched each frame.

   Its own random stream, like the ring courses: the city is the same city
   whether or not this file exists.
   ===================================================================== */
const FLOCK_T = 11;            // seconds from the flush to the last bird down
const FLOCK_NEAR = 13;         // metres at which a flock minds you, if you are moving
const FLOCK_TOUCH = 4;         // metres at which it minds you however gently you come
const FLOCK_BIRDS = 8;
const flocks = [];
{
  let st = 0x51ed270b;
  const fr = () => (st = (st * 1664525 + 1013904223) >>> 0) / 4294967296;
  const add = (x, y, z, w, d, gull) => {
    const f = { x, y, z, gull, t: -1, cool: 0, birds: [] };
    for (let i = 0; i < FLOCK_BIRDS; i++) {
      f.birds.push({
        ox: (fr() - 0.5) * w, oz: (fr() - 0.5) * d, yaw: fr() * TAU,
        R: 9 + fr() * 9, H: 5 + fr() * 8, turns: fr() < 0.5 ? 2 : 3, dir: fr() < 0.5 ? -1 : 1,
        late: fr() * 0.5, ph: fr() * TAU
      });
    }
    flocks.push(f);
  };
  /* pigeons: a share of the roofs you actually land on */
  for (const b of buildings) {
    if (b.h < 16 || b.h > 85 || b.w < 9 || b.d < 9) continue;
    if (fr() < 0.22 && flocks.length < 44) add(b.x, b.h, b.z, Math.min(b.w, 14) - 3, Math.min(b.d, 14) - 3, false);
  }
  /* gulls: along the sand */
  for (let i = 0; i < 7; i++) add(SAND_X + 12 + fr() * (SEA_X - SAND_X - 24), 0, -400 + fr() * 690, 9, 9, true);
}
const V_BIRD = (() => {
  const wing = new THREE.PlaneGeometry(0.46, 0.24).rotateX(-PI / 2);
  return mergeGeos([
    { geo: BOX, matrix: M4(0, 0.07, 0, 0.13, 0.12, 0.34), color: 0xffffff },
    { geo: BOX, matrix: M4(0, 0.12, 0.2, 0.09, 0.09, 0.1), color: 0xd8d8d8 },
    { geo: wing, matrix: new THREE.Matrix4().makeRotationZ(0.42).setPosition(0.27, 0.19, 0), color: 0xe9e9e9 },
    { geo: wing, matrix: new THREE.Matrix4().makeRotationZ(-0.42).setPosition(-0.27, 0.19, 0), color: 0xe9e9e9 }]);
})();
const birdMesh = new THREE.InstancedMesh(V_BIRD,
  new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), flocks.length * FLOCK_BIRDS);
birdMesh.frustumCulled = false; scene.add(birdMesh);

/* where bird b of flock f is, u seconds after the flush (u < 0 or past
   FLOCK_T: on its spot). Writes the position into `out`, returns how far
   through its flight it is, 0..1 (0 when roosting). */
function birdAt(f, b, u, out) {
  const T = FLOCK_T - 0.5, v = clamp((u - b.late) / (T - 0.5), 0, 1);
  /* out and up quickly, round, and in again: radius and height both leave
     from the roost spot and return to it */
  const away = sstep(0, 0.16, v) * (1 - sstep(0.80, 1, v));
  const a = b.dir * TAU * b.turns * (v * v * (3 - 2 * v));
  const ca = Math.cos(a), sa = Math.sin(a);
  /* the spot turned about the roost centre, pushed out to the circling radius */
  const rx = b.ox * ca - b.oz * sa, rz = b.ox * sa + b.oz * ca, rl = Math.hypot(rx, rz) || 1;
  const rad = lerp(rl, b.R, away);
  out.set(f.x + rx / rl * rad, f.y + (b.H + 2.2 * Math.sin(a * 1.5 + b.ph)) * away, f.z + rz / rl * rad);
  return v > 0 && v < 1 ? v : 0;
}
function setFlock(fi, u) {
  const f = flocks[fi], { m, q, e, p, s } = scratch;
  for (let i = 0; i < FLOCK_BIRDS; i++) {
    const b = f.birds[i], v = birdAt(f, b, u, p);
    if (v > 0) {
      /* facing where it is going: where it will be a moment from now */
      const px = p.x, py = p.y, pz = p.z;
      birdAt(f, b, u + 0.08, p);
      const dx = p.x - px, dz = p.z - pz;
      p.set(px, py, pz);
      /* wings beat by turning the wing V inside out; quicker on the way up */
      const beat = Math.sin(u * (17 - 7 * v) + b.ph);
      q.setFromEuler(e.set(0, Math.atan2(dx, dz), -b.dir * 0.45 * sstep(0.1, 0.3, v) * (1 - sstep(0.75, 0.95, v))));
      m.compose(p, q, s.set(f.gull ? 1.8 : 1.25, (f.gull ? 1.8 : 1.25) * beat, f.gull ? 1.8 : 1.25));
    } else {
      q.setFromEuler(e.set(0, b.yaw, 0));
      m.compose(p, q, s.set(f.gull ? 0.75 : 0.5, f.gull ? 1.5 : 1.1, f.gull ? 1.5 : 1.1));   // wings folded
    }
    birdMesh.setMatrixAt(fi * FLOCK_BIRDS + i, m);
  }
}
{
  const c = new THREE.Color();
  flocks.forEach((f, fi) => {
    setFlock(fi, -1);
    for (let i = 0; i < FLOCK_BIRDS; i++) birdMesh.setColorAt(fi * FLOCK_BIRDS + i, c.copy(SRGB(f.gull ? 0xf4f2ea : (i % 3 ? 0x7d8794 : 0x9aa0a8))));
  });
  birdMesh.instanceMatrix.needsUpdate = true; birdMesh.instanceColor.needsUpdate = true;
}
function flushFlock(f) {
  if (f.t >= 0 || f.cool > 0) return false;
  f.t = 0; emit('flush', f.gull, f.x, f.y, f.z);
  return true;
}
function updateBirds(dt) {
  const P = player.p, fast = player.v.lengthSq() > 25 && !player.riding;
  let moved = false;
  for (let fi = 0; fi < flocks.length; fi++) {
    const f = flocks[fi];
    if (f.t >= 0) {
      f.t += dt; moved = true;
      if (f.t >= FLOCK_T) { f.t = -1; f.cool = 2.5; }
      setFlock(fi, f.t);
      continue;
    }
    if (f.cool > 0) { f.cool -= dt; continue; }
    const dx = P.x - f.x, dy = P.y - f.y, dz = P.z - f.z, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < FLOCK_TOUCH * FLOCK_TOUCH || (fast && d2 < FLOCK_NEAR * FLOCK_NEAR)) flushFlock(f);
  }
  if (moved) birdMesh.instanceMatrix.needsUpdate = true;
}
/* a web landing beside them is as good as you landing beside them */
listen('attach', (i) => {
  const a = player.webs[i].a;
  for (const f of flocks) {
    const dx = a.x - f.x, dy = a.y - f.y, dz = a.z - f.z;
    if (dx * dx + dy * dy + dz * dz < 100) flushFlock(f);
  }
  /* and the temple answers a web on its towers */
  const g = gopuramAt(a.x, a.y, a.z);
  if (g) emit('bell', g);
});
/* which gopuram a point is on, if any */
function gopuramAt(x, y, z) {
  for (const g of GOPURAMS) {
    if (Math.abs(x - g.x) < g.bw / 2 + 1 && Math.abs(z - g.z) < g.bd / 2 + 1 && y < g.h + 6) return g;
  }
  return null;
}
