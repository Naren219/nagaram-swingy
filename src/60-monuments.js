/* =====================================================================
   MONUMENTS  (gopurams, vimana, mandapam, walls, tank, bridges, masts)
   ===================================================================== */
const monParts = [];
function push(parts, world) {
  for (const p of parts) monParts.push({ geo: p.geo, color: p.color, matrix: world ? world.clone().multiply(p.matrix) : p.matrix });
}
const STONE = 0x9a917f, LIME = 0xe9e3d4, GOLD = 0xc9992e;
const BANDS = [0xe6dfcd, 0xcf6a4a, 0xe0a93b, 0x2f7f6a, 0xd8d1bd, 0x8e3f6a];
const VAULT = new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, PI).rotateZ(PI / 2);
const CONE = new THREE.ConeGeometry(1, 1, 10).translate(0, 0.5, 0);
const SPH = new THREE.SphereGeometry(1, 10, 8);

function gopuramParts(h, lng, shrt) {
  const p = [], tiers = 9, plinth = h * 0.14, tierH = (h - plinth) / (tiers + 1.1);
  p.push({ geo: BOXB, matrix: M4(0, 0, 0, lng, plinth, shrt), color: STONE });
  p.push({ geo: BOXB, matrix: M4(0, 0, 0, lng * 1.06, plinth * 0.14, shrt * 1.06), color: 0x6f6a5f });
  /* gateway void suggested by two dark jambs */
  p.push({ geo: BOXB, matrix: M4(0, 0, 0, lng * 0.26, plinth * 0.92, shrt * 1.02), color: 0x2a2723 });
  let y = plinth, w = lng * 0.94, d = shrt * 0.94;
  for (let i = 0; i < tiers; i++) {
    const w1 = w * 0.885, d1 = d * 0.885;
    p.push({ geo: taper(w, d, w1, d1, tierH), matrix: M4(0, y, 0), color: i % 2 ? LIME : 0xded3ba });
    p.push({ geo: BOXB, matrix: M4(0, y + tierH * 0.80, 0, w * 1.07, tierH * 0.15, d * 1.07), color: BANDS[i % BANDS.length] });
    const n = Math.max(3, Math.round(w / 2.9));
    for (let k = 0; k < n; k++) {
      const fx = (-0.5 + (k + 0.5) / n) * w * 0.9;
      for (const s of [-1, 1]) p.push({ geo: BOXB, matrix: M4(fx, y + tierH * 0.16, s * d * 0.5, (w * 0.9 / n) * 0.6, tierH * 0.56, 0.55), color: BANDS[(i + k) % BANDS.length] });
    }
    const nd = Math.max(2, Math.round(d / 2.9));
    for (let k = 0; k < nd; k++) {
      const fz = (-0.5 + (k + 0.5) / nd) * d * 0.9;
      for (const s of [-1, 1]) p.push({ geo: BOXB, matrix: M4(s * w * 0.5, y + tierH * 0.16, fz, 0.55, tierH * 0.56, (d * 0.9 / nd) * 0.6), color: BANDS[(i + k + 3) % BANDS.length] });
    }
    y += tierH; w = w1; d = d1;
  }
  p.push({ geo: VAULT, matrix: M4(0, y, 0, w * 1.05, d * 0.85, d * 0.85), color: LIME });
  p.push({ geo: BOXB, matrix: M4(0, y - 0.4, 0, w * 1.12, 0.7, d * 1.12), color: 0xcf6a4a });
  const kn = 5;
  for (let k = 0; k < kn; k++) {
    const kx = (-0.5 + (k + 0.5) / kn) * w * 0.9;
    p.push({ geo: SPH, matrix: M4(kx, y + d * 0.85 + 0.7, 0, 0.55, 0.7, 0.55), color: GOLD });
    p.push({ geo: CONE, matrix: M4(kx, y + d * 0.85 + 1.1, 0, 0.42, 1.5, 0.42), color: GOLD });
  }
  return p;
}
for (const g of GOPURAMS) {
  const lng = Math.max(g.bw, g.bd), shrt = Math.min(g.bw, g.bd);
  const world = new THREE.Matrix4().compose(V3(g.x, 0, g.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g.rot, 0)), V3(1, 1, 1));
  push(gopuramParts(g.h, lng, shrt), world);
}
/* prakaram walls, capped with a red-and-white kumkum stripe */
for (const l of landmarks) {
  if (l.type !== 'wall') continue;
  push([{ geo: BOXB, matrix: M4(l.x, 0, l.z, l.w, l.h, l.d), color: LIME },
        { geo: BOXB, matrix: M4(l.x, l.h, l.z, l.w * 1.04, 0.8, l.d * 2.6), color: 0xcf6a4a }]);
  const along = l.w > l.d;
  const n = 26;
  for (let i = 0; i < n; i++) {
    const t = (-0.5 + (i + 0.5) / n);
    push([{ geo: BOXB, matrix: M4(l.x + (along ? t * l.w : 0), 0, l.z + (along ? 0 : t * l.w), along ? 3.2 : l.d * 1.6, l.h * 0.97, along ? l.d * 1.6 : 3.2), color: i % 2 ? 0xcf3a2a : 0xf0ead8 }]);
  }
}
/* vimana over the sanctum */
{
  const p = []; let y = 0, w = 34, d = 34;
  for (let i = 0; i < 6; i++) {
    const w1 = w * 0.83;
    p.push({ geo: taper(w, d, w1, w1, 6.6), matrix: M4(0, y, 0), color: i === 0 ? STONE : LIME });
    p.push({ geo: BOXB, matrix: M4(0, y + 5.4, 0, w * 1.06, 1.1, d * 1.06), color: BANDS[(i + 1) % BANDS.length] });
    y += 6.6; w = w1; d = w1;
  }
  p.push({ geo: SPH, matrix: M4(0, y + 1.5, 0, 5.2, 4.2, 5.2), color: GOLD });
  p.push({ geo: CONE, matrix: M4(0, y + 4.6, 0, 1.5, 5.5, 1.5), color: GOLD });
  push(p);
  addBox(0, 39.6, 0, 10, 12, 10);
}
/* pillared mandapam */
{
  const p = [{ geo: BOXB, matrix: M4(0, 10.4, -62, 62, 1.9, 38), color: STONE },
             { geo: BOXB, matrix: M4(0, 12.3, -62, 56, 1.1, 33), color: 0xcf6a4a }];
  for (let i = -4; i <= 4; i++) for (let j = -2; j <= 2; j++) {
    p.push({ geo: BOXB, matrix: M4(i * 6.6, 0, -62 + j * 7.8, 1.5, 10.4, 1.5), color: 0xa79c86 });
    p.push({ geo: BOXB, matrix: M4(i * 6.6, 9.2, -62 + j * 7.8, 2.4, 1.2, 2.4), color: 0x8d8371 });
  }
  push(p);
}
/* temple tank: granite steps */
{
  const p = [];
  for (let i = 0; i < 5; i++) {
    const s = 104 - i * 6;
    p.push({ geo: BOXB, matrix: M4(-196, -0.1 - i * 0.9, 152, s, 1.0, s), color: i % 2 ? 0x8f877a : 0x7f7669 });
  }
  push(p);
}
/* bridges */
for (const l of landmarks) {
  if (l.type !== 'bridge') continue;
  const p = [{ geo: BOXB, matrix: M4(l.x, 7.4, l.z, 20, 1.5, l.len), color: 0x83807a }];
  for (const s of [-1, 1]) {
    p.push({ geo: BOXB, matrix: M4(l.x + s * 10, 8.9, l.z, 0.6, 1.5, l.len), color: 0xd9d3c4 });
    for (let i = -3; i <= 3; i++) p.push({ geo: BOXB, matrix: M4(l.x + s * 9.4, 10.4, l.z + i * (l.len / 7), 0.35, 4.5, 0.35), color: 0x4a4a48 });
  }
  for (let i = -1; i <= 1; i += 2) p.push({ geo: BOXB, matrix: M4(l.x, 0, l.z + i * l.len * 0.22, 18, 7.4, 5), color: 0x6f6c66 });
  push(p);
}
/* lattice masts */
for (const l of landmarks) {
  if (l.type !== 'mast') continue;
  const p = [];
  const seg = 8, sh = l.h / seg;
  for (let i = 0; i < seg; i++) {
    const w0 = lerp(7, 1.6, i / seg), w1 = lerp(7, 1.6, (i + 1) / seg);
    p.push({ geo: taper(w0, w0, w1, w1, sh), matrix: M4(l.x, i * sh, l.z), color: i % 2 ? 0xcf4632 : 0xe8e4db });
  }
  p.push({ geo: SPH, matrix: M4(l.x, l.h + 1, l.z, 0.9, 0.9, 0.9), color: 0xff3322 });
  push(p);
}
/* lighthouse */
{
  const p = [], H = 52;
  for (let i = 0; i < 8; i++) {
    const r0 = lerp(7.5, 4.2, i / 8), r1 = lerp(7.5, 4.2, (i + 1) / 8);
    p.push({ geo: new THREE.CylinderGeometry(r1, r0, H / 8, 16).translate(0, H / 16, 0), matrix: M4(452, i * H / 8, -96), color: i % 2 ? 0xcf3a2a : 0xf2ede0 });
  }
  p.push({ geo: new THREE.CylinderGeometry(6.6, 6.6, 1.4, 16).translate(0, 0.7, 0), matrix: M4(452, H, -96), color: 0x4c4a46 });
  p.push({ geo: new THREE.CylinderGeometry(3.6, 3.6, 5.0, 12).translate(0, 2.5, 0), matrix: M4(452, H + 1.4, -96), color: 0x22262a });
  p.push({ geo: CONE, matrix: M4(452, H + 6.4, -96, 4.4, 3.4, 4.4), color: 0xcf3a2a });
  push(p);
  addBox(452, 0, -96, 15, H + 8, 15);
}
const monuments = new THREE.Mesh(mergeGeos(monParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
monuments.castShadow = true; monuments.receiveShadow = true; monuments.frustumCulled = false;
scene.add(monuments);

/* lighthouse beam + lamp */
const beacon = new THREE.Mesh(
  new THREE.ConeGeometry(11, 190, 12, 1, true).rotateZ(PI / 2).translate(95, 0, 0),
  new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
beacon.position.set(452, 55.5, -96); scene.add(beacon);
/* marker showing exactly where a web would land */
/* Cyan, because every other colour in this city is warm — ochre facades, gold
   gopurams, turmeric HUD. A cool marker is the only thing that never sits on
   top of something its own colour. The dark backing ring keeps it readable
   against bright sky as well as against dark granite. */
const aimMat = new THREE.MeshBasicMaterial({ color: 0x3ef0ff, transparent: true,
  opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
const aimBack = new THREE.MeshBasicMaterial({ color: 0x05171c, transparent: true,
  opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
const aimMark = new THREE.Group();
{
  const mat = aimMat;
  aimMark.add(new THREE.Mesh(new THREE.RingGeometry(0.60, 0.98, 24), aimBack));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.70, 0.86, 24), mat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), mat);
  for (let k = 0; k < 4; k++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), mat);
    t.position.set(Math.cos(k * PI / 2) * 1.12, Math.sin(k * PI / 2) * 1.12, 0);
    t.rotation.z = k * PI / 2;
    aimMark.add(t);
  }
  aimMark.add(ring); aimMark.add(dot);
}
aimMark.renderOrder = 8; aimMark.visible = false; aimMark.frustumCulled = false;
scene.add(aimMark);

/* a faint guide from the character to the marker: shows the line the web would
   actually take, so the shot stops being a guess */
const guideGeo = new THREE.BufferGeometry();
guideGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const guide = new THREE.Line(guideGeo, new THREE.LineBasicMaterial({
  color: 0x3ef0ff, transparent: true, opacity: 0.30, depthWrite: false }));
guide.renderOrder = 7; guide.frustumCulled = false; guide.visible = false;
scene.add(guide);

const lampGlow = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8),
  new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
lampGlow.position.set(452, 55.5, -96); scene.add(lampGlow);

