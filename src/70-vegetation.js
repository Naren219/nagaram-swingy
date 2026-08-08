/* =====================================================================
   VEGETATION
   ===================================================================== */
function palmGeo(seed) {
  const p = []; let y = 0, xo = 0; const lean = (seed % 3 - 1) * 0.10;
  for (let i = 0; i < 5; i++) {
    const r0 = lerp(0.45, 0.24, i / 5), r1 = lerp(0.45, 0.24, (i + 1) / 5);
    p.push({ geo: new THREE.CylinderGeometry(r1, r0, 2.05, 7).translate(0, 1.02, 0), matrix: M4(xo, y, 0), color: i % 2 ? 0x8b7a5a : 0x7c6d50 });
    y += 1.98; xo += lean * (i + 1) * 0.16;
  }
  for (let k = 0; k < 4; k++) p.push({ geo: SPH, matrix: M4(xo + Math.cos(k * 1.7) * 0.5, y - 0.4, Math.sin(k * 1.7) * 0.5, 0.3, 0.3, 0.3), color: 0x6f7a3a });
  const f1 = new THREE.BoxGeometry(0.62, 4.1, 0.07).translate(0, 2.0, 0).rotateX(0.92);
  const f2 = new THREE.BoxGeometry(0.5, 3.1, 0.07).translate(0, 1.5, 0).rotateX(1.45);
  for (let k = 0; k < 7; k++) p.push({ geo: f1, matrix: M4(xo, y, 0, 1, 1, 1, k * TAU / 7 + seed), color: k % 2 ? 0x3f6b30 : 0x4a7a35 });
  for (let k = 0; k < 5; k++) p.push({ geo: f2, matrix: M4(xo, y + 0.3, 0, 1, 1, 1, k * TAU / 5 + 0.4 + seed), color: 0x355c2a });
  return mergeGeos(p);
}
function treeGeo(seed) {
  const p = [{ geo: new THREE.CylinderGeometry(0.34, 0.6, 4.2, 8).translate(0, 2.1, 0), matrix: M4(0, 0, 0), color: 0x5a4a35 }];
  const ICO = new THREE.IcosahedronGeometry(1, 1);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.9 + seed, r = k === 0 ? 0 : 1.9;
    p.push({ geo: ICO, matrix: M4(Math.cos(a) * r, 4.6 + (k === 0 ? 0.9 : 0) + Math.sin(a * 2) * 0.7, Math.sin(a) * r, 2.5, 2.0, 2.5), color: k % 2 ? 0x2f5228 : 0x39632e });
  }
  return mergeGeos(p);
}
const vegMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function scatter(geoFn, count, test, scaleLo, scaleHi) {
  const geos = [geoFn(0.3), geoFn(1.4), geoFn(2.7)];
  const picks = [[], [], []];
  let tries = 0;
  while (picks[0].length + picks[1].length + picks[2].length < count && tries < count * 26) {
    tries++;
    const x = rnd(-GHALF * 0.92, GHALF * 0.92), z = rnd(-GHALF * 0.92, GHALF * 0.92);
    if (!test(x, z)) continue;
    if (!freeAt(x, z, 2.4)) continue;
    picks[tries % 3].push([x, z]);
  }
  for (let g = 0; g < 3; g++) {
    if (!picks[g].length) continue;
    const im = new THREE.InstancedMesh(geos[g], vegMat, picks[g].length);
    const m = new THREE.Matrix4();
    for (let i = 0; i < picks[g].length; i++) {
      const s = rnd(scaleLo, scaleHi);
      m.compose(V3(picks[g][i][0], 0, picks[g][i][1]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd(0, TAU), 0)), V3(s, s * rnd(0.9, 1.15), s));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.frustumCulled = false;
    scene.add(im);
  }
}
scatter(palmGeo, 760, (x, z) => {
  if (x > SAND_X - 6 && x < SEA_X - 10) return true;
  if (x > SEA_X - 8) return false;
  if (Math.abs(z - riverZ(x)) < RIVER_HW + 26 && Math.abs(z - riverZ(x)) > RIVER_HW + 4) return true;
  if (Math.abs(x) > EXT + 30 || Math.abs(z) > EXT + 30) return R() < 0.7;
  return onRoad(x, z) ? R() < 0.35 : R() < 0.12;
}, 0.85, 1.45);
scatter(treeGeo, 520, (x, z) => {
  if (x > SEA_X - 12) return false;
  if (Math.hypot(x, z) < TEMPLE.r + 30) return R() < 0.5;
  if (Math.abs(x) > EXT || Math.abs(z) > EXT) return R() < 0.55;
  return onRoad(x, z) ? R() < 0.22 : R() < 0.14;
}, 0.8, 1.5);

