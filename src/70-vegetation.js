/* =====================================================================
   VEGETATION
   ===================================================================== */
/* Vegetation used to be 85% of every frame: 866k triangles, drawn again for
   the shadow map, none of it ever culled. Two things keep it cheap now.
   The palms spend triangles only where they show (a coconut is not a
   140-triangle sphere), and the plants are batched by ground cell so the
   camera and the 270 m shadow frustum each draw only the cells they see. */
const NUT = new THREE.IcosahedronGeometry(1, 0);
/* a frond or leaf blade: one quad per side instead of a 12-triangle box */
function blade(w, len, tilt) {
  const a = new THREE.PlaneGeometry(w, len).translate(0, len / 2, 0);
  const g = mergeGeos([{ geo: a }, { geo: a.clone().rotateY(PI) }]);
  return g.rotateX(tilt);
}
function palmGeo(seed) {
  const p = []; let y = 0, xo = 0; const lean = (seed % 3 - 1) * 0.10;
  for (let i = 0; i < 5; i++) {
    const r0 = lerp(0.45, 0.24, i / 5), r1 = lerp(0.45, 0.24, (i + 1) / 5);
    /* open-ended: the next segment and the crown hide every cap */
    p.push({ geo: new THREE.CylinderGeometry(r1, r0, 2.05, 6, 1, true).translate(0, 1.02, 0), matrix: M4(xo, y, 0), color: i % 2 ? 0x8b7a5a : 0x7c6d50 });
    y += 1.98; xo += lean * (i + 1) * 0.16;
  }
  for (let k = 0; k < 4; k++) p.push({ geo: NUT, matrix: M4(xo + Math.cos(k * 1.7) * 0.5, y - 0.4, Math.sin(k * 1.7) * 0.5, 0.3, 0.3, 0.3), color: 0x6f7a3a });
  const f1 = blade(0.62, 4.05, 0.92), f2 = blade(0.5, 3.05, 1.45);
  for (let k = 0; k < 7; k++) p.push({ geo: f1, matrix: M4(xo, y, 0, 1, 1, 1, k * TAU / 7 + seed), color: k % 2 ? 0x3f6b30 : 0x4a7a35 });
  for (let k = 0; k < 5; k++) p.push({ geo: f2, matrix: M4(xo, y + 0.3, 0, 1, 1, 1, k * TAU / 5 + 0.4 + seed), color: 0x355c2a });
  return mergeGeos(p);
}
function treeGeo(seed) {
  const p = [{ geo: new THREE.CylinderGeometry(0.34, 0.6, 4.2, 8, 1, true).translate(0, 2.1, 0), matrix: M4(0, 0, 0), color: 0x5a4a35 }];
  /* the crowns keep their 80 triangles each: at 20 the silhouette goes
     visibly angular from the street, and culling already pays for them */
  const CROWN = new THREE.IcosahedronGeometry(1, 1);
  for (let k = 0; k < 5; k++) {
    const a = k * 1.9 + seed, r = k === 0 ? 0 : 1.9;
    p.push({ geo: CROWN, matrix: M4(Math.cos(a) * r, 4.6 + (k === 0 ? 0.9 : 0) + Math.sin(a * 2) * 0.7, Math.sin(a) * r, 2.5, 2.0, 2.5), color: k % 2 ? 0x2f5228 : 0x39632e });
  }
  return mergeGeos(p);
}
const vegMat = new THREE.MeshLambertMaterial({ vertexColors: true });
/* Plants lean with the wind (83-wind-signs.js): pushed over along it by the
   square of their height, so a trunk bends and its foot stays planted, with
   a slow gust travelling through the grove and a quick shiver in the crown.
   Applied after the instance transform, where +x and +z are the world's. The
   depth material carries the same bend, or the shadow would stand still
   under a moving tree. */
const PLANT_BEND = 0.0026;      // metres of lean per (m/s of wind) per (metre of height) squared
function plantSway(sh) {
  sh.uniforms.uWind = windUni.uWind; sh.uniforms.uTime = windUni.uTime;
  sh.vertexShader = 'uniform vec2 uWind;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <project_vertex>', `
    vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
    {
      vec4 wp = modelMatrix * mvPosition;
      float gust = 1.0 + 0.45 * sin(uTime * 1.3 + wp.x * 0.07 + wp.z * 0.05);
      float h = max(mvPosition.y, 0.0);
      mvPosition.xz += uWind * (h * h * ${PLANT_BEND} * gust)
        + vec2(sin(uTime * 4.7 + wp.x * 1.3), cos(uTime * 4.1 + wp.z * 1.1)) * (length(uWind) * 0.012 * smoothstep(5.0, 10.0, h));
    }
    mvPosition = modelViewMatrix * mvPosition;
    gl_Position = projectionMatrix * mvPosition;`);
}
const plantMat = vegMat.clone(); plantMat.onBeforeCompile = plantSway;
const plantDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); plantDepth.onBeforeCompile = plantSway;
const VEG_CELL = 220;
function scatter(geoFn, count, test, scaleLo, scaleHi) {
  const geos = [geoFn(0.3), geoFn(1.4), geoFn(2.7)];
  const picks = [[], [], []];
  let tries = 0;
  while (picks[0].length + picks[1].length + picks[2].length < count && tries < count * 26) {
    tries++;
    const x = rnd(-GHALF * 0.92, GHALF * 0.92), z = rnd(-GHALF * 0.92, GHALF * 0.92);
    if (!test(x, z)) continue;
    if (!freeAt(x, z, 2.4)) continue;
    if (onOpenGround(x, z, 2.4, 2.4)) continue;   // no palms on the pitch or in the tank
    picks[tries % 3].push([x, z]);
  }
  /* One batch per ground cell. It sits at the cell centre with its instances
     relative to that, so the shared geometry's bounding sphere, widened to
     cover a cell, is a correct culling volume for every batch. The three
     shapes alternate by cell rather than by plant: one draw call per cell
     instead of three, and yaw and scale still differ plant to plant. */
  const cells = new Map();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), pos = V3(), scl = V3();
  let reach = 0;
  for (const list of picks) {
    for (const [x, z] of list) {
      const s = rnd(scaleLo, scaleHi), ry = rnd(0, TAU), sy = s * rnd(0.9, 1.15);
      const ci = Math.floor(x / VEG_CELL), cj = Math.floor(z / VEG_CELL), key = ci + ':' + cj;
      let c = cells.get(key);
      if (!c) cells.set(key, c = { g: ((ci + 2 * cj) % 3 + 3) % 3, cx: (ci + 0.5) * VEG_CELL, cz: (cj + 0.5) * VEG_CELL, list: [] });
      const bs = geos[c.g].boundingSphere;
      c.list.push(x - c.cx, z - c.cz, s, sy, ry);
      reach = Math.max(reach, Math.hypot(x - c.cx, z - c.cz) + (bs.center.length() + bs.radius) * Math.max(s, sy));
    }
  }
  for (const g of geos) g.boundingSphere.set(V3(0, 0, 0), reach + 4);   // and room to lean
  const m = new THREE.Matrix4();
  for (const c of cells.values()) {
    const n = c.list.length / 5;
    const im = new THREE.InstancedMesh(geos[c.g], plantMat, n);
    im.customDepthMaterial = plantDepth;
    for (let i = 0; i < n; i++) {
      const [dx, dz, s, sy, ry] = c.list.slice(i * 5, i * 5 + 5);
      m.compose(pos.set(dx, 0, dz), q.setFromEuler(e.set(0, ry, 0)), scl.set(s, sy, s));
      im.setMatrixAt(i, m);
    }
    im.position.set(c.cx, 0, c.cz);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.frustumCulled = true;   // r128 switches culling off for every InstancedMesh
    im.matrixAutoUpdate = false; im.updateMatrix();
    vegBatches.push(im);
    scene.add(im);
  }
}
const vegBatches = [];
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

