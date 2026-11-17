/* =====================================================================
   PERCH
   ---------------------------------------------------------------------
   Stopping used to be the absence of play: the same view, the same readouts,
   nothing to do. Stand still somewhere high for a few seconds and the game
   steps back instead. The readouts and the aim ring fade, the camera pulls
   out and begins a slow turn about you, and the sounds of the streets come
   up to where you are. It is a place to look at the city from.

   No button and nothing to learn. Looking around by hand keeps the perch and
   takes the turn over for a while; moving, jumping or firing a web ends it at
   once. `perchK` (0..1) is how far in it is, and is all anything else reads.
   ===================================================================== */
const PERCH_AFTER = 3.5;      // seconds of standing still before it begins
const PERCH_Y = 16;           // metres up that counts as somewhere high
const PERCH_OUT = 8.5;        // metres further back the camera sits
const PERCH_TURN = 0.06;      // rad/s of the slow turn (a full circle in 105 s)
const PERCH_HANDS = 4;        // seconds the turn waits after you look for yourself
let perch = false, perchK = 0, perchStill = 0, perchHands = 0, perchYaw = 0, perchPitch = 0;
function updatePerch(dt, busy) {
  const here = (player.grounded || player.clinging) && !player.riding && !player.inWater && !photoMode && !flying()
    && player.p.y > PERCH_Y && player.v.lengthSq() < 0.3 && !busy
    && !player.webs[0].on && !player.webs[1].on;
  perchStill = here ? perchStill + dt : 0;
  const on = perchStill > PERCH_AFTER;
  if (on !== perch) { perch = on; perchHands = 0; document.body.classList.toggle('perch', on); }
  /* eases in over a few seconds; gone in a fraction of one */
  perchK = damp(perchK, on ? 1 : 0, on ? 0.9 : 7, dt);
  if (on) {
    /* the view moved and it was not this that moved it: it is yours for now */
    if (Math.abs(yaw - perchYaw) > 1e-6 || Math.abs(pitch - perchPitch) > 1e-6) perchHands = PERCH_HANDS;
    if (perchHands > 0) perchHands -= dt; else yaw += PERCH_TURN * perchK * dt;
  }
  perchYaw = yaw; perchPitch = pitch;
}
