/* =====================================================================
   WORLD LAYOUT
   ===================================================================== */
const PITCH = 84, ROADW = 15, EXT = 560;
const SEA_X = 498, SAND_X = 428;
const riverZ = (x) => -252 + 58 * Math.sin(x * 0.0031) + 22 * Math.sin(x * 0.0091);
const RIVER_HW = 31;

function districtAt(x, z) {
  if (x > SAND_X) return 'beach';
  if (Math.abs(z - riverZ(x)) < RIVER_HW + 12) return 'river';
  if (Math.abs(x) < 108 && Math.abs(z) < 108) return 'temple';
  if (x > 190 && x < 430 && z > 55 && z < 320) return 'tech';
  if (z < riverZ(x) - RIVER_HW - 12) return 'apartments';
  if (x < -225 && z > -70) return 'chettinad';
  if (Math.hypot(x, z) < 300) return 'oldtown';
  return 'mid';
}
const ZONE_NAME = {
  temple: 'temple ward', oldtown: 'old bazaar', mid: 'midtown', tech: 'tech park',
  apartments: 'north blocks', chettinad: 'chettinad quarter',
  beach: 'the marina', river: 'riverside', sea: 'bay of bengal'
};

const PALETTE = {
  oldtown: [0xd9b05a, 0xc9543f, 0x8fb08a, 0xd9d0b8, 0x7fa8b8, 0xd08a5c, 0xcfc06a, 0xb5896b],
  mid: [0xd8cfb6, 0xc2b79a, 0xa9b3a2, 0xcbb08c, 0xbfc6c4, 0xd6b98e],
  apartments: [0xcfc8b4, 0xbcb6a4, 0xc9b493, 0xb9c0bd, 0xd2c6ab],
  chettinad: [0xe2d3ad, 0xd6b98a, 0xc8a878, 0xe6dcc2],
  beach: [0xe4dcc6, 0xd7c3a2, 0xbfd0cf, 0xe8c9a6],
  tech: [0x8fa6b4, 0x7d94a6, 0xa2b6bf]
};

const buildings = [];   // {x,z,w,d,h,c,kind}
const boxesArr = [];    // physics AABBs
function addBox(x, y, z, w, h, d) {
  boxesArr.push(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
}
function addBuilding(x, z, w, d, h, c, kind) {
  buildings.push({ x, z, w, d, h, c, kind });
  addBox(x, 0, z, w, h, d);
}

/* --- temple precinct (reserved) --- */
const TEMPLE = { x: 0, z: 0, r: 104 };

function genCity() {
  for (let cx = -EXT; cx <= EXT; cx += PITCH) {
    for (let cz = -EXT; cz <= EXT; cz += PITCH) {
      const dist = districtAt(cx, cz);
      if (dist === 'river' || dist === 'temple') continue;
      if (cx > SEA_X - PITCH) continue;
      const inner = PITCH - ROADW;
      let lots;
      if (dist === 'tech') lots = [[0, 0, inner * 0.72, inner * 0.72]];
      else if (dist === 'chettinad') lots = R() < 0.5
        ? [[0, 0, inner * 0.86, inner * 0.5]]
        : [[0, -inner * 0.24, inner * 0.86, inner * 0.4], [0, inner * 0.26, inner * 0.8, inner * 0.36]];
      else if (dist === 'oldtown' || dist === 'beach') {
        lots = [];
        const nx = rint(2, 3), nz = rint(2, 3);
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const w = inner / nx, d = inner / nz;
          lots.push([(i + 0.5) * w - inner / 2, (j + 0.5) * d - inner / 2, w * rnd(0.74, 0.94), d * rnd(0.74, 0.94)]);
        }
      } else {
        lots = R() < 0.45
          ? [[0, 0, inner * rnd(0.6, 0.86), inner * rnd(0.6, 0.86)]]
          : [[-inner * 0.22, 0, inner * 0.44, inner * rnd(0.6, 0.85)],
             [inner * 0.24, rnd(-6, 6), inner * 0.42, inner * rnd(0.55, 0.8)]];
      }
      for (const [ox, oz, w, d] of lots) {
        const x = cx + ox + rnd(-2.5, 2.5), z = cz + oz + rnd(-2.5, 2.5);
        if (Math.hypot(x, z) < TEMPLE.r + 22) continue;
        if (Math.abs(z - riverZ(x)) < RIVER_HW + 14) continue;
        if (x + w / 2 > SAND_X - 4) continue;
        let h, kind = 'res', c;
        const fade = sstep(EXT + 40, EXT - 200, Math.max(Math.abs(x), Math.abs(z)));
        switch (dist) {
          case 'oldtown': h = rnd(8, 21) * (0.75 + 0.25 * fade); kind = 'old'; break;
          case 'mid': h = rnd(15, 42) * (0.6 + 0.4 * fade); break;
          case 'apartments': h = rnd(22, 56) * (0.6 + 0.4 * fade); break;
          case 'chettinad': h = rnd(7.5, 13); kind = 'old'; break;
          case 'beach': h = rnd(9, 24); break;
          case 'tech': h = rnd(58, 168); kind = 'glass'; break;
          default: h = rnd(12, 30);
        }
        /* scattered high-rises give the skyline enough vertical structure to
           swing between, but the heritage quarters stay deliberately low */
        if (dist !== 'tech') {
          const r = R();
          const far = Math.hypot(x, z) > 185;      // historic core stays low
          const tall = (dist === 'mid' || dist === 'apartments') ? 0.10
                     : dist === 'beach' ? 0.08
                     : (dist === 'oldtown' && far) ? 0.07 : 0;
          if (r < tall) h = dist === 'beach' ? rnd(42, 78) : rnd(76, 146);
          else if (r < tall + 0.11) h *= rnd(1.7, 2.4);
        }
        c = pick(PALETTE[dist] || PALETTE.mid);
        addBuilding(x, z, w, d, h, c, kind);
      }
    }
  }
}
genCity();

/* --- landmark: temple complex, gopurams, tank, lighthouse, bridges --- */
const landmarks = [];
const GOPURAMS = [
  { x: 0, z: -132, rot: 0, h: 68 }, { x: 0, z: 132, rot: PI, h: 64 },
  { x: -132, z: 0, rot: -PI / 2, h: 58 }, { x: 132, z: 0, rot: PI / 2, h: 58 }
];
for (const g of GOPURAMS) {
  const wide = Math.abs(Math.cos(g.rot)) > 0.5;
  const bw = wide ? 24 : 15, bd = wide ? 15 : 24;
  g.bw = bw; g.bd = bd;                 // needed later by the gopuram mesh builder
  landmarks.push({ type: 'gopuram', ...g, bw, bd });
  addBox(g.x, 0, g.z, bw, g.h * 0.35, bd);
  addBox(g.x, g.h * 0.35, g.z, bw * 0.75, g.h * 0.35, bd * 0.75);
  addBox(g.x, g.h * 0.70, g.z, bw * 0.46, g.h * 0.30, bd * 0.46);
}
/* prakaram walls */
const PW = 132;
for (const [ax, az, w, d] of [[0, -PW, 224, 6], [0, PW, 224, 6], [-PW, 0, 6, 224], [PW, 0, 6, 224]]) {
  landmarks.push({ type: 'wall', x: ax, z: az, w, d, h: 11 });
  addBox(ax, 0, az, w, 11, d);
}
landmarks.push({ type: 'vimana', x: 0, z: 0, h: 44 });
addBox(0, 0, 0, 34, 16, 34); addBox(0, 16, 0, 22, 16, 22); addBox(0, 32, 0, 12, 12, 12);
landmarks.push({ type: 'mandapam', x: 0, z: -62, w: 60, d: 36, h: 12 });
addBox(0, 0, -62, 60, 12, 36);
landmarks.push({ type: 'tank', x: -196, z: 152, s: 96 });
landmarks.push({ type: 'lighthouse', x: 452, z: -96, h: 52 });
addBox(452, 0, -96, 15, 52, 15);
const BRIDGES = [-330, -60, 190, 372];
for (const bx of BRIDGES) {
  const bz = riverZ(bx);
  landmarks.push({ type: 'bridge', x: bx, z: bz, len: (RIVER_HW + 26) * 2 });
  addBox(bx, 7.4, bz, 20, 1.6, (RIVER_HW + 26) * 2);
}
/* a couple of comms masts for high anchors */
for (const [mx, mz, mh] of [[-410, -430, 96], [300, -450, 88], [-300, 380, 82], [420, 250, 92]]) {
  landmarks.push({ type: 'mast', x: mx, z: mz, h: mh });
  addBox(mx, 0, mz, 7, mh, 7);
}

