/* =====================================================================
   THE METRO
   ---------------------------------------------------------------------
   The only things in the city that moved and could be used were the
   aircraft, all of them high. The metro is the low one: an elevated line up
   the gap between the blocks (METRO, 10-world.js), and a train that shuttles
   along it, slowing into each end and out again.

   The viaduct is ordinary solid boxes: land on the deck, hang a web from its
   underside, fly between its piers. The train is a CARRIER, exactly as an
   aircraft is (it lives in `planes`): a web can latch it and be towed, and E
   boards its roof. The line runs due north-south, so the train's box is
   axis-aligned and exact, not the loose box a turning aircraft gets.
   ===================================================================== */
for (let b = METRO.box0; b < METRO.box1; b++) hashBox(b);    // see 65-broadphase.js for why only now

const TRAIN_CARS = 3, CAR_LEN = 17, CAR_GAP = 1.2, CAR_W = 3.1, CAR_H = 3.3;
const TRAIN_HZ = (TRAIN_CARS * CAR_LEN + (TRAIN_CARS - 1) * CAR_GAP) / 2;
const TRAIN_Y = METRO.top + 0.55 + CAR_H / 2;              // centre of the cars, riding on bogies above the deck
const TRAIN_W = 0.066;                                     // rad/s of the shuttle: a little over 28 m/s at mid-line
const TRAIN_A = (METRO.z1 - METRO.z0) / 2 - TRAIN_HZ - 5;  // how far either side of the middle it runs
{
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  /* the viaduct: deck, parapets, rails, piers with a cap each */
  const zc = (METRO.z0 + METRO.z1) / 2, len = METRO.z1 - METRO.z0, parts = [
    { geo: BOXB, matrix: M4(METRO.x, METRO.top - METRO.thick, zc, METRO.w, METRO.thick, len), color: 0xb9b4a8 },
    { geo: BOXB, matrix: M4(METRO.x - METRO.w / 2 + 0.2, METRO.top, zc, 0.4, 0.75, len), color: 0xa9a498 },
    { geo: BOXB, matrix: M4(METRO.x + METRO.w / 2 - 0.2, METRO.top, zc, 0.4, 0.75, len), color: 0xa9a498 },
    { geo: BOXB, matrix: M4(METRO.x - 0.72, METRO.top, zc, 0.12, 0.16, len), color: 0x4a4d52 },
    { geo: BOXB, matrix: M4(METRO.x + 0.72, METRO.top, zc, 0.12, 0.16, len), color: 0x4a4d52 }];
  for (const z of METRO.piers) {
    parts.push({ geo: BOXB, matrix: M4(METRO.x, 0, z, METRO.pierW, METRO.top - METRO.thick, METRO.pierD), color: 0xa7a296 });
    parts.push({ geo: BOXB, matrix: M4(METRO.x, METRO.top - METRO.thick - 1.0, z, METRO.w * 0.8, 1.0, METRO.pierD + 0.5), color: 0x9c978b });
  }
  const via = new THREE.Mesh(mergeGeos(parts), mat);
  via.castShadow = true; via.receiveShadow = true; via.matrixAutoUpdate = false; scene.add(via);

  /* the train, built about its own centre with +z along the line */
  const cars = [];
  for (let k = 0; k < TRAIN_CARS; k++) {
    const z = (k - (TRAIN_CARS - 1) / 2) * (CAR_LEN + CAR_GAP), y0 = -CAR_H / 2;
    cars.push(
      { geo: BOXB, matrix: M4(0, y0, z, CAR_W, CAR_H, CAR_LEN), color: 0xeee9dc },
      { geo: BOXB, matrix: M4(0, y0 + 1.55, z, CAR_W + 0.06, 0.95, CAR_LEN - 1.6), color: 0x1f2c35 },      // windows
      { geo: BOXB, matrix: M4(0, y0 + 0.95, z, CAR_W + 0.06, 0.34, CAR_LEN - 0.3), color: 0xd9a83a },      // turmeric stripe
      { geo: BOXB, matrix: M4(0, y0 + 0.3, z, CAR_W + 0.06, 0.2, CAR_LEN - 0.3), color: 0x2f8f83 },
      { geo: BOXB, matrix: M4(0, y0 + CAR_H, z, 1.5, 0.3, CAR_LEN * 0.5), color: 0x8d9093 },               // roof gear
      { geo: BOXB, matrix: M4(0, y0 - 0.5, z - CAR_LEN * 0.32, 2.3, 0.5, 2.6), color: 0x2a2c30 },          // bogies
      { geo: BOXB, matrix: M4(0, y0 - 0.5, z + CAR_LEN * 0.32, 2.3, 0.5, 2.6), color: 0x2a2c30 });
  }
  const mesh = new THREE.Mesh(mergeGeos(cars), mat);
  mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  planes.push({
    train: true, mesh, ph: 0.6, w: TRAIN_W,
    p: V3(METRO.x, TRAIN_Y, 0), v: V3(), yaw: 0,
    hx: CAR_W / 2, hy: CAR_H / 2, hz: TRAIN_HZ, reach: 0.8, deck: CAR_H / 2 + 0.3, walkX: 1.0, walkZ: TRAIN_HZ - 1
  });
}
const metroTrain = planes[planes.length - 1];
function updateTrain(pl, dt) {
  pl.ph += pl.w * dt;
  const z = (METRO.z0 + METRO.z1) / 2 + TRAIN_A * Math.sin(pl.ph);
  pl.v.set(0, 0, dt > 1e-5 ? (z - pl.p.z) / dt : 0);
  pl.p.z = z;
  pl.mesh.position.copy(pl.p);
}
metroTrain.p.z = (METRO.z0 + METRO.z1) / 2 + TRAIN_A * Math.sin(metroTrain.ph);
