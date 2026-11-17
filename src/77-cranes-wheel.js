/* =====================================================================
   CRANES AND THE FERRIS
   ---------------------------------------------------------------------
   Two more things that move and can be used, both slow.

   Tower cranes stand on two tech-park roofs (CRANES, 10-world.js). The mast
   is solid; the jib slews back and forth above the roof and is a carrier:
   hang a web from it and it carries you round, or come down on it and walk
   its length.

   A big wheel turns on the sand north of the marina. Each of its cars is a
   carrier: latch one and it lifts you, or stand on its roof and ride it over
   the top for the highest view on the beach.

   Neither structure is solid beyond the crane masts: a box cannot follow a
   rim that turns, so the wheel's frame is for looking at.
   ===================================================================== */
for (let b = CRANES.box0; b < CRANES.box1; b++) hashBox(b);    // see 65-broadphase.js

const CRANE_W = 0.06;          // rad/s of the slew at its fastest
const craneMat = new THREE.MeshLambertMaterial({ vertexColors: true });
{
  const Y = 0xe3ac1d, G = 0x55595e;
  const mastGeo = mergeGeos([
    { geo: BOXB, matrix: M4(0, 0, 0, 2.2, 1, 2.2), color: Y },
    { geo: BOXB, matrix: M4(0, 0, 0, 2.4, 0.04, 2.4), color: G }]);
  for (const c of CRANES) {
    const len = c.top - c.base;
    const mast = new THREE.Mesh(mergeGeos([
      { geo: BOXB, matrix: M4(0, 0, 0, 2.2, len, 2.2), color: Y },
      { geo: BOXB, matrix: M4(0, 0, 0, 4.2, 0.8, 4.2), color: G },                 // foot on the roof
      { geo: BOXB, matrix: M4(0, len - 2.2, -1.9, 1.8, 1.8, 1.6), color: 0xd8d2c4 } // the operator's cab
    ]), craneMat);
    mast.position.set(c.x, c.base, c.z); mast.castShadow = true; scene.add(mast);
    /* the turning part, about the top of the mast with +z along the jib */
    const jib = new THREE.Mesh(mergeGeos([
      { geo: BOXB, matrix: M4(0, 0, (c.jib - c.tail) / 2, 1.8, 1.8, c.jib + c.tail), color: Y },
      { geo: BOXB, matrix: M4(0, 1.8, 0, 1.2, 7, 1.2), color: Y },                     // the apex
      { geo: BOXB, matrix: M4(0, -1.6, -c.tail + 2.2, 2.6, 2.6, 3.6), color: 0x8e8a80 },// counterweight
      { geo: BOXB, matrix: M4(0, -0.5, c.jib * 0.7, 1.4, 0.5, 1.8), color: G },          // trolley
      { geo: BOXB, matrix: M4(0, -9.5, c.jib * 0.7, 0.05, 9, 0.05), color: 0x2a2a2a },   // its hoist line
      { geo: BOXB, matrix: M4(0, -10.6, c.jib * 0.7, 0.9, 1.1, 0.9), color: 0xc8432b }   // and hook block
    ]), craneMat);
    jib.position.set(c.x, c.top, c.z); jib.castShadow = true; scene.add(jib);
    const zc = (c.jib - c.tail) / 2, hz = (c.jib + c.tail) / 2;
    planes.push({
      kind: 'jib', step: slewJib, mesh: jib, crane: c, zc,
      ph: c.x * 0.013, y0: c.z * 0.017, w: CRANE_W,
      p: V3(c.x, c.top + 0.9, c.z), v: V3(), yaw: 0,
      hx: 0.9, hy: 0.9, hz, reach: 1.4, deck: 0.9 + RIDE_UP, walkX: 0.3, walkZ: hz - 0.8
    });
  }
}
/* the slew eases out to either side and back, as a driver would */
function slewJib(j, dt) {
  j.ph += j.w * dt;
  j.yaw = j.y0 + 1.5 * Math.sin(j.ph);
  const c = j.crane, x = c.x + Math.sin(j.yaw) * j.zc, z = c.z + Math.cos(j.yaw) * j.zc;
  j.v.set(x - j.p.x, 0, z - j.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
  j.p.set(x, c.top + 0.9, z);
  j.mesh.rotation.y = j.yaw;
}

/* ---- the wheel ---- */
const FERRIS = { x: 462, z: 222, y: 37, r: 30, cars: 16, w: 0.04, a: 0 };
const CAR_HX = 1.25, CAR_HY = 1.1, CAR_HANG = 1.7;     // a car's half-size, and how far below the rim it hangs
{
  /* nothing beached where the legs stand */
  for (const b of boats) if (!b.wet && Math.abs(b.z - FERRIS.z) < FERRIS.r + 6 && Math.abs(b.x - FERRIS.x) < 12) {
    b.z = FERRIS.z + Math.sign(b.z - FERRIS.z || 1) * (FERRIS.r + 8);
    b.p.z = b.z;
  }
  const W = 0xe9e4da, ST = 0x9aa3a8, parts = [];
  /* two rims, an axle between them, spokes out to each rim */
  for (const sx of [-2.4, 2.4]) {
    for (let i = 0; i < 40; i++) {
      const a = (i + 0.5) * TAU / 40, seg = FERRIS.r * TAU / 40 + 0.3;
      /* a box turned about x by -a points its z along the radius; a quarter
         turn more lays it along the rim */
      parts.push({ geo: BOX, matrix: new THREE.Matrix4().makeRotationX(-a - PI / 2).setPosition(sx, Math.sin(a) * FERRIS.r, Math.cos(a) * FERRIS.r)
        .multiply(new THREE.Matrix4().makeScale(0.45, 0.45, seg)), color: W });
    }
    for (let i = 0; i < FERRIS.cars; i++) {
      const a = i * TAU / FERRIS.cars;
      parts.push({ geo: BOX, matrix: new THREE.Matrix4().makeRotationX(-a).setPosition(sx, Math.sin(a) * FERRIS.r / 2, Math.cos(a) * FERRIS.r / 2)
        .multiply(new THREE.Matrix4().makeScale(0.16, 0.16, FERRIS.r)), color: ST });
    }
  }
  for (let i = 0; i < FERRIS.cars; i++) {          // the bars the cars hang from
    const a = i * TAU / FERRIS.cars;
    parts.push({ geo: BOX, matrix: M4(0, Math.sin(a) * FERRIS.r, Math.cos(a) * FERRIS.r, 5.2, 0.2, 0.2), color: ST });
  }
  parts.push({ geo: BOX, matrix: M4(0, 0, 0, 7, 1.6, 1.6), color: ST });
  const rim = new THREE.Mesh(mergeGeos(parts), craneMat);
  rim.position.set(FERRIS.x, FERRIS.y, FERRIS.z); rim.castShadow = true; scene.add(rim);
  FERRIS.rim = rim;
  /* the A-frame legs either side, which do not turn */
  const legs = [];
  for (const sx of [-4.2, 4.2]) for (const sz of [-1, 1]) {
    const lean = Math.atan2(FERRIS.r * 0.42, FERRIS.y), len = Math.hypot(FERRIS.r * 0.42, FERRIS.y);
    legs.push({ geo: BOXB, matrix: new THREE.Matrix4().makeRotationX(-sz * lean).setPosition(sx, 0, sz * FERRIS.r * 0.42)
      .multiply(new THREE.Matrix4().makeScale(0.9, len, 0.9)), color: ST });
  }
  legs.push({ geo: BOXB, matrix: M4(0, -0.2, 0, 12, 0.4, FERRIS.r * 0.84 + 4), color: 0xb7aa92 });
  const frame = new THREE.Mesh(mergeGeos(legs), craneMat);
  frame.position.set(FERRIS.x, 0, FERRIS.z); frame.castShadow = true; scene.add(frame);
  /* the cars: one instance each, upright whatever the rim is doing */
  const CAR_COL = [0xc8432b, 0x2f8f83, 0xe3ac1d, 0x3a6ea5];
  const carGeo = mergeGeos([
    { geo: BOXB, matrix: M4(0, -CAR_HY, 0, CAR_HX * 2, CAR_HY * 2, CAR_HX * 2), color: 0xffffff },
    { geo: BOXB, matrix: M4(0, -0.1, 0, CAR_HX * 2 + 0.06, 0.7, CAR_HX * 2 - 0.5), color: 0x1f2c35 },
    { geo: BOXB, matrix: M4(0, CAR_HY, 0, 0.15, CAR_HANG - 0.2, 0.15), color: ST }]);
  const carMesh = new THREE.InstancedMesh(carGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), FERRIS.cars);
  carMesh.castShadow = true; carMesh.frustumCulled = false; scene.add(carMesh);
  const col = new THREE.Color();
  for (let i = 0; i < FERRIS.cars; i++) {
    carMesh.setColorAt(i, col.setHex(CAR_COL[i % 4]));
    planes.push({
      kind: 'car', step: turnCar, idx: i, a0: i * TAU / FERRIS.cars,
      p: V3(), v: V3(), yaw: 0,
      hx: CAR_HX, hy: CAR_HY, hz: CAR_HX, reach: 1.0, deck: CAR_HY + RIDE_UP, walkX: 0.5, walkZ: 0.5
    });
  }
  FERRIS.carMesh = carMesh;
}
/* the first car turns the wheel; every car hangs plumb below its bar */
function turnCar(c, dt) {
  if (c.idx === 0) { FERRIS.a += FERRIS.w * dt; FERRIS.rim.rotation.x = -FERRIS.a; }
  const a = c.a0 + FERRIS.a;
  const x = FERRIS.x, y = FERRIS.y + Math.sin(a) * FERRIS.r - CAR_HANG - CAR_HY, z = FERRIS.z + Math.cos(a) * FERRIS.r;
  c.v.set(x - c.p.x, y - c.p.y, z - c.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
  c.p.set(x, y, z);
  const arr = FERRIS.carMesh.instanceMatrix.array, o = c.idx * 16;
  arr[o] = 1; arr[o + 5] = 1; arr[o + 10] = 1; arr[o + 15] = 1;
  arr[o + 12] = x; arr[o + 13] = y + CAR_HY; arr[o + 14] = z;
  FERRIS.carMesh.instanceMatrix.needsUpdate = true;
}
