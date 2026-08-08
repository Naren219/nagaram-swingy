/* =====================================================================
   CONTINUOUS TIME OF DAY
   The four presets become anchors on a slow clock; every lighting input
   is blended between the two adjacent presets each frame, so dusk and
   dawn actually happen instead of being a keypress most players never
   find. T skips to the next anchor.
   ===================================================================== */
const TODC = TOD.map(t => ({
  sun: V3(t.sun[0], t.sun[1], t.sun[2]).normalize(),
  sunC: new THREE.Color(t.sunC), top: new THREE.Color(t.top),
  mid: new THREE.Color(t.mid), bot: new THREE.Color(t.bot),
  hemiS: new THREE.Color(t.hemiS), hemiG: new THREE.Color(t.hemiG),
  fog: new THREE.Color(t.fog),
  sunI: t.sunI, hemiI: t.hemiI, fogD: t.fogD, night: t.night, cloud: t.cloud, exp: t.exp
}));
/* night appears twice so it holds as a plateau instead of peaking for an
   instant — the night city is the best-looking state, let it breathe */
const DAY_SEQ = [3, 0, 1, 2, 2];                  // dawn -> noon -> evening -> night (held)
const DAY_POS = [0, 0.30, 0.55, 0.72, 0.90, 1];   // where each anchor sits on the clock
const DAY_LEN = 600;                        // seconds per full cycle
let dayT = 0.55, curNight = TOD[1].night, lastEnvT = -10;
const DEEP_DAY = SRGB(0x0b3a46), DEEP_NIGHT = SRGB(0x04141c);
const SHAL_DAY = SRGB(0x1d7f80), SHAL_NIGHT = SRGB(0x0a2b34);
function daySeg() { let k = 0; while (dayT >= DAY_POS[k + 1]) k++; return k; }
function applyDay() {
  const k = daySeg();
  const a = TODC[DAY_SEQ[k]], b = TODC[DAY_SEQ[(k + 1) % DAY_SEQ.length]];
  const f = sstep(0, 1, (dayT - DAY_POS[k]) / (DAY_POS[k + 1] - DAY_POS[k]));
  skyUni.uSun.value.lerpVectors(a.sun, b.sun, f).normalize();
  skyUni.uSunCol.value.copy(a.sunC).lerp(b.sunC, f);
  skyUni.uTop.value.copy(a.top).lerp(b.top, f);
  skyUni.uMid.value.copy(a.mid).lerp(b.mid, f);
  skyUni.uBot.value.copy(a.bot).lerp(b.bot, f);
  skyUni.uCloud.value = lerp(a.cloud, b.cloud, f);
  sun.color.copy(skyUni.uSunCol.value); sun.intensity = lerp(a.sunI, b.sunI, f);
  hemi.color.copy(a.hemiS).lerp(b.hemiS, f);
  hemi.groundColor.copy(a.hemiG).lerp(b.hemiG, f);
  hemi.intensity = lerp(a.hemiI, b.hemiI, f);
  scene.fog.color.copy(a.fog).lerp(b.fog, f);
  scene.fog.density = lerp(a.fogD, b.fogD, f);
  renderer.toneMappingExposure = lerp(a.exp, b.exp, f);
  curNight = lerp(a.night, b.night, f);
  for (const s of facadeShaders) s.uniforms.uNight.value = curNight;
  waterUni.uSun.value.copy(skyUni.uSun.value);
  waterUni.uSunCol.value.copy(skyUni.uSunCol.value);
  waterUni.uNight.value = curNight;
  waterUni.uFogColor.value.copy(scene.fog.color);
  waterUni.uFogDensity.value = scene.fog.density;
  const nf = sstep(0.55, 0.85, curNight);
  waterUni.uDeep.value.copy(DEEP_DAY).lerp(DEEP_NIGHT, nf);
  waterUni.uShallow.value.copy(SHAL_DAY).lerp(SHAL_NIGHT, nf);
  /* the env cubemap only feeds glass reflections — an occasional refresh is
     plenty, and re-rendering it every frame would be pure waste */
  if (T - lastEnvT > 5) { lastEnvT = T; envDirty = true; }
}

