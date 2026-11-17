/* =====================================================================
   WEATHER, AND WHAT KIND OF DAY IT IS
   ---------------------------------------------------------------------
   On a day of showers or monsoon (11-city-day.js), squalls come in off the
   bay. A squall is a band of rain SQ_LEN deep, as wide as the city, crossing
   it at SQ_V. Under it: rain, the light goes, the streets darken and stay
   wet a while after. Its outflow runs ahead of it as a gust in the direction
   it is going, and the air is rising along its leading edge: the same lift a
   thermal gives, in a long moving line, which a glider can ride as it comes.
   There is nothing to do about a squall. It goes over, and the same streets
   are a different place for a minute.

     squall.on, squall.s   whether one is crossing, and where its front is
     squallRain(x, z)      0..1, how hard it is raining there
     squallLift(x, y, z)   m/s of rising air (thermalAt takes the larger)
     squallWind(W)         adds the gust at the player to the wind

   And on a lamp night, the temple's walls, towers and tank are lit with oil
   lamps after dark.
   ===================================================================== */
const SQ_V = 10, SQ_LEN = 520, SQ_FAR = 1000;   // m/s across the city · depth of the rain · where it starts and ends
const SQ_GUST = 8.5, SQ_LIFT = 18;              // m/s of outflow at its strongest · of rise along the edge
const SQ_LIFE = (2 * SQ_FAR + SQ_LEN) / SQ_V;   // seconds from coming in to gone
const SQ_FIRST = 20;                            // the first one of a session starts this soon
const squall = { on: false, t0: -1e9, head: PI, dx: -1, dz: 0, s: -1e9, k: -1, forced: false };
/* which squall, if any, is crossing now: the schedule is the day's, and each
   squall's heading comes from the day's seed, so a day's weather is the same
   for everyone who plays it */
function squallClock(t) {
  if (!squall.forced || t - squall.t0 > SQ_LIFE) {
    squall.forced = false;
    const every = CITY_DAY.squallEvery;
    if (!isFinite(every) || t < SQ_FIRST) { squall.on = false; return; }
    const k = Math.floor((t - SQ_FIRST) / every);
    if (k !== squall.k) {
      squall.k = k;
      const r = mulberry32(CITY_DAY.seed * 31 + k * 977 + 5);
      r(); squall.head = PI + (r() - 0.5) * 1.1;           // off the bay, westward
    }
    squall.t0 = SQ_FIRST + k * every;
  }
  squall.dx = Math.cos(squall.head); squall.dz = Math.sin(squall.head);
  squall.s = -SQ_FAR + SQ_V * (t - squall.t0);
  squall.on = t - squall.t0 < SQ_LIFE;
}
/* one now, coming from the far side along a heading: for tests and for trying it */
function startSquall(head, t) {
  squall.forced = true; squall.head = head === undefined ? PI : head; squall.t0 = t === undefined ? T : t;
  squallClock(T);
}
/* u: how far ahead of the front a point is. Behind it (u < 0) is the rain. */
const squallU = (x, z) => x * squall.dx + z * squall.dz - squall.s;
function squallRain(x, z) {
  if (!squall.on) return 0;
  const u = squallU(x, z);
  return sstep(0, 60, -u) * sstep(-SQ_LEN, -SQ_LEN + 160, u);
}
function squallLift(x, y, z) {
  if (!squall.on) return 0;
  const u = squallU(x, z);
  if (u < -20 || u > 110) return 0;
  const a = (u - 40) / 26;
  return SQ_LIFT * Math.exp(-a * a) * (1 - sstep(140, 300, y));
}
function squallWind(W) {
  if (!squall.on) return false;
  const u = squallU(player.p.x, player.p.z);
  const g = sstep(-SQ_LEN, -SQ_LEN + 200, u) * (1 - sstep(90, 220, u));
  if (g <= 0) return false;
  const gust = SQ_GUST * g * (0.82 + 0.18 * Math.sin(T * 1.7) + 0.12 * Math.sin(T * 4.3 + 1));
  W.x += squall.dx * gust; W.z += squall.dz * gust;
  return true;
}

/* ---- what it looks like ---- */
/* the squall itself, seen coming across the city: a grey body of rain */
const squallBody = new THREE.Mesh(new THREE.BoxGeometry(SQ_LEN, 320, 2600),
  new THREE.MeshBasicMaterial({ color: SRGB(0x5f6a75), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
squallBody.frustumCulled = false; squallBody.visible = false; scene.add(squallBody);
/* rain round the camera: streaks that fall through a box that follows you,
   wrapped in the shader, so nothing is moved on the CPU */
const RAIN_N = 2600, RAIN_BOX = 70, RAIN_H = 44;
const rainUni = { uCam: { value: V3() }, uTime: { value: 0 }, uSlant: { value: new THREE.Vector2() }, uA: { value: 0 } };
const rain = (() => {
  const g = new THREE.BufferGeometry(), seed = new Float32Array(RAIN_N * 6), end = new Float32Array(RAIN_N * 2);
  const rr = mulberry32(911);
  for (let i = 0; i < RAIN_N; i++) {
    const a = rr(), b = rr(), c = rr();
    seed.set([a, b, c, a, b, c], i * 6); end[i * 2 + 1] = 1;
  }
  g.setAttribute('position', new THREE.BufferAttribute(seed, 3));   // the seed is the position: three.js wants one
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: rainUni, transparent: true, depthWrite: false,
    vertexShader: `
      uniform vec3 uCam; uniform float uTime; uniform vec2 uSlant;
      attribute float aEnd; varying float vA;
      void main() {
        vec3 s = position;
        vec3 p;
        p.x = uCam.x + (fract(s.x - uCam.x / ${RAIN_BOX.toFixed(1)}) - 0.5) * ${RAIN_BOX.toFixed(1)};
        p.z = uCam.z + (fract(s.z - uCam.z / ${RAIN_BOX.toFixed(1)}) - 0.5) * ${RAIN_BOX.toFixed(1)};
        p.y = uCam.y + (fract(s.y - uTime * 0.62 - uCam.y / ${RAIN_H.toFixed(1)}) - 0.5) * ${RAIN_H.toFixed(1)};
        p += aEnd * vec3(uSlant.x, -1.0, uSlant.y) * 1.9;
        vA = 1.0 - aEnd * 0.8;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uA; varying float vA;
      void main() { gl_FragColor = vec4(0.78, 0.82, 0.86, uA * vA); }`
  });
  const l = new THREE.LineSegments(g, m);
  l.frustumCulled = false; l.visible = false; scene.add(l);
  return l;
})();

/* ---- the lamps of a festival night ---- */
const lamps = (() => {
  if (!CITY_DAY.lamps) return null;
  const pts = [];
  const ring = (x, z, w, d, y, step) => {             // the edge of a w x d rectangle at height y
    for (const [ax, az, len, along] of [[x, z - d / 2, w, true], [x, z + d / 2, w, true], [x - w / 2, z, d, false], [x + w / 2, z, d, false]]) {
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i <= n; i++) {
        const o = -len / 2 + len * i / n;
        pts.push(along ? ax + o : ax, y, along ? az : az + o);
      }
    }
  };
  /* along the courtyard edge of the prakaram's coping (60-monuments.js: 0.8
     deep, 2.6 walls wide; houses crowd its outer edge), gateways left dark */
  for (const [ax, az, along] of [[0, -PW, true], [0, PW, true], [-PW, 0, false], [PW, 0, false]]) {
    const e = -Math.sign(ax + az) * 7.6;
    for (let o = -110; o <= 110; o += 2.6) {
      if (WALL_GAPS.some(([c, gw]) => Math.abs(o - c) < gw / 2 + 0.5)) continue;
      pts.push(along ? ax + o : ax + e, WALL_H + 0.95, along ? az + e : az + o);
    }
  }
  /* each tier of each gopuram, and of the vimana; round the tank and the mandapam */
  for (const g of GOPURAMS) {
    ring(g.x, g.z, g.bw + 0.6, g.bd + 0.6, g.h * 0.35 + 0.3, 2.2);
    ring(g.x, g.z, g.bw * 0.75 + 0.5, g.bd * 0.75 + 0.5, g.h * 0.70 + 0.3, 2.2);
    ring(g.x, g.z, g.bw * 0.46 + 0.4, g.bd * 0.46 + 0.4, g.h + 0.3, 2.0);
  }
  ring(0, 0, 34.6, 34.6, 16.3, 2.4); ring(0, 0, 22.6, 22.6, 32.3, 2.2); ring(0, 0, 12.6, 12.6, 44.3, 2.0);
  ring(0, -62, 60.6, 36.6, 12.3, 2.6);
  ring(TANK.x, TANK.z, TANK.pool * 2 + 1, TANK.pool * 2 + 1, 0.75, 2.4);    // on the steps, above the coping
  ring(TANK.x, TANK.z, TANK.half * 2 - 1, TANK.half * 2 - 1, 0.75, 2.8);
  const g = new THREE.BufferGeometry(), ph = new Float32Array(pts.length / 3), rr = mulberry32(3301);
  for (let i = 0; i < ph.length; i++) ph[i] = rr() * TAU;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const uni = { uNight: { value: 0 }, uTime: { value: 0 }, uScale: { value: 400 } };
  const m = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uTime, uScale; attribute float aPh; varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vF = 0.78 + 0.22 * sin(uTime * 7.0 + aPh) * sin(uTime * 2.3 + aPh * 1.7);
        gl_PointSize = clamp(1.6 * uScale / -mv.z, 2.5, 30.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uNight; varying float vF;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = dot(c, c) * 4.0;
        float a = exp(-r * 2.4) * uNight * vF;
        gl_FragColor = vec4(vec3(1.0, 0.7, 0.34) * a * 1.5, a);
      }`
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; scene.add(p);
  p.uni = uni;
  return p;
})();
document.getElementById('today').textContent = CITY_DAY.line;

/* ---- each frame ---- */
let rainHere = 0, rainView = 0, gloom = 0, wetness = 0, flash = 0, squallSaid = -1;
const GREY = SRGB(0x88919a), GREY_SKY = SRGB(0x6f7a84);
const groundBase = ground.material.color.clone();
/* before the wind and the physics: where the squall is now */
function updateWeather(dt) {
  squallClock(T);
  const on = squall.on;
  rainHere = on ? squallRain(player.p.x, player.p.z) : 0;
  const cam = camera.position;
  const rv = on ? squallRain(cam.x, cam.z) : 0;
  rainView = damp(rainView, rv, 1.5, dt);
  /* the light goes before the rain arrives: you see it coming */
  const ahead = on ? squallU(cam.x, cam.z) : 1e9;
  gloom = damp(gloom, Math.max(rv, on ? 0.55 * (1 - sstep(0, 650, ahead)) * sstep(-SQ_LEN - 300, -SQ_LEN, ahead) : 0), 0.8, dt);
  wetness = rainHere > 0.3 ? damp(wetness, 1, 1 / 18, dt) : damp(wetness, 0, 1 / 90, dt);
  /* one word as it comes in, not one per frame */
  if (on && squall.k !== squallSaid && !photoMode) {
    const u = squallU(player.p.x, player.p.z);
    if (u < 420 && u > 0) { squallSaid = squall.k; toast('a squall is coming in off the bay'); }
  }
  if (on && rv > 0.4 && Math.random() < dt / 9) { flash = 1; emit('thunder', 0.3 + 0.7 * rv); }
  flash = Math.max(0, flash - dt * 4.5);
}
/* after applyDay has set the day's light: the squall takes some of it away */
function applyWeather(dt) {
  squallBody.visible = squall.on;
  if (squall.on) {
    const c = squall.s - SQ_LEN / 2;
    squallBody.position.set(squall.dx * c, 160, squall.dz * c);
    squallBody.rotation.y = -squall.head;
    /* fades in and out at either end of its life, and thins from inside */
    const life = sstep(0, 25, T - squall.t0) * (1 - sstep(SQ_LIFE - 25, SQ_LIFE, T - squall.t0));
    squallBody.material.opacity = 0.34 * life * (1 - 0.75 * rainView);
  }
  rain.visible = rainView > 0.01;
  if (rain.visible) {
    rainUni.uCam.value.copy(camera.position); rainUni.uTime.value = T;
    rainUni.uSlant.value.set(WIND.x * 0.05, WIND.z * 0.05);
    rainUni.uA.value = 0.55 * rainView;
  }
  if (gloom > 0.002 || flash > 0) {
    scene.fog.density *= 1 + 2.6 * rainView;
    scene.fog.color.lerp(GREY, 0.6 * gloom);
    sun.intensity *= 1 - 0.7 * gloom;
    hemi.intensity = hemi.intensity * (1 - 0.3 * gloom) + flash * 1.4;
    skyUni.uTop.value.lerp(GREY_SKY, 0.55 * gloom);
    skyUni.uMid.value.lerp(GREY, 0.55 * gloom);
    skyUni.uBot.value.lerp(GREY, 0.45 * gloom);
    skyUni.uCloud.value = Math.max(skyUni.uCloud.value, gloom);
    waterUni.uFogColor.value.copy(scene.fog.color);
    waterUni.uFogDensity.value = scene.fog.density;
  }
  ground.material.color.copy(groundBase).multiplyScalar(1 - 0.3 * wetness);
  if (lamps) {
    lamps.uni.uNight.value = sstep(0.3, 0.75, curNight);
    lamps.uni.uTime.value = T;
    lamps.uni.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * PI / 360));
  }
}
