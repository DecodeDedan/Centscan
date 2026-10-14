import {
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { approach, isSpringAtRest, STAMP_SPRING, stepSpring, type SpringState } from "./tillMath";
import { STAMP_SIZE, type ReceiptLayout } from "./tillTexture";

/**
 * The hero's 3D paper till. Loaded only through a dynamic import, after first paint, so three.js never sits on the
 * critical path. It renders on demand: a frame is drawn only while something is still moving.
 */

export interface TillSceneInput {
  canvas: HTMLCanvasElement;
  layout: ReceiptLayout;
  /** Ink already painted on a transparent canvas, sized layout.width × layout.height times `printScale`. */
  print: HTMLCanvasElement;
  stamp: HTMLCanvasElement | null;
  label: HTMLCanvasElement;
  colors: { paper: string; ink: string };
  onContextLost: () => void;
}

export interface TillScene {
  /** Exposed share of the receipt, 0..1. */
  setFeed(feed: number, immediate?: boolean): void;
  setStamp(down: boolean): void;
  /** Pointer position over the hero, each axis in -1..1. */
  setPointer(x: number, y: number): void;
  setActive(active: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const MAX_DPR = 1.75;
const PAPER_W = 1;
const BODY = { width: 1.42, height: 0.44, depth: 0.74, radius: 0.07 } as const;
const SLOT_Z = 0.1;
const FOV = 26;
/** Camera pitch above the till and the ±4° pointer parallax (DESIGN.md v2). */
const PITCH_DEG = 9;
const PARALLAX_DEG = 4;
const FEED_RATE = 14;
const POINTER_RATE = 6;
const PAPER_SEGMENTS = { x: 60, y: 200 } as const;

const vertexShader = /* glsl */ `
  uniform float uExposed;
  uniform float uLength;
  uniform float uHalfWidth;
  uniform float uDroop;
  uniform float uCurl;
  uniform vec2 uSway;
  varying vec2 vUv;
  varying float vD;
  varying vec3 vNormal;

  // Lean of the paper at arc length s above the slot. Negative leans away from the camera: gravity grows with
  // the height of paper out, and the free end keeps a memory of the roll it came off.
  float theta(float s, float exposed) {
    float h = s / uLength;
    return -(uDroop * h * h + uCurl * smoothstep(exposed - 0.32, exposed, s));
  }

  void main() {
    vUv = uv;
    float u = (1.0 - uv.y) * uLength;
    float d = uExposed - u;
    vD = d;

    vec2 yz = vec2(d, 0.0);
    float th = 0.0;
    if (d > 0.0) {
      yz = vec2(0.0);
      const int N = 28;
      float ds = d / float(N);
      for (int i = 0; i < N; i++) {
        float t = theta((float(i) + 0.5) * ds, uExposed);
        yz += vec2(cos(t), sin(t)) * ds;
      }
      th = theta(d, uExposed);
    }

    float xn = position.x / uHalfWidth;
    float out_ = smoothstep(0.0, 0.35, max(d, 0.0));
    float cup = 0.03 * xn * xn * out_;
    float h = max(d, 0.0) / uLength;
    vec3 pos = vec3(position.x + uSway.x * h * h * 0.1, yz.x, yz.y + cup + uSway.y * h * h * 0.05);

    vec3 tangent = vec3(0.0, cos(th), sin(th));
    vec3 across = normalize(vec3(1.0, 0.0, 0.06 * xn / uHalfWidth * out_));
    vNormal = normalize(mat3(modelMatrix) * cross(across, tangent));
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uPrint;
  uniform sampler2D uStamp;
  uniform vec3 uPaper;
  uniform vec2 uPaperPx;
  uniform vec2 uStampCenter;
  uniform vec2 uStampSize;
  uniform float uStampAngle;
  uniform float uStampScale;
  uniform float uStampAlpha;
  uniform vec3 uKeyDir;
  uniform vec3 uFillDir;
  varying vec2 vUv;
  varying float vD;
  varying vec3 vNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 w = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), w.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), w.x), w.y);
  }

  void main() {
    if (vD < 0.0) discard;
    vec2 px = vec2(vUv.x, 1.0 - vUv.y) * uPaperPx;
    // Torn top edge: the free end was cut on a serrated blade.
    float tooth = abs(fract(vUv.x * 44.0) - 0.5) * 2.0;
    if (px.y < tooth * 12.0) discard;

    float grain = noise(px * 0.85) * 0.55 + noise(px * 0.21) * 0.45;
    float fibre = noise(vec2(px.x * 0.035, px.y * 1.4));
    vec3 color = uPaper * (0.962 + 0.038 * grain) * (0.988 + 0.012 * fibre);

    vec3 n = normalize(vNormal);
    if (gl_FrontFacing) {
      vec4 ink = texture2D(uPrint, vUv);
      color = mix(color, ink.rgb, ink.a * (0.86 + 0.14 * grain));

      vec2 q = px - uStampCenter;
      float c = cos(uStampAngle);
      float s = sin(uStampAngle);
      q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
      vec2 st = q / (uStampSize * uStampScale) + 0.5;
      if (uStampAlpha > 0.0 && st.x > 0.0 && st.x < 1.0 && st.y > 0.0 && st.y < 1.0) {
        vec4 rubber = texture2D(uStamp, vec2(st.x, 1.0 - st.y));
        float patchy = smoothstep(0.18, 0.55, noise(px * 0.3) * 0.7 + noise(px * 0.06) * 0.5);
        float a = rubber.a * uStampAlpha * patchy;
        // Overprint: the stamp multiplies the paper and the ink under it, like real ink does.
        color *= mix(vec3(1.0), rubber.rgb, a);
      }
    } else {
      n = -n;
    }

    float key = max(dot(n, uKeyDir), 0.0);
    float fill = max(dot(n, uFillDir), 0.0);
    vec3 light = vec3(0.5, 0.49, 0.47) + vec3(0.56, 0.52, 0.46) * key + vec3(0.12, 0.13, 0.14) * fill;
    // Paper just out of the slot sits in the printer's shadow.
    light *= mix(0.62, 1.0, smoothstep(0.0, 0.09, vD));
    gl_FragColor = vec4(color * light, 1.0);
    #include <colorspace_fragment>
  }
`;

function srgbTexture(source: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const texture = new CanvasTexture(source);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/** A soft elliptical contact shadow under the printer body, drawn once into a small texture. */
function contactShadowCanvas(ink: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for the contact shadow");
  const shade = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  shade.addColorStop(0, ink);
  shade.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 256, 256);
  return canvas;
}

export function createTillScene(input: TillSceneInput): TillScene {
  const { canvas, layout } = input;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "default" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
  renderer.setClearColor(0x000000, 0);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 50);
  const ink = new Color(input.colors.ink);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];
  const track = <G extends BufferGeometry, M extends Material>(geometry: G, material: M): Mesh<G, M> => {
    geometries.push(geometry);
    materials.push(material);
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);
    return mesh;
  };

  // Light: one warm key from the upper left, a soft cool fill, and sky/ground bounce.
  const key = new DirectionalLight(0xfff1df, 2.1);
  key.position.set(-2.2, 3.4, 2.6);
  scene.add(key, new HemisphereLight(0xfffaf2, 0xd8cfc2, 1.15));
  const keyDir = key.position.clone().normalize();
  const fillDir = new Vector3(1.6, 0.6, 1.4).normalize();

  // Printer body: an ink box with rounded edges; its top face is y = 0, where the paper leaves the slot.
  const body = track(
    new RoundedBoxGeometry(BODY.width, BODY.height, BODY.depth, 4, BODY.radius),
    new MeshStandardMaterial({ color: ink, roughness: 0.62, metalness: 0.05 }),
  );
  body.position.set(0, -BODY.height / 2, 0);
  const slot = track(new PlaneGeometry(PAPER_W * 1.08, 0.05), new MeshBasicMaterial({ color: ink.clone().multiplyScalar(0.25) }));
  slot.rotation.x = -Math.PI / 2;
  slot.position.set(0, 0.0015, SLOT_Z);

  const labelTexture = srgbTexture(input.label, anisotropy);
  textures.push(labelTexture);
  const labelAspect = input.label.width / input.label.height;
  const labelHeight = BODY.height * 0.42;
  const label = track(new PlaneGeometry(labelHeight * labelAspect, labelHeight), new MeshBasicMaterial({ map: labelTexture, transparent: true }));
  label.position.set(0, -BODY.height * 0.52, BODY.depth / 2 + 0.002);

  const shadowTexture = srgbTexture(contactShadowCanvas(input.colors.ink), 1);
  textures.push(shadowTexture);
  const shadow = track(new PlaneGeometry(BODY.width * 1.9, BODY.depth * 2.2), new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -BODY.height - 0.001, 0.05);

  // Receipt ribbon: a subdivided plane bent in the vertex shader.
  const length = (PAPER_W * layout.height) / layout.width;
  const printTexture = srgbTexture(input.print, anisotropy);
  textures.push(printTexture);
  const stampTexture = input.stamp ? srgbTexture(input.stamp, anisotropy) : printTexture;
  if (input.stamp) textures.push(stampTexture);
  const paperUniforms = {
    uExposed: { value: 0 },
    uLength: { value: length },
    uHalfWidth: { value: PAPER_W / 2 },
    uDroop: { value: 0.32 },
    uCurl: { value: 0.55 },
    uSway: { value: new Vector2() },
    uPrint: { value: printTexture },
    uStamp: { value: stampTexture },
    uPaper: { value: new Color(input.colors.paper) },
    uPaperPx: { value: new Vector2(layout.width, layout.height) },
    uStampCenter: { value: new Vector2(layout.stampCenter?.x ?? 0, layout.stampCenter?.y ?? 0) },
    uStampSize: { value: new Vector2(STAMP_SIZE.width, STAMP_SIZE.height) },
    uStampAngle: { value: 0 },
    uStampScale: { value: 1 },
    uStampAlpha: { value: 0 },
    uKeyDir: { value: keyDir },
    uFillDir: { value: fillDir },
  };
  const paper = track(
    new PlaneGeometry(PAPER_W, length, PAPER_SEGMENTS.x, PAPER_SEGMENTS.y),
    new ShaderMaterial({ uniforms: paperUniforms, vertexShader, fragmentShader, side: DoubleSide }),
  );
  paper.position.set(0, 0, SLOT_Z);
  // The ribbon moves in the vertex shader, so its static bounds are meaningless for culling.
  paper.frustumCulled = false;

  // Frame the finished receipt and the printer once; scrolling never moves the camera, only the pointer does.
  const target = new Vector3(0, (length - BODY.height) / 2, 0);
  let distance = 5;
  const frame = (aspect: number) => {
    const half = Math.tan(((FOV / 2) * Math.PI) / 180);
    const fitHeight = ((length + BODY.height) / 2) * 1.1;
    const fitWidth = (BODY.width / 2) * 1.12;
    distance = Math.max(fitHeight / half, fitWidth / (half * aspect)) + BODY.depth / 2;
  };

  const state = {
    feed: 0,
    feedTarget: 0,
    pointer: new Vector2(),
    pointerTarget: new Vector2(),
    stamp: { x: 0, v: 0 } as SpringState,
    stampTarget: 0,
    active: true,
    raf: 0,
    last: 0,
    disposed: false,
  };

  const apply = () => {
    paperUniforms.uExposed.value = state.feed * length;
    paperUniforms.uSway.value.set(state.pointer.x, state.pointer.y);
    const s = state.stamp.x;
    paperUniforms.uStampAlpha.value = input.stamp ? Math.min(1, Math.max(0, s * 3)) : 0;
    paperUniforms.uStampScale.value = 1.6 - 0.6 * s;
    paperUniforms.uStampAngle.value = ((-18 + 10 * s) * Math.PI) / 180;

    const yaw = (state.pointer.x * PARALLAX_DEG * Math.PI) / 180;
    const pitch = ((PITCH_DEG - state.pointer.y * PARALLAX_DEG) * Math.PI) / 180;
    camera.position.set(
      target.x + distance * Math.sin(yaw) * Math.cos(pitch),
      target.y + distance * Math.sin(pitch),
      target.z + distance * Math.cos(yaw) * Math.cos(pitch),
    );
    camera.lookAt(target);
  };

  const tick = (now: number) => {
    state.raf = 0;
    if (state.disposed) return;
    // After an idle gap, step as one frame instead of jumping by the whole gap.
    const dt = state.last && now - state.last < 100 ? (now - state.last) / 1000 : 1 / 60;
    state.last = now;

    state.feed = approach(state.feed, state.feedTarget, dt, FEED_RATE);
    state.pointer.set(
      approach(state.pointer.x, state.pointerTarget.x, dt, POINTER_RATE),
      approach(state.pointer.y, state.pointerTarget.y, dt, POINTER_RATE),
    );
    state.stamp = state.stampTarget === 1 ? stepSpring(state.stamp, 1, dt, STAMP_SPRING) : { x: approach(state.stamp.x, 0, dt, 30), v: 0 };
    apply();
    renderer.render(scene, camera);

    const moving =
      state.feed !== state.feedTarget ||
      !state.pointer.equals(state.pointerTarget) ||
      !isSpringAtRest(state.stamp, state.stampTarget);
    if (moving) invalidate();
    else state.last = 0;
  };

  function invalidate() {
    if (!state.raf && state.active && !state.disposed) state.raf = requestAnimationFrame(tick);
  }

  const handleLost = (event: Event) => {
    event.preventDefault();
    input.onContextLost();
  };
  canvas.addEventListener("webglcontextlost", handleLost);

  return {
    setFeed(feed, immediate = false) {
      state.feedTarget = Math.min(1, Math.max(0, feed));
      if (immediate) state.feed = state.feedTarget;
      invalidate();
    },
    setStamp(down) {
      const next = down && input.stamp ? 1 : 0;
      if (next === state.stampTarget) return;
      state.stampTarget = next;
      invalidate();
    },
    setPointer(x, y) {
      state.pointerTarget.set(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
      invalidate();
    },
    setActive(active) {
      state.active = active;
      if (active) invalidate();
      else if (state.raf) {
        cancelAnimationFrame(state.raf);
        state.raf = 0;
        state.last = 0;
      }
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      frame(camera.aspect);
      // A resize clears the drawing buffer, so draw now even when nothing else is moving.
      apply();
      renderer.render(scene, camera);
    },
    dispose() {
      state.disposed = true;
      if (state.raf) cancelAnimationFrame(state.raf);
      canvas.removeEventListener("webglcontextlost", handleLost);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      renderer.dispose();
    },
  };
}

