/* =====================================================================
   WATER
   ===================================================================== */
let waterUni = {
  uTime: { value: 0 }, uSun: { value: V3(0, 1, 0) }, uSunCol: { value: new THREE.Color(0xffffff) },
  uNight: { value: 0 }, uSky: skyUni.uMid, uFogColor: { value: new THREE.Color(0xc9d6dc) },
  uFogDensity: { value: 0.0016 }, uShore: { value: SEA_X }, uDeep: { value: SRGB(0x0b3a46) },
  uShallow: { value: SRGB(0x1d7f80) }
};
const waterMat = new THREE.ShaderMaterial({
  uniforms: waterUni, side: THREE.DoubleSide,
  vertexShader: `
    uniform float uTime; varying vec3 vW;
    float wv(vec2 p,float t){ return sin(p.x*0.052+t*1.05)*0.36 + sin(p.y*0.069-t*0.91)*0.27
      + sin((p.x+p.y*0.7)*0.019+t*0.55)*0.55 + sin((p.x*0.7-p.y)*0.15-t*1.7)*0.09; }
    void main(){
      vec4 w0 = modelMatrix * vec4(position,1.0);
      vec3 p = position; p.z += wv(w0.xz, uTime);
      vec4 wp = modelMatrix * vec4(p,1.0); vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `
    varying vec3 vW;
    uniform float uTime,uNight,uFogDensity,uShore;
    uniform vec3 uSun,uSunCol,uSky,uFogColor,uDeep,uShallow;
    float wv(vec2 p,float t){ return sin(p.x*0.052+t*1.05)*0.36 + sin(p.y*0.069-t*0.91)*0.27
      + sin((p.x+p.y*0.7)*0.019+t*0.55)*0.55 + sin((p.x*0.7-p.y)*0.15-t*1.7)*0.09; }
    void main(){
      float e=1.1;
      float hx = wv(vW.xz+vec2(e,0.0),uTime)-wv(vW.xz-vec2(e,0.0),uTime);
      float hz = wv(vW.xz+vec2(0.0,e),uTime)-wv(vW.xz-vec2(0.0,e),uTime);
      vec3 n = normalize(vec3(-hx/(2.0*e), 1.0, -hz/(2.0*e)));
      vec3 v = normalize(cameraPosition - vW);
      float fr = pow(1.0 - clamp(dot(n,v),0.0,1.0), 4.0)*0.86 + 0.05;
      vec3 body = mix(uDeep, uShallow, clamp(0.5 + (1.0 - smoothstep(0.0,60.0,abs(vW.x-uShore)))*0.7,0.0,1.0));
      vec3 col = mix(body, uSky*0.9, fr);
      vec3 sd = normalize(uSun);
      float sp = pow(max(dot(reflect(-v,n), sd),0.0), 180.0);
      col += uSunCol * sp * 2.2 * (1.0-uNight*0.7);
      float crest = smoothstep(0.55,0.95, wv(vW.xz,uTime));
      float shore = (1.0 - smoothstep(1.0,16.0,abs(vW.x-uShore)));
      col = mix(col, vec3(0.75,0.78,0.76), max(crest*0.20, shore*0.55*(0.6+0.4*sin(vW.z*0.35+uTime*1.4))));
      float fd = length(cameraPosition - vW);
      float fog = 1.0 - exp(-uFogDensity*uFogDensity*fd*fd);
      col = mix(col, uFogColor, clamp(fog,0.0,1.0));
      gl_FragColor = vec4(col,1.0); }`
});
{
  const oceanW = 1700 - (SEA_X - 8);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(oceanW, 2600, 70, 100), waterMat);
  ocean.rotation.x = -PI / 2;
  ocean.position.set((SEA_X - 8) + oceanW / 2, 0.05, 0);
  ocean.frustumCulled = false; scene.add(ocean);
  /* river ribbon */
  const pos = [], N = 130;
  for (let i = 0; i < N; i++) {
    const x0 = -GHALF + (i / (N - 1)) * GHALF * 2, x1 = -GHALF + ((i + 1) / (N - 1)) * GHALF * 2;
    if (i === N - 1) break;
    const a = -(riverZ(x0) - RIVER_HW), b = -(riverZ(x0) + RIVER_HW);
    const c = -(riverZ(x1) - RIVER_HW), d = -(riverZ(x1) + RIVER_HW);
    pos.push(x0, a, 0, x1, c, 0, x1, d, 0, x0, a, 0, x1, d, 0, x0, b, 0);
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  rg.computeVertexNormals();
  const river = new THREE.Mesh(rg, waterMat);
  river.rotation.x = -PI / 2; river.position.y = 0.06; river.frustumCulled = false;
  scene.add(river);
}

