/* =====================================================================
   MAIN LOOP
   ===================================================================== */
const clock = new THREE.Clock();
let acc = 0, T = 0, aimT = 0;
const pPrev = V3(0, 0, 0), pRender = V3(0, 0, 0);
const inp = { fwd: V3(), mx: 0, mz: 0, mzRaw: 0, jump: false, glide: false, tuck: false, reelIn: false, reelOut: false, zip: false, cling: false };
const sunOff = V3();

document.getElementById('load').classList.add('gone');
loadSettings();   // applyDay() runs on the first frame with whatever dayT survived

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());   // consumed even while paused, so
  if (resumeWait > 0 && !paused) {
    resumeWait -= dt;
    if (resumeWait <= 0 && document.pointerLockElement !== renderer.domElement) setFreeLook(true);
  }
  if (paused) { renderer.render(scene, camera); return; }   // resuming never jumps
  T += dt;
  if (keys['ArrowLeft']) yaw -= 2.3 * dt;
  if (keys['ArrowRight']) yaw += 2.3 * dt;
  if (keys['ArrowUp']) pitch = clamp(pitch + 1.7 * dt, -PITCH_MAX, PITCH_MAX);
  if (keys['ArrowDown']) pitch = clamp(pitch - 1.7 * dt, -PITCH_MAX, PITCH_MAX);
  freeLookStep(dt);
  updateCamDirs();

  /* ---- gather input ---- */
  const anyWeb = player.webs[0].on || player.webs[1].on;
  let fb = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  let rl = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  if (tstick.id !== -1) { fb = -tstick.y; rl = tstick.x; }   // stick overrides keys
  inp.fwd.copy(camFwd);
  inp.mzRaw = fb;
  let mfx = 0, mfz = 0;
  if (!anyWeb) { mfx += camFwd.x * fb; mfz += camFwd.z * fb; }
  mfx += camRight.x * rl; mfz += camRight.z * rl;
  const ml = Math.hypot(mfx, mfz);
  inp.mx = ml > 0.001 ? mfx / ml : 0; inp.mz = ml > 0.001 ? mfz / ml : 0;
  inp.jump = jumpEdge; jumpEdge = false;
  inp.glide = !!keys['Space'] && !player.grounded && !player.inWater;
  inp.tuck = !!keys['ShiftLeft'] || !!keys['ShiftRight'];
  inp.reelIn = anyWeb && fb > 0.25; inp.reelOut = anyWeb && fb < -0.25;
  inp.zip = !!keys['KeyQ'];
  inp.cling = !!keys['KeyE'];
  inp.mount = mountEdge; mountEdge = false;

  /* ---- fixed-step physics ---- */
  updateWind(T);
  if (!photoMode) dayT = (dayT + dt / DAY_LEN) % 1;
  applyDay();
  if (photoMode) {
    /* the player and aircraft freeze for the shot; the rest of the city lives on */
    acc = 0; pPrev.copy(player.p); pRender.copy(player.p);
  } else {
    acc += dt;
    let n = 0;
    /* Physics is a fixed 120 Hz accumulator, but the display samples it at
       whatever rate the monitor runs. On anything that isn't an exact multiple
       the substep count alternates (1,2,2,1,...) and the rendered position
       advances unevenly — which reads as constant shake. Interpolate between the
       last two physics states by the leftover accumulator instead. */
    updatePlanes(dt);   // hulls move first: riders and latched anchors read them
    while (acc >= SUB && n < 10) {
      pPrev.copy(player.p);
      stepPhysics(SUB, inp); acc -= SUB; n++; inp.jump = false;
    }
    if (n === 0) pPrev.copy(player.p);
    pRender.lerpVectors(pPrev, player.p, clamp(acc / SUB, 0, 1));
    if (player.p.y < -40) respawn();
  }

  /* ---- aim preview ---- */
  /* Solved every frame, not every 80 ms: while sweeping the view the old
     preview lagged a fifth of a second behind the crosshair, which is what
     made scanning for a building feel unreliable. */
  aimPt = photoMode ? null : findAnchor(camFwd, camRight, camUp, player.p, aimPt);
  aimOk = !!aimPt;
  for (let i = 0; i < 2; i++) {
    if (held[i] && !player.webs[i].on && aimPt && fireWebAt(i, aimPt)) thwip();
  }
  if (aimPt && !(player.webs[0].on && player.webs[1].on)) {
    aimMark.visible = true;
    _d.set(aimPt.x, aimPt.y, aimPt.z);
    /* glide between nearby targets, but snap when you swing onto a new building */
    if (aimMark.position.distanceTo(_d) > 14) aimMark.position.copy(_d);
    else aimMark.position.lerp(_d, 1 - Math.exp(-26 * dt));
    aimMark.scale.setScalar(clamp(aimPt.t * 0.021, 0.34, 2.6));
    /* dimmer when the assist picked it rather than your crosshair */
    aimMat.opacity = aimPt.off < 0.01 ? 0.95 : 0.52;
    aimBack.opacity = aimPt.off < 0.01 ? 0.55 : 0.30;
    const gp = guideGeo.attributes.position;
    gp.setXYZ(0, pRender.x, pRender.y + 0.9, pRender.z);
    gp.setXYZ(1, aimMark.position.x, aimMark.position.y, aimMark.position.z);
    gp.needsUpdate = true;
    guide.visible = true;
    guide.material.opacity = aimPt.off < 0.01 ? 0.26 : 0.14;
  } else { aimMark.visible = false; guide.visible = false; }
  if (missFlash > 0) missFlash -= dt;

  /* ---- world ---- */
  updateTraffic(dt);
  updateProps(T);
  skyUni.uTime.value = T; waterUni.uTime.value = T;
  sky.position.copy(camera.position);
  beacon.rotation.y = T * 0.9;
  const nite = curNight;
  beacon.visible = nite > 0.2; beacon.material.opacity = 0.055 * nite;
  lampGlow.material.color.setRGB(1, 0.95, 0.8).multiplyScalar(0.25 + nite * 0.75);

  if (!photoMode) poseRig(dt, inp);
  updateCamera(dt);
  if (aimMark.visible) aimMark.quaternion.copy(camera.quaternion);   // billboard after the camera settles

  /* shadow frustum follows the player */
  sunOff.copy(skyUni.uSun.value).multiplyScalar(260);
  sun.position.copy(pRender).add(sunOff);
  sun.target.position.copy(pRender);
  sun.target.updateMatrixWorld();

  /* wind */
  updateAudio(dt);
  if (windGain) {
    const s = player.v.length();
    windGain.gain.value = clamp((s - 6) / 90, 0, 1) * 0.55;
    windFilt.frequency.value = 220 + clamp(s * 14, 0, 1500);
  }

  if (envDirty) { envDirty = false; envCam.position.copy(camera.position); envCam.update(renderer, envScene); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.classList.remove('on'); }
  if (!photoMode) { drawMinimap(); updateHUD(dt); }
  /* contextual board button: shown exactly when E would board */
  if (touchOn) {
    const nearPl = !player.riding && !photoMode && !!boardablePlane(player.p);
    if (boardEl.classList.contains('show') !== nearPl) boardEl.classList.toggle('show', nearPl);
  }
  renderer.render(scene, camera);
}
frame();

