/* =====================================================================
   BUILDING INSTANCES
   ===================================================================== */
const groups = { res: [], old: [], glass: [] };
for (const b of buildings) groups[b.kind].push(b);
const matRes = hookFacade(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 0, 3.35, 3.35);
const matOld = hookFacade(new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }), 1, 3.05, 3.10);
const matGlass = hookFacade(new THREE.MeshPhongMaterial({
  color: 0xffffff, vertexColors: true, shininess: 64, specular: 0x333333, reflectivity: 0.35,
  envMap: envRT.texture, combine: THREE.MixOperation
}), 2, 2.4, 3.9);
const bMeshes = {};
for (const k of ['res', 'old', 'glass']) {
  const list = groups[k];
  const mesh = new THREE.InstancedMesh(BOXB_C, k === 'glass' ? matGlass : (k === 'old' ? matOld : matRes), list.length);
  const m = new THREE.Matrix4();
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    m.makeScale(b.w, b.h, b.d); m.setPosition(b.x, 0, b.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, SRGB(b.c));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh); bMeshes[k] = mesh;
}

/* rooftop clutter kit */
const roofKit = mergeGeos([
  { geo: CYL, matrix: M4(0, 0, 0, 2.2, 2.0, 2.2), color: 0x1b1b1e },          // sintex tank
  { geo: BOXB, matrix: M4(3.4, 0, 1.2, 3.0, 2.6, 2.6), color: 0xcfc6b0 },     // stair head
  { geo: BOXB, matrix: M4(-2.6, 0, -2.4, 1.6, 0.9, 1.2), color: 0x8e9296 },   // ac box
  { geo: CYL, matrix: M4(0, 2.0, 0, 0.35, 3.2, 0.35), color: 0x3a3a3c },      // mast
  { geo: BOXB, matrix: M4(-3.6, 0, 2.0, 0.24, 2.4, 0.24), color: 0x6b5b48 },  // laundry pole
  { geo: BOXB, matrix: M4(0.4, 0, 2.6, 0.24, 2.4, 0.24), color: 0x6b5b48 },
  { geo: BOXB, matrix: M4(-1.6, 2.1, 2.3, 3.9, 0.05, 0.05), color: 0xd9d4c6 },
  { geo: BOXB, matrix: M4(1.6, 0, -3.2, 2.0, 0.12, 1.3), color: 0x243a52 }    // solar panel
]);
const kitMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const roofCandidates = buildings.filter(b => b.w > 12 && b.d > 12 && b.kind !== 'glass');
const roofMesh = new THREE.InstancedMesh(roofKit, kitMat, roofCandidates.length);
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < roofCandidates.length; i++) {
    const b = roofCandidates[i];
    m.compose(V3(b.x + rnd(-b.w * 0.2, b.w * 0.2), b.h, b.z + rnd(-b.d * 0.2, b.d * 0.2)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd(0, TAU), 0)),
      V3(1, 1, 1).multiplyScalar(rnd(0.8, 1.15)));
    roofMesh.setMatrixAt(i, m);
  }
  roofMesh.instanceMatrix.needsUpdate = true;
  roofMesh.castShadow = true; roofMesh.receiveShadow = true; roofMesh.frustumCulled = false;
  scene.add(roofMesh);
}

