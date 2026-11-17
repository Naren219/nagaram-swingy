/* =====================================================================
   THE LINE BENDS ROUND CORNERS   (prototype · B toggles it · off by default)
   ---------------------------------------------------------------------
   A web used to be a length between you and the anchor and nothing else: put
   a building in between and the line went through it. With this on, the line
   is a taut string that the city can touch. Where it meets the edge of a box
   it gets a BEND there, and from then on you swing about the bend on what
   rope is left: the radius shortens as you round the corner and the swing
   whips, the way a tetherball does. Come back across and the bend lets go.

   Every solid is an axis-aligned box, so a bend is always a point on one of a
   box's twelve edges and all of this is a few slab tests.

     bends    w.bp[0..nb)   in order from the anchor outward
     w.e      the last bend: what the solver holds you to
     w.used   rope lying between the anchor and w.e
     webEnd(w), webFree(w)  what to aim at, and how much line is left to swing

   The LAST bend slides along its edge to keep the string as short as it can
   be (a string has no reason to stay where it first touched); the ones
   behind it stay put. A line on an aircraft does not wrap: its anchor moves.
   ===================================================================== */
const WRAP_MAX = 8;        // bends a line can hold; past that it clips, as every line used to
const WRAP_OFF = 0.04;     // metres a bend stands off its edge, so the next ray starts clear of the box
const WRAP_FREE = 1.0;     // metres of swing a wound-up line always keeps
let ropeWrap = false;
for (const w of player.webs) {
  w.nb = 0; w.used = 0; w.e = V3();
  w.bp = new Float32Array(WRAP_MAX * 3);   // bend points
  w.bl = new Float32Array(WRAP_MAX);       // rope from the anchor to each bend
  w.bb = new Int32Array(WRAP_MAX);         // the box each bend is on
  w.bk = new Int8Array(WRAP_MAX);          // the axis its edge runs along
  w.bs = new Int8Array(WRAP_MAX);          // which way the line turns about that axis
}
const webEnd = (w) => (w.nb ? w.e : w.a);
const webFree = (w) => (w.nb ? Math.max(WRAP_FREE, w.len - w.used) : w.len);
function clearWrap(w) { w.nb = 0; w.used = 0; }

const wrP = new Float64Array(3), wrQ = new Float64Array(3), wrB = new Float64Array(3), wrX = new Float64Array(3);
/* does the segment pass through the inside of box b? */
function segInBox(b, s, e) {
  const o = b * 6; let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = e[k] - s[k], mn = BOXES[o + k] + 0.01, mx = BOXES[o + 3 + k] - 0.01;
    if (Math.abs(d) < 1e-9) { if (s[k] <= mn || s[k] >= mx) return false; continue; }
    let a = (mn - s[k]) / d, c = (mx - s[k]) / d;
    if (a > c) { const t = a; a = c; c = t; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 >= t1) return false;
  }
  return true;
}
const wrDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* the point before bend i on the line: the bend behind it, or the anchor */
function wrapPrev(w, i, out) {
  if (i > 0) { out[0] = w.bp[i * 3 - 3]; out[1] = w.bp[i * 3 - 2]; out[2] = w.bp[i * 3 - 1]; }
  else { out[0] = w.a.x; out[1] = w.a.y; out[2] = w.a.z; }
}
/* is the straight line s -> e clear of everything? */
function wrapClear(s, e) {
  const dx = s[0] - e[0], dy = s[1] - e[1], dz = s[2] - e[2], d = Math.hypot(dx, dy, dz);
  if (d < 0.2) return true;
  return !rayHit(e[0], e[1], e[2], dx / d, dy / d, dz / d, d - 0.06);
}
function wrapSeal(w) {
  const i = w.nb - 1;
  if (i < 0) { w.used = 0; return; }
  w.e.set(w.bp[i * 3], w.bp[i * 3 + 1], w.bp[i * 3 + 2]);
  w.used = w.bl[i];
  /* the winch cannot take in rope that is lying on a building */
  const least = w.used + WRAP_FREE;
  if (w.len < least) w.len = least;
  if (w.tgt < least) w.tgt = least;
}

function updateWrap(w, P) {
  if (!ropeWrap || w.pl) { if (w.nb) clearWrap(w); return; }
  wrP[0] = P.x; wrP[1] = P.y; wrP[2] = P.z;

  /* ---- let go of bends you have swung back across, then slide the last ---- */
  while (w.nb) {
    const i = w.nb - 1, k = w.bk[i], u = (k + 1) % 3, v = (k + 2) % 3, o = w.bb[i] * 6;
    wrapPrev(w, i, wrQ);
    wrB[0] = w.bp[i * 3]; wrB[1] = w.bp[i * 3 + 1]; wrB[2] = w.bp[i * 3 + 2];
    const d1u = wrB[u] - wrQ[u], d1v = wrB[v] - wrQ[v], d2u = wrP[u] - wrB[u], d2v = wrP[v] - wrB[v];
    /* seen along the edge, the line turns one way round the corner. Straight
       again, or turning the other way, and nothing is holding it there. */
    if ((d1u * d2v - d1v * d2u) * w.bs[i] < 0) { w.nb--; emit('bend', w.nb, false); continue; }
    /* unfold the two faces flat and the shortest string is a straight line:
       it crosses the edge in proportion to how far each end stands off it */
    const r1 = Math.hypot(d1u, d1v), r2 = Math.hypot(d2u, d2v);
    const z = clamp(wrQ[k] + (wrP[k] - wrQ[k]) * r1 / (r1 + r2 + 1e-9), BOXES[o + k] - WRAP_OFF, BOXES[o + 3 + k] + WRAP_OFF);
    if (Math.abs(z - wrB[k]) > 0.004) {
      const was = wrB[k]; wrB[k] = z;
      /* ...unless something stands in the way of the rope behind it */
      if (wrapClear(wrQ, wrB)) { w.bp[i * 3 + k] = z; w.bl[i] = (i ? w.bl[i - 1] : 0) + wrDist(wrQ, wrB); }
      else wrB[k] = was;
    }
    break;
  }
  wrapSeal(w);
  if (w.nb >= WRAP_MAX) return;

  /* ---- is anything between you and what you hang from? ---- */
  const E = webEnd(w);
  wrQ[0] = E.x; wrQ[1] = E.y; wrQ[2] = E.z;
  const dx = wrQ[0] - wrP[0], dy = wrQ[1] - wrP[1], dz = wrQ[2] - wrP[2], d = Math.hypot(dx, dy, dz);
  if (d < 0.5) return;
  /* from the body toward the anchor: the anchor sits ON a wall, and a ray
     starting on a wall cannot tell that wall from open air */
  const hit = rayHit(wrP[0], wrP[1], wrP[2], dx / d, dy / d, dz / d, d - 0.06);
  if (!hit) return;
  const b = hit.box, o = b * 6;
  /* Of the box's twelve edges, the one the string is lying on is the one that
     makes the shortest way round without going through the box. */
  let best = 1e9, bk = -1, bsu = 0, bsv = 0, bz = 0;
  for (let k = 0; k < 3; k++) {
    const u = (k + 1) % 3, v = (k + 2) % 3;
    for (let c = 0; c < 4; c++) {
      const su = c & 1, sv = c >> 1;
      wrX[u] = su ? BOXES[o + 3 + u] + WRAP_OFF : BOXES[o + u] - WRAP_OFF;
      wrX[v] = sv ? BOXES[o + 3 + v] + WRAP_OFF : BOXES[o + v] - WRAP_OFF;
      const r1 = Math.hypot(wrQ[u] - wrX[u], wrQ[v] - wrX[v]), r2 = Math.hypot(wrP[u] - wrX[u], wrP[v] - wrX[v]);
      wrX[k] = clamp(wrQ[k] + (wrP[k] - wrQ[k]) * r1 / (r1 + r2 + 1e-9), BOXES[o + k] - WRAP_OFF, BOXES[o + 3 + k] + WRAP_OFF);
      const len = wrDist(wrQ, wrX) + wrDist(wrX, wrP);
      if (len >= best || segInBox(b, wrQ, wrX) || segInBox(b, wrX, wrP)) continue;
      best = len; bk = k; bsu = su; bsv = sv; bz = wrX[k];
    }
  }
  if (bk < 0) return;        // over a corner of the box, where one bend is not enough: clip until it is
  const i = w.nb, k = bk, u = (k + 1) % 3, v = (k + 2) % 3;
  wrX[u] = bsu ? BOXES[o + 3 + u] + WRAP_OFF : BOXES[o + u] - WRAP_OFF;
  wrX[v] = bsv ? BOXES[o + 3 + v] + WRAP_OFF : BOXES[o + v] - WRAP_OFF;
  wrX[k] = bz;
  /* the line turns toward the box it is wrapped on */
  const cu = (BOXES[o + u] + BOXES[o + 3 + u]) / 2 - wrX[u], cv = (BOXES[o + v] + BOXES[o + 3 + v]) / 2 - wrX[v];
  const turn = (wrX[u] - wrQ[u]) * cv - (wrX[v] - wrQ[v]) * cu;
  w.bp[i * 3] = wrX[0]; w.bp[i * 3 + 1] = wrX[1]; w.bp[i * 3 + 2] = wrX[2];
  w.bb[i] = b; w.bk[i] = k; w.bs[i] = turn < 0 ? -1 : 1;
  w.bl[i] = w.used + wrDist(wrQ, wrX);
  w.nb++;
  wrapSeal(w);
  emit('bend', w.nb, true);
}
