/* =====================================================================
   WATER CONTACT FX
   Expanding rings on the surface where a body enters or skims. A small
   ring pool, reused round-robin, so a fast skim leaves a trail of them.
   ===================================================================== */
const SPLASH_RINGS = 7;
const splashGeo = new THREE.RingGeometry(0.62, 1.0, 22).rotateX(-PI / 2);
const splashes = [];
for (let i = 0; i < SPLASH_RINGS; i++) {
  const m = new THREE.Mesh(splashGeo, new THREE.MeshBasicMaterial({
    color: 0xe4efee, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  m.visible = false; m.frustumCulled = false; m.renderOrder = 6;
  scene.add(m);
  splashes.push({ m, t: 1e9, dur: 1, r0: 1 });
}
let splashNext = 0, splashCool = 0;
/* power is the closing speed, so a dive reads bigger than a graze */
function splash(x, y, z, power) {
  if (splashCool > 0) return;
  splashCool = 0.09;
  const s = splashes[splashNext++ % SPLASH_RINGS];
  s.m.position.set(x, y + 0.09, z);
  s.t = 0;
  s.dur = 0.65 + clamp(power * 0.016, 0, 0.65);
  s.r0 = 1.1 + clamp(power * 0.085, 0, 4.2);
  s.m.visible = true;
  if (typeof splashSound === 'function') splashSound(clamp(Math.abs(power) / 42, 0.12, 1));
}
function updateSplashes(dt) {
  if (splashCool > 0) splashCool -= dt;
  for (const s of splashes) {
    if (s.t >= s.dur) { if (s.m.visible) s.m.visible = false; continue; }
    s.t += dt;
    const p = clamp(s.t / s.dur, 0, 1);
    const r = s.r0 * (0.35 + 3.4 * p);
    s.m.scale.set(r, 1, r);
    s.m.material.opacity = 0.5 * (1 - p) * (1 - p);
  }
  /* skimming leaves a wake even without a fresh entry */
  if (player.inWater && player.depth < 1.2) {
    const sp = Math.hypot(player.v.x, player.v.z);
    if (sp > 22) splash(player.p.x, player.p.y + player.depth, player.p.z, sp * 0.28);
  }
}
