/* =====================================================================
   THERMAL MOTES
   A thermal you cannot see is a thermal nobody finds. Dust and chaff torn
   off the hot sand mark each column: they rise, swirl, and recycle at the
   bottom. Read-only decoration — the physics is in thermalAt().
   ===================================================================== */
const MOTE_GEO = new THREE.BoxGeometry(1.5, 0.08, 0.95);
const moteMat = new THREE.MeshLambertMaterial({
  vertexColors: false, color: SRGB(0xd8c49a), transparent: true, opacity: 0.5, depthWrite: false });
const MOTES_PER = 62;
const motes = [];
const moteMesh = new THREE.InstancedMesh(MOTE_GEO, moteMat, THERMALS.length * MOTES_PER);
moteMesh.frustumCulled = false; moteMesh.castShadow = false;
scene.add(moteMesh);
for (const t of THERMALS) {
  for (let i = 0; i < MOTES_PER; i++) {
    motes.push({
      t,
      rad: Math.sqrt(rnd(0.02, 0.85)) * t.r,   // sqrt keeps them evenly spread, not clumped on the axis
      ang: rnd(0, TAU),
      ph: rnd(0, 1),                            // where it is in its climb
      spin: rnd(0.6, 2.4) * (R() < 0.5 ? -1 : 1),
      rise: rnd(0.55, 1.0)                      // fraction of the column climbed per cycle time
    });
  }
}
/* A faint haze column so a thermal is legible from across the bay, not just
   when you are inside it. Same trick as the lighthouse beam: a translucent
   shell that never writes depth. */
const MOTE_TOP = 190, MOTE_CYCLE = 26;
for (const t of THERMALS) {
  const haze = new THREE.Mesh(
    new THREE.CylinderGeometry(t.r * 0.30, t.r * 0.80, MOTE_TOP, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8d3a6, transparent: true, opacity: 0.05,
      side: THREE.DoubleSide, depthWrite: false }));
  haze.position.set(t.x, MOTE_TOP / 2 + 3, t.z);
  haze.frustumCulled = false;
  scene.add(haze);
}
function updateMotes(t) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = V3();
  for (let i = 0; i < motes.length; i++) {
    const o = motes[i];
    const p = (o.ph + (t / MOTE_CYCLE) * o.rise) % 1;
    const y = 4 + p * MOTE_TOP;
    /* the column leans and narrows as it climbs, so it reads as a rising body
       of air rather than a cylinder of confetti */
    const swirl = o.ang + y * 0.018 + t * 0.06;
    const spread = 1 - 0.45 * p;
    v.set(o.t.x + Math.cos(swirl) * o.rad * spread, y, o.t.z + Math.sin(swirl) * o.rad * spread);
    e.set(t * o.spin, swirl, Math.sin(t * o.spin * 0.7) * 0.9);
    /* fade in at the bottom and out at the top instead of popping */
    const s = 1.9 * sstep(0, 0.06, p) * (1 - sstep(0.74, 1, p));
    m.compose(v, q.setFromEuler(e), V3(s, s, s));
    moteMesh.setMatrixAt(i, m);
  }
  moteMesh.instanceMatrix.needsUpdate = true;
}
