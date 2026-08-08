'use strict';
/* =========================================================================
   NAGARAM — an open-world web-swinging sandbox on a Coromandel-inspired coast
   Original character & city. Physics: XPBD rope constraints, quadratic drag,
   AoA lift, swept sphere-vs-AABB collision, 120 Hz fixed step.
   ========================================================================= */

/* ---------------------------------------------------------------- utils */
const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let R = mulberry32(20260804);
const rnd = (a, b) => (b === undefined ? R() * (a === undefined ? 1 : a) : a + R() * (b - a));
const rint = (a, b) => Math.floor(a + R() * (b - a + 1));
const pick = (arr) => arr[Math.floor(R() * arr.length)];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* a coarse pointer at boot means a phone or tablet: spend fewer pixels and a
   smaller shadow map so the input loop never fights the GPU for frame time */
const COARSE = matchMedia('(pointer: coarse)').matches;

/* ---------------------------------------------------------- renderer */
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, COARSE ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.35, 5200);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ------------------------------------------------------------- sky */
const skyUni = {
  uTop: { value: new THREE.Color(0x2f6ea8) },
  uMid: { value: new THREE.Color(0x9fc2d6) },
  uBot: { value: new THREE.Color(0xe7cfa8) },
  uSun: { value: V3(0.4, 0.35, -0.85) },
  uSunCol: { value: new THREE.Color(0xffe6bc) },
  uCloud: { value: 0.55 },
  uTime: { value: 0 }
};
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUni,
  vertexShader: `
    varying vec3 vDir;
    void main(){ vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 vDir;
    uniform vec3 uTop,uMid,uBot,uSun,uSunCol; uniform float uCloud,uTime;
    float h21(vec2 p){ p=fract(p*vec2(127.1,311.7)); p+=dot(p,p+27.31); return fract(p.x*p.y); }
    float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      float a=h21(i),b=h21(i+vec2(1.,0.)),c=h21(i+vec2(0.,1.)),d=h21(i+vec2(1.,1.));
      return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
    float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
    void main(){
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(uBot, uMid, smoothstep(-0.10, 0.24, h));
      col = mix(col, uTop, smoothstep(0.16, 0.80, h));
      vec3 sd = normalize(uSun);
      float s = max(dot(d, sd), 0.0);
      col += uSunCol * pow(s, 1400.0) * 9.0;
      col += uSunCol * pow(s, 10.0) * 0.30;
      col += uSunCol * pow(s, 2.2) * 0.11 * (1.0 - smoothstep(0.0, 0.42, h));
      if (h > 0.02) {
        vec2 cp = d.xz / max(h, 0.02) * 0.55 + vec2(uTime * 0.006, uTime * 0.003);
        float c = fbm(cp * 0.9);
        c = smoothstep(0.52, 0.86, c) * smoothstep(0.02, 0.22, h) * uCloud;
        vec3 cc = mix(uMid * 1.25, uSunCol * 1.15, pow(s, 3.0) * 0.6 + 0.25);
        col = mix(col, cc, c);
      }
      gl_FragColor = vec4(col, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 20), skyMat);
sky.frustumCulled = false; sky.renderOrder = -1000;
scene.add(sky);

/* env probe: a tiny scene with just the sky, rendered to a cubemap for glass */
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 16), skyMat));
const envRT = new THREE.WebGLCubeRenderTarget(128, {
  format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter
});
const envCam = new THREE.CubeCamera(1, 6000, envRT);
let envDirty = true;

/* ---------------------------------------------------------- lighting */
const sun = new THREE.DirectionalLight(0xffe9c4, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(COARSE ? 1024 : 2048, COARSE ? 1024 : 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 900;
sun.shadow.camera.left = -135; sun.shadow.camera.right = 135;
sun.shadow.camera.top = 135; sun.shadow.camera.bottom = -135;
sun.shadow.bias = -0.0009; sun.shadow.normalBias = 0.55;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbcd9ec, 0x6b5a44, 0.85);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xc9d6dc, 0.00105);

const TOD = [
  { name: 'noon', sun: [0.32, 0.86, -0.4], sunC: 0xfff0d0, sunI: 2.7, top: 0x2a6fb0, mid: 0xa8c8dc, bot: 0xe6d8bd,
    hemiS: 0xbcd9ec, hemiG: 0x6b5a44, hemiI: 0.9, fog: 0xcbd8de, fogD: 0.00105, night: 0, cloud: 0.5, exp: 1.05 },
  { name: 'evening', sun: [-0.86, 0.20, 0.18], sunC: 0xffb066, sunI: 2.5, top: 0x2b5c8e, mid: 0xd79c72, bot: 0xf0c489,
    hemiS: 0xe8b489, hemiG: 0x59422f, hemiI: 0.7, fog: 0xdfae86, fogD: 0.00125, night: 0.25, cloud: 0.72, exp: 1.1 },
  { name: 'night', sun: [-0.4, 0.42, 0.6], sunC: 0x9ab6e0, sunI: 0.30, top: 0x050a18, mid: 0x0d1a30, bot: 0x21283a,
    hemiS: 0x24344f, hemiG: 0x0d1014, hemiI: 0.32, fog: 0x0d1622, fogD: 0.00160, night: 1, cloud: 0.35, exp: 1.35 },
  { name: 'dawn', sun: [0.88, 0.13, -0.30], sunC: 0xffcf9a, sunI: 2.1, top: 0x3f6f9e, mid: 0xc0b6c4, bot: 0xf3cbb0,
    hemiS: 0xdcc8c6, hemiG: 0x4d4238, hemiI: 0.66, fog: 0xd9c7c0, fogD: 0.00145, night: 0.35, cloud: 0.6, exp: 1.08 }
];
let todIdx = 1;                      // seeds the facade uniforms; applyDay() takes over per-frame
const facadeShaders = [];

