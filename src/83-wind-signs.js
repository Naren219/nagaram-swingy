/* =====================================================================
   WIND YOU CAN READ
   ---------------------------------------------------------------------
   The breeze has always steered the glide (the aero model runs on airspeed)
   and nothing showed it but the thermals. Three things do now, and all three
   read the same WIND the physics does, so what you see is what you will fly
   through:

     pennants  on the gopurams and the tallest roofs: they point down-wind,
               stream flatter the harder it blows, and hang when it drops
     kites     fly down-wind of whoever is holding them (75-traffic.js)
     palms     and trees lean with it, more toward the crown (70-vegetation.js)

   Decoration only: nothing here is read back by the physics.
   ===================================================================== */
const windUni = { uWind: { value: new THREE.Vector2() }, uTime: { value: 0 } };
function updateWindSigns(t) {
  windUni.uWind.value.set(WIND.x, WIND.z);
  windUni.uTime.value = t;
}

/* ---- pennants ---- */
const FLAG_COLORS = [0xe8732c, 0xd9a83a, 0xc43a2e, 0xf2efe6, 0x2f8f83];
const flags = [];      // { x, y, z, len } : the hoist, and how long the pennant is
for (const g of GOPURAMS) flags.push({ x: g.x, y: g.h + 2, z: g.z, len: 11, mast: 10, c: 0 });
{
  /* every tower tall enough to glide off gets one, on a corner of its roof */
  const tall = buildings.filter(b => b.h > 52).sort((a, b) => b.h - a.h).slice(0, 60);
  let k = 0;
  for (const b of tall) {
    const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1;
    flags.push({ x: b.x + sx * (b.w / 2 - 1.2), y: b.h, z: b.z + sz * (b.d / 2 - 1.2), len: 7.5, mast: 8, c: 1 + (k % 4) });
    k++;
  }
}
/* The pennant is a strip along +x, one unit long. The shader does the rest:
   it lays the strip down-wind, lets it droop as the wind drops, tapers it to
   a point and runs a ripple out along it. Each instance is a position and a
   size only, so the strip's own axes are the world's. */
const flagMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
flagMat.onBeforeCompile = (sh) => {
  sh.uniforms.uWind = windUni.uWind; sh.uniforms.uTime = windUni.uTime;
  sh.vertexShader = 'uniform vec2 uWind;\nuniform float uTime;\n' + sh.vertexShader
    /* lit as if it lay flat under the sky: bright by day, dark by night, and
       no side of it ever goes black */
    .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
    .replace('#include <begin_vertex>', `
      float ws = length(uWind);
      vec2 wd = ws > 0.01 ? uWind / ws : vec2(1.0, 0.0);
      float fly = smoothstep(0.3, 3.6, ws);
      float along = position.x;
      float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23;
      float rip = sin(along * 7.0 - uTime * (3.0 + ws * 1.6) + ph) * along * (0.04 + 0.09 * fly);
      float droop = mix(1.3, 0.10, fly) + 0.07 * sin(uTime * 0.9 + ph) * (1.0 - fly);
      vec3 transformed = vec3(0.0);
      transformed.xz = wd * (along * cos(droop)) + vec2(-wd.y, wd.x) * rip;
      transformed.y = position.y * (1.0 - 0.82 * along) - along * sin(droop);`);
};
{
  const strip = new THREE.PlaneGeometry(1, 0.34, 10, 1).translate(0.5, 0, 0);
  const im = new THREE.InstancedMesh(strip, flagMat, flags.length);
  const masts = new THREE.InstancedMesh(CYL, new THREE.MeshLambertMaterial({ color: SRGB(0x3a3a3c) }), flags.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  flags.forEach((f, i) => {
    /* the hoist is a little below the top of the mast */
    f.y += f.mast - f.len * 0.16;
    m.compose(V3(f.x, f.y, f.z), q, V3(f.len, f.len, f.len)); im.setMatrixAt(i, m);
    im.setColorAt(i, col.copy(SRGB(FLAG_COLORS[f.c])));
    m.compose(V3(f.x, f.y - f.mast + f.len * 0.16, f.z), q, V3(0.16, f.mast, 0.16)); masts.setMatrixAt(i, m);
  });
  im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; masts.instanceMatrix.needsUpdate = true;
  im.frustumCulled = false; masts.frustumCulled = false;
  scene.add(im); scene.add(masts);
  flags.mesh = im;
}
