/* =====================================================================
   PHYSICS
   XPBD: integrate -> solve distance constraints + contacts -> derive v
   ===================================================================== */
const G = 23.5, MASS = 78, RAD = 0.85;
const DRAG_AIR = 0.0042, DRAG_TUCK = 0.0024, DRAG_GLIDE = 0.0105, LIFT_K = 0.0115;
const WEB_RANGE = 135, WEB_MAX = 140, WEB_MIN = 6;
const REEL = 15, SUB = 1 / 120;

/* Wind: a slowly wandering horizontal vector. It never touches the solver —
   it only changes which velocity feeds the aero model, so drag and lift see
   airspeed instead of ground speed. Gliding becomes a negotiation with the
   monsoon breeze rather than a solved function of your own motion. */
/* Thermals — columns of rising air over the sun-baked marina sand, the tech
   park's glass and concrete, and the maidan. They are the VERTICAL component of
   the wind rather than a bespoke force, so the existing drag and lift model
   does all the work: a glider climbs because the air it is flying through is
   climbing, and spreading the wings to glide catches the rise harder than
   falling does (higher drag coefficient, same air). Gliding gains altitude;
   plummeting through one only slows you down. */
const THERMALS = [
  { x: 468, z: -170, r: 64 }, { x: 452, z: 118, r: 58 },    // the marina
  { x: 306, z: 196, r: 66 }, { x: 384, z: 74, r: 54 },      // tech park
  { x: -300, z: -140, r: 52 },                              // the maidan
];
const THERM_V = 36;        // m/s of rise on the axis
const THERM_TOP = 230;     // fades out near the top, so it is a climb not a lift
function thermalAt(x, y, z) {
  let v = 0;
  for (const t of THERMALS) {
    const dx = x - t.x, dz = z - t.z;
    const d2 = dx * dx + dz * dz, r2 = t.r * t.r;
    if (d2 >= r2) continue;
    const core = 1 - d2 / r2;                                  // strongest on the axis
    const alt = 1 - sstep(THERM_TOP * 0.55, THERM_TOP, y);
    const w = THERM_V * core * alt;
    if (w > v) v = w;
  }
  return v;
}

const WIND = V3();
function updateWind(t) {
  const a = t * 0.011 + Math.sin(t * 0.023) * 1.8;               // heading drifts
  const s = Math.max(0, 2.4 + 2.0 * Math.sin(t * 0.017 + 1.3)   // strength swells
                        + 1.1 * Math.sin(t * 0.0053));          // and dies away
  WIND.set(Math.cos(a) * s, 0, Math.sin(a) * s);
}

const player = {
  p: V3(-46, 96, -230), v: V3(4, 0, 20),
  grounded: false, riding: null, rideLo: V3(), coyote: 0, clinging: false, inWater: false,
  depth: 0, wasWet: false,
  cn: V3(0, 1, 0), contact: false, bank: 0, lastAccel: V3(),
  webs: [{ on: false, a: V3(), len: 0, tgt: 0, rest: 40, tavg: 0, corr: 0, tension: 0, hand: V3(), pl: null, lo: V3() },
         { on: false, a: V3(), len: 0, tgt: 0, rest: 40, tavg: 0, corr: 0, tension: 0, hand: V3(), pl: null, lo: V3() }]
};
let assist = true;

const stampA = new Int32Array(NBOX); let stampV = 0;
const _hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, box: -1 };
function rayHit(ox, oy, oz, dx, dy, dz, maxT) {
  stampV++;
  let best = maxT, found = false, bax = 0, bs = 0;
  const step = CELL * 0.45, steps = Math.ceil(maxT / step);
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(maxT, s * step);
    if (found && t > best) break;
    const ci = Math.floor((ox + dx * t) / CELL), cj = Math.floor((oz + dz * t) / CELL);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const arr = hash.get(hkey(ci + di, cj + dj)); if (!arr) continue;
      for (let q = 0; q < arr.length; q++) {
        const b = arr[q]; if (stampA[b] === stampV) continue; stampA[b] = stampV;
        const o = b * 6;
        let t0 = 0.02, t1 = best, ax = -1, sg = 0, ok = true;
        for (let k = 0; k < 3; k++) {
          const oo = k === 0 ? ox : k === 1 ? oy : oz;
          const dd = k === 0 ? dx : k === 1 ? dy : dz;
          const mn = BOXES[o + k], mx = BOXES[o + 3 + k];
          if (Math.abs(dd) < 1e-7) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
          let a = (mn - oo) / dd, c = (mx - oo) / dd, s2 = -1;
          if (a > c) { const tmp = a; a = c; c = tmp; s2 = 1; }
          if (a > t0) { t0 = a; ax = k; sg = s2; }
          if (c < t1) t1 = c;
          if (t0 > t1) { ok = false; break; }
        }
        if (!ok || ax < 0) continue;
        best = t0; found = true; bax = ax; bs = sg;
        _hit.box = b;
      }
    }
  }
  if (!found) return null;
  _hit.t = best;
  _hit.x = ox + dx * best; _hit.y = oy + dy * best; _hit.z = oz + dz * best;
  _hit.nx = bax === 0 ? bs : 0; _hit.ny = bax === 1 ? bs : 0; _hit.nz = bax === 2 ? bs : 0;
  return _hit;
}

/* Water used to be a lid: the ground clamp caught you at RAD, so you stood on
   the sea and every bit of momentum died on contact. It is a volume now.
   Shallow contact barely slows you — that is the skim — while depth slows you
   hard and floats you back up. */
const SEA_Y = 0.05, RIVER_Y = 0.06, SEABED = 9;
function waterSurfaceAt(x, z) {
  if (x > SEA_X - 4) return SEA_Y;
  if (Math.abs(z - riverZ(x)) < RIVER_HW) return RIVER_Y;
  return null;
}
const inWaterAt = (x, y, z) => { const s = waterSurfaceAt(x, z); return s !== null && y < s; };

function solveContacts(p) {
  player.contact = false;
  const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const arr = hash.get(hkey(ci + di, cj + dj)); if (!arr) continue;
    for (let q = 0; q < arr.length; q++) {
      const o = arr[q] * 6;
      const cx = clamp(p.x, BOXES[o], BOXES[o + 3]);
      const cy = clamp(p.y, BOXES[o + 1], BOXES[o + 4]);
      const cz = clamp(p.z, BOXES[o + 2], BOXES[o + 5]);
      let dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > RAD * RAD) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), k = (RAD - d) / d;
        p.x += dx * k; p.y += dy * k; p.z += dz * k;
        player.cn.set(dx / d, dy / d, dz / d);
      } else {
        /* deep inside: eject along the shallowest axis */
        const ex = Math.min(p.x - BOXES[o], BOXES[o + 3] - p.x);
        const ey = Math.min(p.y - BOXES[o + 1], BOXES[o + 4] - p.y);
        const ez = Math.min(p.z - BOXES[o + 2], BOXES[o + 5] - p.z);
        if (ex <= ey && ex <= ez) { const s = p.x < (BOXES[o] + BOXES[o + 3]) / 2 ? -1 : 1; p.x += s * (ex + RAD); player.cn.set(s, 0, 0); }
        else if (ey <= ez) { const s = p.y < (BOXES[o + 1] + BOXES[o + 4]) / 2 ? -1 : 1; p.y += s * (ey + RAD); player.cn.set(0, s, 0); }
        else { const s = p.z < (BOXES[o + 2] + BOXES[o + 5]) / 2 ? -1 : 1; p.z += s * (ez + RAD); player.cn.set(0, 0, s); }
      }
      player.contact = true;
      if (player.cn.y > 0.6) player.grounded = true;
    }
  }
  if (p.y < RAD) {
    const surf = waterSurfaceAt(p.x, p.z);
    if (surf === null) { p.y = RAD; player.grounded = true; player.contact = true; player.cn.set(0, 1, 0); }
    else if (p.y < surf - SEABED) { p.y = surf - SEABED; player.contact = true; player.cn.set(0, 1, 0); }
  }
}

/* Which hull E would board right now. A web latched to a hull is boarding
   access from any distance — you are literally attached, so E climbs the line
   aboard. Without one, E reaches the nearest point on a hull's box, not its
   centre: a centre test fails from a wingtip anchor even with the line winched
   to minimum. The mobile board button shows exactly when this returns a hull. */
function boardablePlane(P) {
  for (const w of player.webs) if (w.on && w.pl) return w.pl;
  let near = null, nd = 15 * 15;
  for (const pl of planes) {
    const dx = Math.max(Math.abs(P.x - pl.p.x) - PLANE_HX, 0);
    const dy = Math.max(Math.abs(P.y - pl.p.y) - PLANE_HY, 0);
    const dz = Math.max(Math.abs(P.z - pl.p.z) - PLANE_HZ, 0);
    const d = dx * dx + dy * dy + dz * dz;
    if (d < nd) { nd = d; near = pl; }
  }
  return near;
}

const _pp = V3(), _tmp = V3(), _tmp2 = V3();
function stepPhysics(h, inp) {
  const P = player.p, V = player.v;
  _pp.copy(P);

  /* ---- riding an aircraft ---- */
  if (!player.riding && inp.mount) {
    const near = boardablePlane(P);
    if (near) {
      worldToPlane(near, P.x, P.y, P.z, player.rideLo);
      /* snap onto the spine of the fuselage rather than wherever you grabbed */
      player.rideLo.x = clamp(player.rideLo.x, -1.1, 1.1);
      player.rideLo.z = clamp(player.rideLo.z, -9, 9);
      player.rideLo.y = DECK_Y;
      player.riding = near;
      releaseWeb(0); releaseWeb(1);
      toast(touchOn ? 'riding · jump to drop · stick to walk' : 'riding · space to drop · A/D to walk');
    }
  }
  if (player.riding) {
    const pl = player.riding;
    /* inp.mx/mz are a WORLD direction, so rotate them into the hull's frame
       before walking, or the controls flip as the aircraft turns */
    const c = Math.cos(pl.yaw), sn = Math.sin(pl.yaw);
    const lx = inp.mx * c - inp.mz * sn, lz = inp.mx * sn + inp.mz * c;
    player.rideLo.z = clamp(player.rideLo.z + lz * 7 * h, -9.5, 9.5);
    player.rideLo.x = clamp(player.rideLo.x + lx * 5 * h, -1.2, 1.2);
    planePoint(pl, player.rideLo.x, player.rideLo.y, player.rideLo.z, P);
    V.copy(pl.v);
    player.grounded = true; player.clinging = false; player.coyote = 0.16;
    player.lastAccel.set(0, 0, 0);
    if (inp.jump) {                       // step off, keeping the aircraft's speed
      player.riding = null;
      V.copy(pl.v).multiplyScalar(0.9); V.y += 9.5;
      P.y += 0.6;
    }
    return;
  }
  /* grounded is produced by solveContacts LATER in this same step, so the
     control block below must read the state carried over from the previous
     substep. Clearing it first made the grounded branch permanently dead. */
  const onGround = player.grounded;
  player.grounded = false;
  const surf = waterSurfaceAt(P.x, P.z);
  player.inWater = surf !== null && P.y < surf;
  player.depth = player.inWater ? surf - P.y : 0;
  /* one splash per entry, scaled by how hard you hit */
  if (player.inWater && !player.wasWet) splash(P.x, surf, P.z, -V.y);
  player.wasWet = player.inWater;
  player.clinging = !!inp.cling && player.contact && !player.inWater;

  /* ---- forces ---- */
  let ax = 0, ay = -G, az = 0;

  /* the aero model runs on airspeed: velocity relative to the wind */
  const calm = player.inWater;
  const wfx = calm ? 0 : WIND.x, wfz = calm ? 0 : WIND.z;
  const wfy = calm ? 0 : thermalAt(P.x, P.y, P.z);
  const rvx = V.x - wfx, rvy = V.y - wfy, rvz = V.z - wfz;
  const rs = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);

  let cd = DRAG_AIR;
  if (inp.tuck) cd = DRAG_TUCK;
  if (inp.glide && !onGround) cd = DRAG_GLIDE;
  /* sub: 0 grazing the surface, 1 fully under. Skimming keeps its speed;
     going deep does not. */
  const sub = player.inWater ? clamp(player.depth / 1.7, 0, 1) : 0;
  if (player.inWater) cd = 0.004 + 0.055 * sub;
  ax -= cd * rs * rvx; ay -= cd * rs * rvy; az -= cd * rs * rvz;
  if (player.inWater) {
    /* Buoyancy vanishes at the surface, so the only rest state is floating
       exactly there. Quadratic drag goes to nothing at low speed and left the
       bob undamped forever, so the viscous term below is what actually settles
       it — vertical mostly, or a skim would stop dead. */
    ay += G * (1 + 1.15 * sub);
    ay -= V.y * (1.6 + 3.4 * sub);
    ax -= V.x * 0.30 * sub; az -= V.z * 0.30 * sub;
  }

  /* ---- wing: angle-of-attack lift ---- */
  if (inp.glide && !onGround && rs > 9 && !player.inWater) {
    _tmp.set(rvx / rs, rvy / rs, rvz / rs);                     // airflow dir
    _tmp2.copy(inp.fwd);                                        // chord dir
    const cosA = clamp(_tmp.dot(_tmp2), -1, 1);
    const alpha = Math.acos(cosA);
    const cl = Math.sin(2 * clamp(alpha, -1.15, 1.15));         // stalls past ~66 deg
    const perp = _tmp2.clone().addScaledVector(_tmp, -cosA);
    if (perp.lengthSq() > 1e-6) {
      perp.normalize();
      const L = LIFT_K * rs * rs * cl;
      ax += perp.x * L; ay += perp.y * L; az += perp.z * L;
    }
  }

  /* ---- control ---- */
  if (onGround) {
    const runA = inp.tuck ? 62 : 42;
    ax += inp.mx * runA; az += inp.mz * runA;
    ax -= V.x * 6.2; az -= V.z * 6.2;
    if (inp.jump) { V.y = 12.4; P.y += 0.04; }
  } else if (player.inWater) {
    ax += inp.mx * 15; az += inp.mz * 15;                 // swim
    if (inp.jump) V.y = Math.max(V.y, 10.5);              // kick for the surface
  } else if (player.clinging && player.contact) {
    const n = player.cn;
    _tmp.set(inp.mx, 0, inp.mz);
    _tmp.addScaledVector(n, -_tmp.dot(n));
    ax += _tmp.x * 26 + n.x * 4; az += _tmp.z * 26 + n.z * 4;
    ay += G * 0.98 + inp.mzRaw * 12;
    ax -= V.x * 7; ay -= V.y * 7; az -= V.z * 7;
    if (inp.jump) { V.addScaledVector(n, 11).y += 8; player.clinging = false; }
  } else {
    const air = inp.glide ? 15 : 11;
    ax += inp.mx * air; az += inp.mz * air;
    if (inp.tuck) { ax += inp.fwd.x * 16; ay += inp.fwd.y * 16; az += inp.fwd.z * 16; }
  }
  /* zip line pull */
  if (inp.zip) for (const w of player.webs) if (w.on) {
    _tmp.copy(w.a).sub(P); const dl = _tmp.length();
    if (dl > 2) { _tmp.multiplyScalar(1 / dl); ax += _tmp.x * 78; ay += _tmp.y * 78; az += _tmp.z * 78; }
    w.tgt = Math.max(WEB_MIN, w.tgt - 34 * h);
  }

  player.lastAccel.set(ax, ay + G, az);
  V.x += ax * h; V.y += ay * h; V.z += az * h;
  const vm = V.length();
  if (vm > 150) V.multiplyScalar(150 / vm);
  P.x += V.x * h; P.y += V.y * h; P.z += V.z * h;

  /* ---- rope length control ---- */
  for (const w of player.webs) {
    if (!w.on) continue;
    if (inp.reelIn) w.tgt -= REEL * h;
    if (inp.reelOut) w.tgt += REEL * h;
    if (assist) {
      /* pump on resonance: shorten where tension runs above its own average
         (near the bottom of the arc), pay out where it runs below. Net length
         is preserved, net energy is not — which is exactly how a swing works. */
      w.tavg = damp(w.tavg, w.tension, 0.8, h);
      const dev = clamp((w.tension - w.tavg) / Math.max(700, w.tavg), -1, 1);
      w.tgt -= dev * 10 * h;
      w.tgt += clamp(w.rest - w.tgt, -6, 6) * 0.9 * h;
    }
    w.tgt = clamp(w.tgt, WEB_MIN, WEB_MAX);
    w.len = damp(w.len, w.tgt, 12, h);
  }

  /* ---- constraint solve ---- */
  for (const w of player.webs) w.corr = 0;
  const K = 0.94;
  /* a latched aircraft carries its anchor with it, so the constraint target
     has to be re-evaluated every substep — that is what tows the player */
  for (const w of player.webs) if (w.on && w.pl) planePoint(w.pl, w.lo.x, w.lo.y, w.lo.z, w.a);

  for (let it = 0; it < 5; it++) {
    for (const w of player.webs) {
      if (!w.on) continue;
      const dx = P.x - w.a.x, dy = P.y - w.a.y, dz = P.z - w.a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= w.len || d < 1e-5) continue;
      const c = ((d - w.len) / d) * K;
      P.x -= dx * c; P.y -= dy * c; P.z -= dz * c;
      w.corr += (d - w.len) * K;
    }
    solveContacts(P);
  }

  /* ---- derive velocity ---- */
  V.set((P.x - _pp.x) / h, (P.y - _pp.y) / h, (P.z - _pp.z) / h);
  for (const w of player.webs) {
    if (!w.on) { w.tension = damp(w.tension, 0, 12, h); continue; }
    w.tension = damp(w.tension, MASS * w.corr / (h * h), 14, h);
    if (w.a.distanceTo(P) > WEB_MAX * 1.25) w.on = false;
  }
  if (player.grounded) player.coyote = 0.16; else player.coyote -= h;
}

/* ---- attaching ---- */
const AIM_RINGS = [0.12, 0.28];
function findAnchor(fwd, right, up, o, prev) {
  let best = null, bs = 1e9;
  /* two rings of candidates around the crosshair, widest last */
  const vh = Math.hypot(player.v.x, player.v.z);
  const consider = (dx, dy, dz, off) => {
    const l = Math.hypot(dx, dy, dz);
    const ux = dx / l, uy = dy / l, uz = dz / l;
    const stat = rayHit(o.x, o.y, o.z, ux, uy, uz, WEB_RANGE);
    const air = rayHitPlanes(o.x, o.y, o.z, ux, uy, uz, WEB_RANGE);
    /* whichever the ray reaches first — an aircraft can occlude a tower */
    let hit = stat, pl = null;
    if (air && (!stat || air.t < stat.t)) { hit = air; pl = air.pl; }
    if (!hit) return;
    const rise = hit.y - o.y;
    if (rise < 2.5) return;
    /* What the crosshair is actually on wins. Assist rays only take over when
       the centre finds nothing, so aiming at a tower can't be overruled by a
       nearer wall that happened to fall inside the cone. */
    let score = hit.t * (1 + off * 5.5);
    /* a high anchor buys a longer, faster arc */
    score *= 1 - 0.42 * clamp(rise / 45, 0, 1);
    /* at speed, an anchor behind you kills the arc instead of extending it */
    if (vh > 12) {
      const hx = hit.x - o.x, hz = hit.z - o.z, hd = Math.hypot(hx, hz) || 1;
      const ahead = (hx * player.v.x + hz * player.v.z) / (hd * vh);
      if (ahead < 0.05) score *= 1 + (0.05 - ahead) * 3.4;
    }
    /* the anchor already highlighted keeps a small edge, so the marker settles
       on one target instead of alternating between two similar ones */
    if (prev && Math.hypot(hit.x - prev.x, hit.y - prev.y, hit.z - prev.z) < 4)
      score *= 0.74;
    if (score < bs) { bs = score; best = { x: hit.x, y: hit.y, z: hit.z, t: hit.t, off, pl }; }
  };
  consider(fwd.x, fwd.y, fwd.z, 0);
  for (const sp of AIM_RINGS) {
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8 + (sp > 0.2 ? 0.39 : 0);
      const ux = Math.cos(a) * sp, uy = Math.sin(a) * sp;
      consider(fwd.x + right.x * ux + up.x * uy,
               fwd.y + right.y * ux + up.y * uy,
               fwd.z + right.z * ux + up.z * uy, sp);
    }
  }
  if (best) return best;
  /* still nothing near the crosshair — open the cone right out before resorting
     to a blind upward lob */
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 + 0.2, ux = Math.cos(a) * 0.48, uy = Math.sin(a) * 0.48;
    consider(fwd.x + right.x * ux + up.x * uy,
             fwd.y + right.y * ux + up.y * uy,
             fwd.z + right.z * ux + up.z * uy, 0.48);
  }
  if (best) return best;
  /* nothing ahead: lob it upward, fanning across pitch and yaw */
  const hl = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / hl, fz = fwd.z / hl;
  for (const pitchUp of [0.62, 0.95, 1.35]) {
    const c = Math.cos(pitchUp), sy = Math.sin(pitchUp);
    for (const yawOff of [0, 0.5, -0.5, 1.0, -1.0]) {
      const cy = Math.cos(yawOff), sYaw = Math.sin(yawOff);
      consider((fx * cy - fz * sYaw) * c, sy, (fz * cy + fx * sYaw) * c, 0.9);
      if (best) return best;
    }
  }
  return best;
}
/* the crosshair, the world marker and the actual shot all consume the SAME
   candidate, so what you see highlighted is exactly what you get */
function fireWebAt(i, a) {
  const w = player.webs[i];
  if (player.riding && a) { player.v.copy(player.riding.v); player.riding = null; }
  if (!a) { w.miss = performance.now(); missFlash = 0.22; return false; }
  w.pl = a.pl || null;
  if (w.pl) worldToPlane(w.pl, a.x, a.y, a.z, w.lo);
  w.on = true; w.a.set(a.x, a.y, a.z);
  w.len = Math.max(WEB_MIN, player.p.distanceTo(w.a));
  w.tgt = w.len;
  w.rest = clamp(w.len * 0.72, 20, 68);
  w.tension = 0; w.tavg = 0; w.fired = performance.now();
  player.clinging = false;
  return true;
}
function releaseWeb(i) {
  player.webs[i].pl = null;
  const w = player.webs[i];
  if (!w.on) return;
  w.on = false;
  if (player.v.y > 0.5) { player.v.y += 2.4; }
  /* A hard upward release throws the body into a somersault — earned by the
     swing, never a button. Pure rig theatre: the trajectory is untouched. */
  const other = player.webs[1 - i];
  if (!other.on && !player.grounded && !player.riding && !player.inWater && player.v.y > 12) {
    flipN = player.v.y > 21 ? 2 : 1;
    flipDur = flipN > 1 ? 2.2 : 1.4;
    flipT = 0;
  }
}

