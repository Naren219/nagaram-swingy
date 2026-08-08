/* =====================================================================
   GEOMETRY HELPERS
   ===================================================================== */
const SRGB = (hex) => new THREE.Color(hex).convertSRGBToLinear();

function mergeGeos(parts) {
  const list = parts.map(p => ({
    g: p.geo.index ? p.geo.toNonIndexed() : p.geo,
    m: p.matrix || new THREE.Matrix4(),
    c: SRGB(p.color === undefined ? 0xffffff : p.color)
  }));
  let total = 0;
  for (const it of list) total += it.g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0; const nm = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const it of list) {
    const P = it.g.attributes.position, N = it.g.attributes.normal;
    nm.getNormalMatrix(it.m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(it.m);
      pos[(o + i) * 3] = v.x; pos[(o + i) * 3 + 1] = v.y; pos[(o + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[(o + i) * 3] = v.x; nor[(o + i) * 3 + 1] = v.y; nor[(o + i) * 3 + 2] = v.z;
      col[(o + i) * 3] = it.c.r; col[(o + i) * 3 + 1] = it.c.g; col[(o + i) * 3 + 2] = it.c.b;
    }
    o += P.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const M4 = (x, y, z, sx, sy, sz, ry) => new THREE.Matrix4().compose(
  V3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry || 0, 0)),
  V3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BOXB = BOX.clone().translate(0, 0.5, 0);   // base at y=0
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0, 0.5, 0);
/* USE_COLOR must be defined for instanceColor to reach the fragment stage */
const BOXB_C = (() => {
  const g = BOXB.clone().toNonIndexed();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
})();
/* tapered rectangular prism, base at y = 0 */
function taper(w0, d0, w1, d1, h) {
  const hw0 = w0 / 2, hd0 = d0 / 2, hw1 = w1 / 2, hd1 = d1 / 2;
  const b = [[-hw0, 0, -hd0], [hw0, 0, -hd0], [hw0, 0, hd0], [-hw0, 0, hd0]];
  const t2 = [[-hw1, h, -hd1], [hw1, h, -hd1], [hw1, h, hd1], [-hw1, h, hd1]];
  const quads = [[b[0], b[1], t2[1], t2[0]], [b[1], b[2], t2[2], t2[1]],
                 [b[2], b[3], t2[3], t2[2]], [b[3], b[0], t2[0], t2[3]],
                 [t2[0], t2[1], t2[2], t2[3]], [b[3], b[2], b[1], b[0]]];
  const pos = [];
  for (const q of quads) {
    pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

