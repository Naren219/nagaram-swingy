/* =====================================================================
   GROUND: painted from the block layout
   ===================================================================== */
const GTEX = 2048, GHALF = 900;
const gcan = document.createElement('canvas'); gcan.width = gcan.height = GTEX;
const gx = gcan.getContext('2d');
const w2c = (v) => (v + GHALF) / (GHALF * 2) * GTEX;
const s2c = (v) => v / (GHALF * 2) * GTEX;
(function paintGround() {
  gx.fillStyle = '#6f6a4e'; gx.fillRect(0, 0, GTEX, GTEX);
  /* dusty variation */
  for (let i = 0; i < 2600; i++) {
    const x = R() * GTEX, y = R() * GTEX, r = 20 + R() * 150;
    gx.fillStyle = `rgba(${120 + R() * 50 | 0},${110 + R() * 45 | 0},${75 + R() * 40 | 0},0.10)`;
    gx.beginPath(); gx.arc(x, y, r, 0, TAU); gx.fill();
  }
  /* fields / palm groves outside the city */
  gx.fillStyle = 'rgba(74,92,52,0.55)';
  gx.fillRect(0, 0, GTEX, s2c(GHALF - EXT - 40));
  gx.fillRect(0, w2c(EXT + 40), GTEX, GTEX - w2c(EXT + 40));
  gx.fillRect(0, 0, s2c(GHALF - EXT - 40), GTEX);
  /* compounds */
  for (let cx = -EXT; cx <= EXT; cx += PITCH) for (let cz = -EXT; cz <= EXT; cz += PITCH) {
    const d = districtAt(cx, cz);
    if (d === 'river') continue;
    gx.fillStyle = d === 'tech' ? 'rgba(96,102,96,0.5)'
      : d === 'oldtown' ? 'rgba(140,124,96,0.42)'
      : d === 'beach' ? 'rgba(196,176,132,0.5)' : 'rgba(126,118,94,0.36)';
    gx.fillRect(w2c(cx - PITCH / 2 + ROADW / 2), w2c(cz - PITCH / 2 + ROADW / 2),
      s2c(PITCH - ROADW), s2c(PITCH - ROADW));
  }
  /* roads */
  const drawRoad = (h, k) => {
    gx.strokeStyle = '#3b3a38'; gx.lineWidth = s2c(ROADW); gx.beginPath();
    if (h) { gx.moveTo(0, w2c(k)); gx.lineTo(GTEX, w2c(k)); } else { gx.moveTo(w2c(k), 0); gx.lineTo(w2c(k), GTEX); }
    gx.stroke();
    gx.strokeStyle = 'rgba(226,214,180,0.55)'; gx.lineWidth = Math.max(1, s2c(0.4));
    gx.setLineDash([s2c(5), s2c(6)]); gx.beginPath();
    if (h) { gx.moveTo(0, w2c(k)); gx.lineTo(GTEX, w2c(k)); } else { gx.moveTo(w2c(k), 0); gx.lineTo(w2c(k), GTEX); }
    gx.stroke(); gx.setLineDash([]);
  };
  for (let k = -EXT - PITCH; k <= EXT + PITCH; k += PITCH) { drawRoad(true, k); drawRoad(false, k); }
  /* temple plaza */
  gx.fillStyle = '#8d8778';
  gx.fillRect(w2c(-PW - 4), w2c(-PW - 4), s2c(PW * 2 + 8), s2c(PW * 2 + 8));
  gx.strokeStyle = 'rgba(230,220,190,0.35)'; gx.lineWidth = s2c(1.2);
  for (let i = -3; i <= 3; i++) {
    gx.beginPath(); gx.moveTo(w2c(-PW), w2c(i * 34)); gx.lineTo(w2c(PW), w2c(i * 34)); gx.stroke();
    gx.beginPath(); gx.moveTo(w2c(i * 34), w2c(-PW)); gx.lineTo(w2c(i * 34), w2c(PW)); gx.stroke();
  }
  /* temple tank */
  gx.fillStyle = '#7e7869'; gx.fillRect(w2c(-196 - 52), w2c(152 - 52), s2c(104), s2c(104));
  gx.fillStyle = '#20443f'; gx.fillRect(w2c(-196 - 40), w2c(152 - 40), s2c(80), s2c(80));
  /* cricket maidan */
  gx.fillStyle = '#5e6f3f'; gx.beginPath(); gx.arc(w2c(-300), w2c(-140), s2c(52), 0, TAU); gx.fill();
  gx.fillStyle = '#a99a72'; gx.fillRect(w2c(-306), w2c(-152), s2c(12), s2c(24));
  /* river */
  gx.strokeStyle = '#4a4530'; gx.lineWidth = s2c(RIVER_HW * 2 + 16); gx.beginPath();
  for (let x = -GHALF; x <= GHALF; x += 12) { const z = riverZ(x); x === -GHALF ? gx.moveTo(w2c(x), w2c(z)) : gx.lineTo(w2c(x), w2c(z)); }
  gx.stroke();
  gx.strokeStyle = '#26301f'; gx.lineWidth = s2c(RIVER_HW * 2); gx.beginPath();
  for (let x = -GHALF; x <= GHALF; x += 12) { const z = riverZ(x); x === -GHALF ? gx.moveTo(w2c(x), w2c(z)) : gx.lineTo(w2c(x), w2c(z)); }
  gx.stroke();
  /* beach + sea */
  const grad = gx.createLinearGradient(w2c(SAND_X - 30), 0, w2c(SEA_X + 10), 0);
  grad.addColorStop(0, 'rgba(214,196,152,0)'); grad.addColorStop(0.25, '#d9c79c');
  grad.addColorStop(0.9, '#e6d8b4'); grad.addColorStop(1, '#cdbb92');
  gx.fillStyle = grad; gx.fillRect(w2c(SAND_X - 30), 0, s2c(GHALF * 2), GTEX);
  gx.fillStyle = '#123a44'; gx.fillRect(w2c(SEA_X), 0, GTEX, GTEX);
  /* market tarps */
  for (let i = 0; i < 700; i++) {
    const x = rnd(-EXT, EXT), z = rnd(-EXT, EXT);
    if (districtAt(x, z) !== 'oldtown') continue;
    gx.fillStyle = pick(['#c1442f', '#2f7a5e', '#d6a12a', '#3b5fa8', '#b8532f']);
    gx.globalAlpha = 0.75;
    gx.fillRect(w2c(x), w2c(z), s2c(rnd(2, 5)), s2c(rnd(2, 5)));
  }
  gx.globalAlpha = 1;
})();
const groundTex = new THREE.CanvasTexture(gcan);
groundTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
groundTex.encoding = THREE.sRGBEncoding;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(GHALF * 2, GHALF * 2),
  new THREE.MeshLambertMaterial({ map: groundTex }));
ground.rotation.x = -PI / 2; ground.receiveShadow = true; ground.position.y = -0.02;
scene.add(ground);
/* far ground so the horizon is never empty */
const farGround = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000),
  new THREE.MeshLambertMaterial({ color: SRGB(0x5c6642) }));
farGround.rotation.x = -PI / 2; farGround.position.y = -0.35; scene.add(farGround);

/* western ghats silhouette */
{
  const hills = [];
  for (let i = 0; i < 26; i++) {
    const hx = -1100 - R() * 700, hz = rnd(-1600, 1600), hh = rnd(90, 320), hr = hh * rnd(2.2, 3.4);
    hills.push({ geo: new THREE.ConeGeometry(hr, hh, 7, 1), matrix: M4(hx, hh / 2, hz, 1, 1, 1, rnd(0, TAU)), color: 0x3d4a3a });
  }
  for (let i = 0; i < 10; i++) {
    const hz = rnd(-1800, -900), hx = rnd(-900, 500), hh = rnd(70, 180), hr = hh * 3;
    hills.push({ geo: new THREE.ConeGeometry(hr, hh, 7, 1), matrix: M4(hx, hh / 2, hz, 1, 1, 1, rnd(0, TAU)), color: 0x3d4a3a });
  }
  const hm = new THREE.Mesh(mergeGeos(hills), new THREE.MeshLambertMaterial({ vertexColors: true }));
  hm.frustumCulled = false; scene.add(hm);
}

