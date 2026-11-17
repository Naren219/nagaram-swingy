/* =====================================================================
   SPATIAL HASH over every solid AABB  (used by physics + placement)
   ===================================================================== */
const BOXES = new Float32Array(boxesArr);
const NBOX = (BOXES.length / 6) | 0;
const CELL = 44;
const hash = new Map();
const hkey = (i, j) => (i + 2048) * 4096 + (j + 2048);
function hashBox(b) {
  const o = b * 6;
  for (let i = Math.floor(BOXES[o] / CELL); i <= Math.floor(BOXES[o + 3] / CELL); i++)
    for (let j = Math.floor(BOXES[o + 2] / CELL); j <= Math.floor(BOXES[o + 5] / CELL); j++) {
      const k = hkey(i, j); let a = hash.get(k); if (!a) { a = []; hash.set(k, a); } a.push(b);
    }
}
/* The metro's boxes are held back until the plants, traffic and boats have
   been placed (76-metro.js puts them in). Placement asks freeAt() and draws
   from the world's random stream until it has enough: one more box in the way
   is one more draw, and every palm, aircraft and kite after it would land
   somewhere else. This way the city is the same city, plus a metro. */
for (let b = 0; b < NBOX; b++) if (b < METRO.box0 || b >= METRO.box1) hashBox(b);
function freeAt(x, z, r) {
  const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const a = hash.get(hkey(i + di, j + dj)); if (!a) continue;
    for (const b of a) {
      const o = b * 6;
      if (x > BOXES[o] - r && x < BOXES[o + 3] + r && z > BOXES[o + 2] - r && z < BOXES[o + 5] + r) return false;
    }
  }
  return true;
}
const onRoad = (x, z) => {
  const mx = Math.abs(((x % PITCH) + PITCH * 1.5) % PITCH - PITCH / 2);
  const mz = Math.abs(((z % PITCH) + PITCH * 1.5) % PITCH - PITCH / 2);
  return mx < ROADW / 2 || mz < ROADW / 2;
};

