/* =====================================================================
   CAMERA
   ===================================================================== */
const PITCH_MAX = 1.47;                  // ~84 deg, near-vertical either way
let yaw = -0.4, pitch = -0.08, camDist = 7.2, curDist = 7.2;
let sens = 0.0034;                       // rad per pixel, adjustable with [ and ]
let ptrX = 0, ptrY = 0, ptrSeen = false;
const camFwd = V3(0, 0, -1), camRight = V3(1, 0, 0), camUp = V3(0, 1, 0);
const pivot = V3(), camPos = V3(), camPosS = V3(-46, 100, -220);
let camRoll = 0, fovS = 62;
function updateCamDirs() {
  /* Right-handed, Y-up: screen-right is cross(forward, worldUp) and screen-up
     is cross(right, forward). The yaw term is negated on X so that INCREASING
     yaw sweeps the view to the right, matching mouse-right and D-strafe. */
  const cp = Math.cos(pitch);
  camFwd.set(-Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();
  camRight.set(-Math.cos(yaw), 0, -Math.sin(yaw)).normalize();
  camUp.crossVectors(camRight, camFwd).normalize();
}
const camVel = V3(0, 0, 0), camFwdS = V3(0, 0, 1), boomDir = V3(0, 0, 1), _lookT = V3(0, 0, 0);
const GROUND_CLEAR = 1.25;
/* The boom carrying the camera is deliberately NOT the aim direction. Aiming
   near-vertical used to swing the boom under the street, where the floor clamp
   shoved the camera back up on top of the character. The boom pitch is limited
   instead; past the limit the character just drifts down the frame while the
   view keeps tilting. Orientation still tracks the aim exactly, so screen
   centre remains the web ray. */
const BOOM_UP = 0.70, BOOM_DOWN = -1.15;
function updateCamera(dt) {
  /* player.v is re-derived from the constraint-solved position every substep,
     so it carries high-frequency noise. Feeding it straight into the pivot lead
     amplified that noise into the view. The camera rides a smoothed copy. */
  camVel.lerp(player.v, 1 - Math.exp(-6.5 * dt));
  const V = camVel, spd = V.length();
  pivot.copy(pRender);
  pivot.y += 1.05;
  pivot.addScaledVector(V, clamp(0.12 - spd * 0.0008, 0.02, 0.12));

  const bp = clamp(pitch, BOOM_DOWN, BOOM_UP), cbp = Math.cos(bp);
  boomDir.set(-Math.sin(yaw) * cbp, Math.sin(bp), Math.cos(yaw) * cbp);
  const want = camDist + clamp(spd * 0.055, 0, 3.4);
  camPos.copy(pivot).addScaledVector(boomDir, -want);
  camPos.y += 0.55;

  /* keep the camera out of geometry */
  _d.copy(camPos).sub(pivot);
  const L = _d.length(); _d.multiplyScalar(1 / L);
  const hit = rayHit(pivot.x, pivot.y, pivot.z, _d.x, _d.y, _d.z, L + 0.6);
  let allowed = L;
  if (hit) allowed = Math.max(2.8, hit.t - 0.55);   // never retract inside the character
  curDist = damp(curDist, allowed, hit ? 26 : 7, dt);
  camPos.copy(pivot).addScaledVector(_d, Math.min(curDist, L));
  /* the ground is a plane rather than a box, so the collision ray never saw it */
  if (camPos.y < GROUND_CLEAR) camPos.y = GROUND_CLEAR;
  camPosS.lerp(camPos, 1 - Math.exp(-24 * dt));
  if (camPosS.y < GROUND_CLEAR) camPosS.y = GROUND_CLEAR;
  camera.position.copy(camPosS);

  camFwdS.lerp(camFwd, 1 - Math.exp(-30 * dt)).normalize();
  /* rolling the horizon while free-falling makes the skyline harder to read —
     bank only when a line is actually loaded */
  const anyLine = player.webs[0].on || player.webs[1].on;
  camRoll = damp(camRoll, anyLine ? player.bank * 0.55 : 0, anyLine ? 5 : 3.2, dt);
  camera.up.set(0, 1, 0).applyAxisAngle(camFwdS, camRoll);
  camera.lookAt(_lookT.copy(camPosS).addScaledVector(camFwdS, 140));

  const wantFov = 62 + clamp(spd * 0.26, 0, 14);
  fovS = damp(fovS, wantFov, 4, dt);
  if (Math.abs(camera.fov - fovS) > 0.01) { camera.fov = fovS; camera.updateProjectionMatrix(); }
}

