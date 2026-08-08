/* =====================================================================
   PROCEDURAL FACADE MATERIAL
   ===================================================================== */
const FACADE_HEAD = `
varying vec3 vWPos; varying vec3 vWNrm;
uniform float uNight; uniform float uMode; uniform float uFW; uniform float uFH;
vec3 gGlow = vec3(0.0);
float h21f(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p,p+31.71); return fract(p.x*p.y); }
float vn2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=h21f(i),b=h21f(i+vec2(1.,0.)),c=h21f(i+vec2(0.,1.)),d=h21f(i+vec2(1.,1.));
  return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
`;
const FACADE_BODY = `
{
  vec3 nn = normalize(vWNrm);
  float up = abs(nn.y);
  if (up > 0.55) {
    /* ---- rooftops: tar, patches, drain slope ---- */
    float t = vn2(vWPos.xz * 0.55);
    float t2 = vn2(vWPos.xz * 0.13);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.52, vec3(0.055,0.052,0.050), 0.55 + 0.35*t2);
    diffuseColor.rgb *= 0.86 + 0.30 * t;
  } else {
    vec2 uv = (abs(nn.x) > abs(nn.z)) ? vec2(vWPos.z, vWPos.y) : vec2(vWPos.x, vWPos.y);
    float FW = uFW, FH = uFH;
    vec2 g = vec2(uv.x / FW, (uv.y - 0.9) / FH);
    vec2 cel = floor(g), f = fract(g);
    float seed = h21f(cel*1.31 + vec2(floor(vWPos.x/61.0)*3.7, floor(vWPos.z/61.0)*1.9));
    float floorY = (uv.y - 0.9);

    /* base wall wash + grime + damp streaks */
    float grime = vn2(uv * vec2(0.35, 0.09));
    diffuseColor.rgb *= 0.80 + 0.26 * grime;
    diffuseColor.rgb *= 1.0 - 0.20 * smoothstep(0.55, 0.98, vn2(uv*vec2(0.9,0.05)));
    diffuseColor.rgb *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 4.0, vWPos.y));

    /* floor slab lines */
    diffuseColor.rgb *= 1.0 - 0.30 * (1.0 - smoothstep(0.0, 0.10, f.y)) * step(2.0, floorY);

    float win = 0.0; vec3 wcol = vec3(0.0);
    if (uMode > 1.5) {
      /* ---- curtain-wall tower: ribbon glazing + mullions ---- */
      float wx = smoothstep(0.03,0.07,f.x) * (1.0 - smoothstep(0.93,0.97,f.x));
      float wy = smoothstep(0.10,0.15,f.y) * (1.0 - smoothstep(0.82,0.90,f.y));
      win = wx * wy;
      float refl = 0.30 + 0.55 * pow(clamp(0.55 + 0.45*sin(uv.x*0.06 + uv.y*0.02),0.0,1.0), 2.0);
      wcol = mix(vec3(0.020,0.038,0.052), vec3(0.10,0.20,0.30), refl);
      wcol = mix(wcol, vec3(0.9,0.72,0.42)*0.35, uNight * step(0.55, seed));
      gGlow += vec3(1.05,0.86,0.55) * win * uNight * step(0.55, seed) * 0.85;
      diffuseColor.rgb = mix(diffuseColor.rgb*0.55, wcol, win);
    } else {
      float shutter = (uMode > 0.5) ? step(0.48, abs(f.x-0.5)*2.0) * 0.35 : 0.0;
      float wx = step(0.20, f.x) * step(f.x, 0.80);
      float wy = step(0.28, f.y) * step(f.y, 0.84);
      win = wx * wy * step(2.6, floorY) * step(0.08, seed);
      vec3 dayGlass = mix(vec3(0.020,0.028,0.034), vec3(0.10,0.15,0.20), f.y);
      float litOn = step(0.42, fract(seed*7.31));
      vec3 warm = vec3(0.55,0.35,0.16);
      wcol = mix(dayGlass, mix(vec3(0.012,0.014,0.018), warm, litOn), uNight);
      gGlow += vec3(1.15,0.80,0.42) * win * uNight * litOn * (0.65 + 0.5*fract(seed*13.7));
      /* balcony rail: a lighter band under every window */
      float rail = step(0.14, f.y) * step(f.y, 0.26) * wx * step(2.6, floorY);
      diffuseColor.rgb = mix(diffuseColor.rgb, wcol, win * (1.0 - shutter*step(0.5,fract(seed*3.1))));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*0.55 + vec3(0.09), rail*0.8);
    }

    /* ---- street level: shutters, painted signboards ---- */
    if (floorY < 4.4 && uMode < 1.5) {
      float sc = floor(uv.x / 5.2);
      float sh = h21f(vec2(sc, floor(vWPos.z*0.02+vWPos.x*0.02)));
      vec3 shop = mix(vec3(0.35,0.10,0.06), vec3(0.42,0.30,0.05), fract(sh*5.1));
      shop = mix(shop, vec3(0.05,0.20,0.15), step(0.66, sh));
      shop = mix(shop, vec3(0.10,0.13,0.30), step(0.86, sh));
      float shutterface = step(floorY, 3.2) * step(0.4, floorY);
      float ribs = 0.75 + 0.25*step(0.5, fract(uv.x*3.4));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055,0.058,0.060)*ribs, shutterface*step(0.35,sh));
      /* signboard band */
      float sign = step(3.35, floorY) * step(floorY, 4.25);
      float glyph = step(0.42, fract(uv.x*2.6 + sh*3.0)) * step(3.55, floorY) * step(floorY, 4.05);
      vec3 sgn = mix(shop*1.6, vec3(0.85,0.82,0.72), glyph*0.85);
      diffuseColor.rgb = mix(diffuseColor.rgb, sgn, sign*0.92);
      gGlow += sgn * sign * uNight * 0.55;
    }
  }
}
`;
function hookFacade(mat, mode, fw, fh) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uNight = { value: TOD[todIdx].night };
    s.uniforms.uMode = { value: mode };
    s.uniforms.uFW = { value: fw };
    s.uniforms.uFH = { value: fh };
    s.vertexShader = 'varying vec3 vWPos; varying vec3 vWNrm;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       mat4 imat = mat4(1.0);
       #ifdef USE_INSTANCING
         imat = instanceMatrix;
       #endif
       vec4 wp4 = modelMatrix * imat * vec4( transformed, 1.0 );
       vWPos = wp4.xyz;
       vWNrm = normalize( mat3( modelMatrix * imat ) * objectNormal );`);
    s.fragmentShader = FACADE_HEAD + s.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FACADE_BODY)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += gGlow;');
    facadeShaders.push(s);
  };
  mat.customProgramCacheKey = () => 'facade' + mode;
  return mat;
}

