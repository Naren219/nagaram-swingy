/* =====================================================================
   SASH
   A length of gold cloth off the back of the shoulders. It is there to be
   read: it streams along the air going past, so speed, a dive, a glide, a
   crosswind and a thermal all show on the character without a number.

   It is simulated in the PLAYER'S frame: each point is an offset from where
   the cloth is pinned, and the wind it feels is the air's velocity minus
   yours. So a respawn cannot whip it, render interpolation cannot shake it,
   and in photo mode — body frozen mid-flight, velocity still in hand — it
   goes on streaming instead of falling limp.
   ===================================================================== */
const SASH_N = 9, SASH_SEG = 0.13;          // points, the first one pinned · metres between them
const SASH_DRAG = 0.17, SASH_G = 0.6;       // how hard the air takes it · how much of gravity it feels
const sashQ = new Float32Array(SASH_N * 3), sashPrev = new Float32Array(SASH_N * 3);
for (let i = 0; i < SASH_N; i++) sashQ[i * 3 + 1] = sashPrev[i * 3 + 1] = -i * SASH_SEG;
const sashGeo = new THREE.BufferGeometry();
{
  const col = new Float32Array(SASH_N * 6), idx = [];
  const gold = new THREE.Color(ACCENT).convertSRGBToLinear(), band = new THREE.Color(TEAL).convertSRGBToLinear();
  for (let i = 0; i < SASH_N; i++) {
    const c = i === SASH_N - 2 ? band : gold;          // one teal band near the free end
    for (let k = 0; k < 2; k++) { col[(i * 2 + k) * 3] = c.r; col[(i * 2 + k) * 3 + 1] = c.g; col[(i * 2 + k) * 3 + 2] = c.b; }
    if (i) { const a = i * 2 - 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  sashGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SASH_N * 6), 3));
  sashGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(SASH_N * 6), 3));
  sashGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sashGeo.setIndex(idx);
}
const sash = new THREE.Mesh(sashGeo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
sash.frustumCulled = false; scene.add(sash);
const sashPin = V3(), sashBack = V3(), sashSide = V3();
let sashPh = 0;     // phase of the ripple: it runs faster the faster the air does

function updateSash(dt) {
  /* where it is pinned, and which way the body's back and side face */
  spine.localToWorld(sashPin.set(-0.12, 0.57, 0.13));   // off the left shoulder blade
  const e = rig.matrixWorld.elements;
  sashSide.set(e[0], e[1], e[2]); sashBack.set(e[8], e[9], e[10]);
  /* the air going past: the breeze and any thermal, less your own velocity */
  const still = player.inWater, V = player.v;
  const wx = (still ? 0 : WIND.x) - V.x, wz = (still ? 0 : WIND.z) - V.z;
  const wy = (still ? 0 : thermalAt(player.p.x, player.p.y, player.p.z)) - V.y;
  const ws = Math.sqrt(wx * wx + wy * wy + wz * wz);

  /* a frame of no time (the first one can be) has no velocity to derive */
  const n = dt > 1e-5 ? clamp(Math.ceil(dt * 120), 1, 8) : 0, h = dt / (n || 1), q = sashQ, pv = sashPrev;
  sashPh += dt * (5 + ws * 0.32);
  for (let s = 0; s < n; s++) {
    for (let i = 1; i < SASH_N; i++) {
      const o = i * 3;
      let ux = (q[o] - pv[o]) / h, uy = (q[o + 1] - pv[o + 1]) / h, uz = (q[o + 2] - pv[o + 2]) / h;
      /* Cloth does not stream straight: a ripple runs down it, bigger toward
         the free end and in proportion to the air. The air is so much stronger
         than the cloth's weight that each segment simply points down-wind, so
         the ripple has to be a real fraction of the wind to bend it at all. */
      const rip = ws * 0.5 * (0.25 + 0.75 * i / SASH_N), a = sashPh - i * 1.25, b = sashPh * 0.77 - i * 0.9;
      const ax = wx + (sashSide.x * Math.sin(a) + sashBack.x * Math.cos(b) * 0.7) * rip;
      const ay = wy + (sashSide.y * Math.sin(a) + sashBack.y * Math.cos(b) * 0.7) * rip;
      const az = wz + (sashSide.z * Math.sin(a) + sashBack.z * Math.cos(b) * 0.7) * rip;
      /* Quadratic drag toward the air's velocity, taken implicitly: stepped
         forward it overshoots and explodes somewhere past 100 m/s. */
      const rx = ax - ux, ry = ay - uy, rz = az - uz;
      const k = SASH_DRAG * Math.sqrt(rx * rx + ry * ry + rz * rz) * h, f = k / (1 + k);
      ux += rx * f; uy += ry * f - G * SASH_G * h; uz += rz * f;
      pv[o] = q[o]; pv[o + 1] = q[o + 1]; pv[o + 2] = q[o + 2];
      q[o] += ux * h; q[o + 1] += uy * h; q[o + 2] += uz * h;
    }
    /* Two shared passes let a pull travel both ways along the cloth. The last
       pass is outward from the pin and exact: at 400 km/h the air moves a
       point further in one step than a segment is long, and relaxation alone
       left the cloth three times its length. */
    for (let it = 0; it < 3; it++) {
      const last = it === 2;
      for (let i = 1; i < SASH_N; i++) {
        const o = i * 3, m = o - 3;
        /* it stays behind the plane of the back, not through the body */
        const behind = q[o] * sashBack.x + q[o + 1] * sashBack.y + q[o + 2] * sashBack.z;
        if (behind < 0) { q[o] -= sashBack.x * behind; q[o + 1] -= sashBack.y * behind; q[o + 2] -= sashBack.z * behind; }
        const dx = q[o] - q[m], dy = q[o + 1] - q[m + 1], dz = q[o + 2] - q[m + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, c = (d - SASH_SEG) / d;
        /* the pin does not move; every other pair shares the correction */
        const wA = last || i === 1 ? 0 : 0.5, wB = 1 - wA;
        q[m] += dx * c * wA; q[m + 1] += dy * c * wA; q[m + 2] += dz * c * wA;
        q[o] -= dx * c * wB; q[o + 1] -= dy * c * wB; q[o + 2] -= dz * c * wB;
      }
    }
  }

  /* a ribbon: at each point, half a width either side, square to the cloth */
  const P = sashGeo.attributes.position.array, N = sashGeo.attributes.normal.array;
  for (let i = 0; i < SASH_N; i++) {
    const o = i * 3, a = Math.max(i - 1, 0) * 3, b = Math.min(i + 1, SASH_N - 1) * 3;
    let tx = q[b] - q[a], ty = q[b + 1] - q[a + 1], tz = q[b + 2] - q[a + 2];
    const tl = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    /* across the cloth is the body's side axis, less whatever of it lies along
       the cloth; streaming dead sideways, use the back axis instead */
    let sd = sashSide, dot = sd.x * tx + sd.y * ty + sd.z * tz;
    if (Math.abs(dot) > 0.94) { sd = sashBack; dot = sd.x * tx + sd.y * ty + sd.z * tz; }
    let cx = sd.x - tx * dot, cy = sd.y - ty * dot, cz = sd.z - tz * dot;
    const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1, hw = 0.075 - 0.02 * (i / (SASH_N - 1));
    cx /= cl; cy /= cl; cz /= cl;
    let nx = ty * cz - tz * cy, ny = tz * cx - tx * cz, nz = tx * cy - ty * cx;
    /* and it twists as it goes, more toward the free end and in faster air, so
       it is never edge-on along its whole length from anywhere */
    const tw = Math.sin(sashPh * 0.6 - i * 0.7) * 1.1 * (i / (SASH_N - 1)) * clamp(ws / 12, 0, 1), ct = Math.cos(tw), st = Math.sin(tw);
    const wx2 = cx * ct + nx * st, wy2 = cy * ct + ny * st, wz2 = cz * ct + nz * st;
    nx = nx * ct - cx * st; ny = ny * ct - cy * st; nz = nz * ct - cz * st;
    const px = sashPin.x + q[o], py = sashPin.y + q[o + 1], pz = sashPin.z + q[o + 2], v = i * 6;
    P[v] = px - wx2 * hw; P[v + 1] = py - wy2 * hw; P[v + 2] = pz - wz2 * hw;
    P[v + 3] = px + wx2 * hw; P[v + 4] = py + wy2 * hw; P[v + 5] = pz + wz2 * hw;
    N[v] = N[v + 3] = nx; N[v + 1] = N[v + 4] = ny; N[v + 2] = N[v + 5] = nz;
  }
  sashGeo.attributes.position.needsUpdate = true; sashGeo.attributes.normal.needsUpdate = true;
}
