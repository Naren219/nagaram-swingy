/* =====================================================================
   TAKING THE CONTROLS
   ---------------------------------------------------------------------
   Aboard an aircraft, E takes its controls: you go forward to the cockpit,
   the view drops back to frame the whole airframe, and A/D turn it (it banks
   into the turn) while W/S put the nose up and down. E again hands it back.
   The aircraft keeps its own cruising speed; you only choose where it goes.

   Two things it will not let you do. It will not fly into the city: it
   looks down under itself and ahead of itself, and pulls up over whatever is
   there. And it will not leave: past the edge of the map it turns itself back.

   Handing back is seamless. The autopilot flies a circle (flyPlane), so it is
   given a new one: the same size and the same turning sense, through where
   the aircraft is and along the way it is pointing. Height is the one thing
   that can be off from that circuit's band, and it is eased back in.

   Physics only announces the press (emit('helm', hull)); this file decides
   what it means. Taking the controls swaps the hull's step from flyPlane to
   flyByHand, and handing back swaps it back: those two functions, and
   nothing else, write `flown` and `step`. The stick is routed here too
   (routeStick): on a hull being flown it steers the hull, and the walk input
   the rider's walkway reads becomes a walk to the seat, so nothing
   downstream needs to know you are flying.
   ===================================================================== */
const PILOT_TURN = 0.55;        // rad/s of heading at full stick
const PILOT_BANK = 0.62;        // rad of roll at full stick
const PILOT_PITCH = 0.32;       // rad of nose up or down at full stick
const PILOT_CLEAR = 14;         // metres kept between the belly and any roof
const PILOT_CEIL = 380;         // and no higher than this
const PILOT_EDGE = 900;         // beyond this far from the centre it turns home
const COCKPIT_Z = 7.4;          // where the pilot sits, forward along the spine
const AUTO_LO = 78, AUTO_HI = 168;   // the band the autopilot's circuits fly in
let pilotK = 0;                 // 0..1, how far the view has gone over to the chase camera
let pilotEdgeSaid = false;

listen('helm', (pl) => {
  if (pl.flown) { handBack(pl); toast('Autopilot has it'); return; }
  takeControls(pl);
  toast(touchOn ? 'You have the controls · stick to steer · Let go to hand it back'
                : 'You have the controls · A/D turn · W/S climb and dive · E to let go');
  toastT = 3.5;
});
function takeControls(pl) {
  pl.flown = true; pl.step = flyByHand; pl.turnRate = 0;
  pilotEdgeSaid = false;
}

/* Aboard a hull being flown, the stick is the hull's (flyByHand reads
   inp.rlRaw / inp.mzRaw), and the walk becomes a walk to the seat: a world
   direction, as inp.mx/mz always are, slowing to nothing on arrival. */
function routeStick(inp) {
  const pl = player.riding;
  if (!pl || !pl.flown) return;
  const lx = -player.rideLo.x, lz = COCKPIT_Z - player.rideLo.z, d = Math.hypot(lx, lz);
  const k = d < 0.01 ? 0 : Math.min(1, d / 0.35) / d;
  const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
  inp.mx = (lx * c + lz * sn) * k; inp.mz = (lz * c - lx * sn) * k;
}

/* the top of whatever is solid under (x, z), or 0 for the street */
function solidTop(x, z) {
  const h = rayHit(x, 600, z, 0, -1, 0, 600);
  return h ? 600 - h.t : 0;
}

function flyByHand(pl, dt) {
  /* the hands have to be aboard to be on the controls */
  if (player.riding !== pl) { handBack(pl); flyPlane(pl, dt); return; }
  const turn = clamp(inp.rlRaw, -1, 1), climb = clamp(inp.mzRaw, -1, 1);
  const spd = pl.cruise, hx = Math.sin(pl.yaw), hz = Math.cos(pl.yaw);

  /* D turns right, which is the heading angle going DOWN (75-traffic.js:
     the nose points along (sin yaw, cos yaw)) */
  let want = -turn * PILOT_TURN;
  const out = Math.hypot(pl.p.x, pl.p.z);
  if (out > PILOT_EDGE) {
    /* steer for the centre: positive yaw rate swings the nose toward (cos yaw, -sin yaw) */
    const k = clamp((out - PILOT_EDGE) / 150, 0, 1), cx = -pl.p.x / out, cz = -pl.p.z / out;
    if (cx * hx + cz * hz < 0.95) want = lerp(want, Math.sign(cx * hz - cz * hx || 1) * PILOT_TURN, k);
    if (!pilotEdgeSaid) { pilotEdgeSaid = true; toast('Turning back toward the city'); }
  } else if (out < PILOT_EDGE - 100) pilotEdgeSaid = false;
  pl.turnRate = damp(pl.turnRate, want, 3, dt);
  pl.yaw += pl.turnRate * dt;

  /* look under and ahead: anything closer than PILOT_CLEAR below the belly
     lifts the nose, harder the closer it is */
  const top = Math.max(solidTop(pl.p.x, pl.p.z),
                       solidTop(pl.p.x + hx * spd * 1.2, pl.p.z + hz * spd * 1.2),
                       solidTop(pl.p.x + hx * spd * 2.6, pl.p.z + hz * spd * 2.6));
  const floor = top + PLANE_HY + PILOT_CLEAR;
  let pitchWant = climb * PILOT_PITCH;
  if (pl.p.y < floor + 10) pitchWant = Math.max(pitchWant, PILOT_PITCH * clamp((floor + 10 - pl.p.y) / 12, 0, 1.2));
  if (pl.p.y > PILOT_CEIL - 20) pitchWant = Math.min(pitchWant, -PILOT_PITCH * clamp((pl.p.y - PILOT_CEIL + 20) / 20, 0, 1));
  pl.pitch = damp(pl.pitch, pitchWant, 2.4, dt);
  pl.roll = damp(pl.roll, -pl.turnRate / PILOT_TURN * PILOT_BANK, 3, dt);

  const c = Math.cos(pl.pitch), x = pl.p.x + Math.sin(pl.yaw) * spd * c * dt, z = pl.p.z + Math.cos(pl.yaw) * spd * c * dt;
  /* never through a roof, even if the pull-up was not enough */
  const y = clamp(pl.p.y + spd * Math.sin(pl.pitch) * dt, top + PLANE_HY + 1, PILOT_CEIL);
  pl.v.set(x - pl.p.x, y - pl.p.y, z - pl.p.z).multiplyScalar(dt > 1e-5 ? 1 / dt : 0);
  pl.p.set(x, y, z);
  drawPlane(pl);
}

/* back to a circuit: through here, along the nose, at its old size */
function handBack(pl) {
  pl.flown = false; pl.step = flyPlane;
  const s = Math.sign(pl.w), hx = Math.sin(pl.yaw), hz = Math.cos(pl.yaw);
  /* flyPlane's nose is along w·(−sin ph, cos ph), so sin ph = −s·hx, cos ph = s·hz */
  pl.ph = Math.atan2(-s * hx, s * hz);
  pl.cx = pl.p.x - Math.cos(pl.ph) * pl.r;
  pl.cz = pl.p.z - Math.sin(pl.ph) * pl.r;
  const base = pl.p.y - Math.sin(pl.ph * 2.1) * 6;
  pl.y = clamp(base, AUTO_LO, AUTO_HI);
  pl.oy = base - pl.y;            // eased away by flyPlane
}

/* the chase view: the camera follows the nose, a little above it, unless you
   have just looked somewhere yourself, and comes back to it a moment after */
const PILOT_VIEW_PITCH = -0.16;
let pilotLookYaw = 0, pilotLookPitch = 0, pilotLookIdle = 0;
function pilotCamera(dt) {
  const flown = !!(player.riding && player.riding.flown);
  pilotK = damp(pilotK, flown ? 1 : 0, 2.2, dt);
  if (!flown) { pilotLookIdle = 0; pilotLookYaw = yaw; pilotLookPitch = pitch; return; }
  if (Math.abs(yaw - pilotLookYaw) > 1e-6 || Math.abs(pitch - pilotLookPitch) > 1e-6) pilotLookIdle = 0;
  else pilotLookIdle += dt;
  if (pilotLookIdle > 1.2) {
    /* camFwd is (−sin yaw, ·, cos yaw); the nose is (sin pl.yaw, ·, cos pl.yaw) */
    let d = -player.riding.yaw - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = 1 - Math.exp(-1.6 * dt);
    yaw += d * k;
    pitch += (PILOT_VIEW_PITCH + player.riding.pitch * 0.5 - pitch) * k;
  }
  pilotLookYaw = yaw; pilotLookPitch = pitch;
}
