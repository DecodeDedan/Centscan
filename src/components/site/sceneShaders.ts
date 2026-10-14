/** GLSL for the observatory scene (WebGL2 through three's ShaderMaterial). Kept apart so the scene file reads as structure. */

/**
 * The ¢ mark's material: dark metal with a thin-film fresnel tint limited to greens and ice,
 * contour lines at fixed heights (constant pixel width through fwidth) and one scan band sweeping up the mark.
 */
export const MARK_VERTEX = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vP;
void main(){
  vec4 world = modelMatrix * vec4(position, 1.);
  vec4 mv = viewMatrix * world;
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vP = position;
  gl_Position = projectionMatrix * mv;
}`;

export const MARK_FRAGMENT = /* glsl */ `
uniform float uTime; uniform float uWake; uniform float uEmissive; uniform float uDark;
uniform vec3 uSignal; uniform vec3 uIce; uniform vec3 uBase;
varying vec3 vN; varying vec3 vV; varying vec3 vP;
// Thin-film ramp held to deep green, signal green, ice and mint: never the purple default.
vec3 film(float t){
  t = fract(t) * 4.;
  vec3 deep = vec3(.02, .22, .16);
  vec3 c = mix(deep, uSignal, smoothstep(0., 1., t));
  c = mix(c, uIce, smoothstep(1., 2., t));
  c = mix(c, vec3(.55, .86, .74), smoothstep(2., 3., t));
  return mix(c, deep, smoothstep(3., 4., t));
}
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(vV);
  float fres = pow(1. - clamp(dot(N, V), 0., 1.), 2.2);
  vec3 L = normalize(vec3(.5, .8, .6));
  float diff = clamp(dot(N, L), 0., 1.);
  float spec = pow(clamp(dot(reflect(-L, N), V), 0., 1.), 48.);
  vec3 irid = film(fres * 1.2 + vP.y * .9 + uTime * .02);
  vec3 col = uBase * (.35 + .65 * diff);
  col = mix(col, irid, mix(.12, .85, fres));
  col += spec * mix(.35, .9, uDark);
  col = mix(col, uSignal * (1.1 + fres), uEmissive);
  // Contours at fixed heights: the mark reads as scanned data, not decoration.
  float h = vP.y * 7.; float d = abs(fract(h - .5) - .5); float w = fwidth(h);
  float line = 1. - smoothstep(w * .4, w * 1.4, d);
  col = mix(col, uSignal * mix(1.1, 1.7, uDark), line * .4 * uWake);
  // One scan band climbing the mark every few seconds.
  float scanY = mod(uTime * .45, 3.6) - 1.8;
  float band = exp(-pow((vP.y - scanY) * 9., 2.));
  col += uSignal * band * .9 * uWake * mix(.4, 1., uDark);
  gl_FragColor = vec4(col, 1.);
}`;

/**
 * Particles: transactions-as-structure. Stream particles spiral in from far out and land on the arc;
 * resident particles hold the ¢'s surface. All positions are computed here: one draw call, no CPU updates.
 * Boot: every particle starts on a far shell and eases to its path, so the mark assembles from the cloud.
 */
export const PARTICLE_VERTEX = /* glsl */ `
uniform float uTime; uniform float uBoot; uniform float uScale; uniform float uRush;
attribute vec4 aSeed; attribute float aMode; attribute vec3 aStart; attribute vec3 aHome; attribute float aDelay; attribute float aSize;
varying float vAlpha; varying float vHot;
const float TAU = 6.28318530718;
void main(){
  vec3 target;
  float hot = 0.;
  float alpha = 1.;
  if (aMode < .5) {
    float u = fract(uTime * (.035 + aSeed.x * .05) * (1. + uRush * 1.5) + aSeed.y);
    float e = 1. - pow(1. - u, 2.2);
    float r = mix(4.5 + aSeed.z * 4.5, 1., e);
    float ang = atan(aHome.y, aHome.x) + (1. - e) * (1.5 + aSeed.w * 2.) * TAU;
    target = vec3(cos(ang) * r, sin(ang) * r, mix((aSeed.w - .5) * 7., aHome.z, e));
    alpha = smoothstep(0., .12, u) * (1. - smoothstep(.93, 1., u));
    hot = smoothstep(.86, .97, u) * (1. - smoothstep(.97, 1., u));
  } else {
    float breathe = sin(uTime * (.6 + aSeed.x) + aSeed.y * TAU) * .012;
    target = aHome * (1. + breathe);
    alpha = .85;
  }
  float k = clamp((uBoot - aDelay) / .45, 0., 1.); k = k * k * (3. - 2. * k);
  vec4 mv = modelViewMatrix * vec4(mix(aStart, target, k), 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / -mv.z;
  vAlpha = alpha * mix(.12, 1., k);
  vHot = max(hot, step(.985, aSeed.x) * aMode);
}`;

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 uInk; uniform vec3 uSignal; uniform float uDark;
varying float vAlpha; varying float vHot;
void main(){
  float d = length(gl_PointCoord - .5); if (d > .5) discard;
  // Additive points pile up on the dark field, so plain particles stay dim; only arrivals run hot enough to bloom.
  vec3 col = mix(uInk * mix(1., .4, uDark), uSignal * mix(1., 2.3, uDark), vHot);
  gl_FragColor = vec4(col, smoothstep(.5, .1, d) * vAlpha * .8);
}`;

/** Finish: film grain, vignette, and chromatic aberration that is non-zero only during the boot transition. */
export const FINISH_VERTEX = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

export const FINISH_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uAberration; uniform float uVignette;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec2 d = vUv - .5; float r2 = dot(d, d);
  vec4 c = texture2D(tDiffuse, vUv);
  if (uAberration > 0.) {
    vec2 off = d * uAberration * r2 * 4.;
    c.r = texture2D(tDiffuse, vUv + off).r; c.b = texture2D(tDiffuse, vUv - off).b;
  }
  c.rgb += (hash(gl_FragCoord.xy + fract(uTime * 7.) * 91.) - .5) * uGrain;
  c.rgb *= 1. - uVignette * r2 * 2.;
  gl_FragColor = c;
}`;
