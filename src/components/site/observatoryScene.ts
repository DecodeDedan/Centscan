import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { rampSegment } from "./costRamp";
import {
  cappedDpr,
  isOnScreen,
  ndcToScreen,
  nearestNode,
  nextQualityStep,
  orbitPoint,
  QUALITY_SAMPLE_FRAMES,
  WINDOW_RINGS,
  type ScreenPoint,
} from "./sceneMath";
import { FINISH_FRAGMENT, FINISH_VERTEX, MARK_FRAGMENT, MARK_VERTEX, PARTICLE_FRAGMENT, PARTICLE_VERTEX } from "./sceneShaders";

/**
 * The Cost Observatory hero scene: the ¢ mark in a thin-film metal, a particle volume streaming into it,
 * three window rings, and the newest report's functions as emissive nodes. Loaded with import() after first paint,
 * so three.js and GSAP live in their own chunk.
 */

export interface SceneNode {
  radius: number;
  size: number;
  phase: number;
  ramp: number;
}

export interface SceneReadouts {
  fps: HTMLElement | null;
  dpr: HTMLElement | null;
  particles: HTMLElement | null;
  pointer: HTMLElement | null;
}

export interface SceneOptions {
  host: HTMLElement;
  root: HTMLElement;
  nodes: readonly SceneNode[];
  /** The newest report's window; its ring is drawn live. Null when there is no report. */
  windowHours: number | null;
  labels: ReadonlyArray<HTMLElement | null>;
  ringLabel: HTMLElement | null;
  reticle: HTMLElement | null;
  rulerX: HTMLElement | null;
  rulerY: HTMLElement | null;
  readouts: SceneReadouts;
  /** Skips the boot sequence and the scroll dolly; the scene starts as one finished still frame. */
  reducedMotion: boolean;
  paused: boolean;
  onHover: (index: number | null) => void;
  onActivate: (index: number) => void;
  onContextLost: () => void;
}

export interface SceneHandle {
  setPaused: (paused: boolean) => void;
  setHighlight: (index: number | null) => void;
  dispose: () => void;
}

const NARROW = 720;
const PARTICLES_WIDE = 10_000;
const PARTICLES_NARROW = 5_000;
const RESIDENT_SHARE = 0.3;
/** Arc of the ¢: the opening faces right, 40° either side of the x axis, as in the brand mark. */
const ARC_START = (40 * Math.PI) / 180;
const ARC_SPAN = (280 * Math.PI) / 180;
const TUBE = 0.175;
const BAR = { x: 0.1, half: 1.35, radius: 0.13, node: 0.44 } as const;
const BOOT_END = 1.45;
const RING_TICKS = 72;
const HIT_REACH_PX = 28;
const READOUT_MS = 250;
const MAX_DT = 0.05;
const REDUCED_STILL_TIME = 14;

interface Palette {
  page: THREE.Color;
  text: THREE.Color;
  signal: THREE.Color;
  ramp: Record<"--accent" | "--warning" | "--danger", THREE.Color>;
  dark: boolean;
}

function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const color = (name: string, fallback: string) => new THREE.Color(css.getPropertyValue(name).trim() || fallback);
  const page = color("--page", "#0c110e");
  const hsl = { h: 0, s: 0, l: 0 };
  page.getHSL(hsl);
  return {
    page,
    text: color("--text", "#e7edea"),
    signal: color("--accent", "#3fbf8f"),
    ramp: { "--accent": color("--accent", "#3fbf8f"), "--warning": color("--warning", "#f7a224"), "--danger": color("--danger", "#ff968a") },
    dark: hsl.l < 0.5,
  };
}

function rampColor(palette: Palette, position: number): THREE.Color {
  const { from, to, amount } = rampSegment(position);
  return new THREE.Color().lerpColors(palette.ramp[from], palette.ramp[to], amount);
}

function gaussian(): number {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** A point on the ¢ surface in mark space: mostly on the arc's tube, the rest on the bar. */
function markSurfacePoint(): THREE.Vector3 {
  if (Math.random() < 0.78) {
    const theta = ARC_START + Math.random() * ARC_SPAN;
    const phi = Math.random() * Math.PI * 2;
    const r = 1 + Math.cos(phi) * TUBE;
    return new THREE.Vector3(Math.cos(theta) * r, Math.sin(theta) * r, Math.sin(phi) * TUBE);
  }
  const phi = Math.random() * Math.PI * 2;
  return new THREE.Vector3(BAR.x + Math.cos(phi) * BAR.radius, (Math.random() * 2 - 1) * BAR.half, Math.sin(phi) * BAR.radius);
}

function createMark(signal: THREE.Color, detail: number) {
  const group = new THREE.Group();
  const makeMaterial = (emissive: number, base: THREE.Color) =>
    new THREE.ShaderMaterial({
      vertexShader: MARK_VERTEX,
      fragmentShader: MARK_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uWake: { value: 0 },
        uEmissive: { value: emissive },
        uDark: { value: 1 },
        uSignal: { value: signal.clone() },
        uIce: { value: new THREE.Color(0.74, 0.9, 0.92) },
        uBase: { value: base },
      },
    });
  // Geometry is rotated, not the mesh, so object space is mark space and the contours stay level.
  const arcGeometry = new THREE.TorusGeometry(1, TUBE, Math.round(detail / 2), detail * 3, ARC_SPAN).rotateZ(ARC_START);
  const capGeometry = new THREE.SphereGeometry(TUBE, Math.round(detail / 2), Math.round(detail / 3));
  const arcMaterial = makeMaterial(0, new THREE.Color(0.07, 0.09, 0.085));
  const arc = new THREE.Mesh(arcGeometry, arcMaterial);
  const caps = [ARC_START, ARC_START + ARC_SPAN].map((angle) => {
    const cap = new THREE.Mesh(capGeometry, arcMaterial);
    cap.position.set(Math.cos(angle), Math.sin(angle), 0);
    return cap;
  });
  const barGeometry = new THREE.CapsuleGeometry(BAR.radius, BAR.half * 2 - BAR.radius * 2, 6, Math.round(detail / 2)).translate(BAR.x, 0, 0);
  const barMaterial = makeMaterial(0.55, signal.clone().multiplyScalar(0.5));
  const bar = new THREE.Mesh(barGeometry, barMaterial);
  const nodeGeometry = new THREE.BoxGeometry(BAR.node, BAR.node, BAR.node).translate(BAR.x, 0, 0);
  const node = new THREE.Mesh(nodeGeometry, barMaterial);
  group.add(arc, ...caps, bar, node);
  return { group, materials: [arcMaterial, barMaterial], geometries: [arcGeometry, capGeometry, barGeometry, nodeGeometry] };
}

function createRings(rig: THREE.Group, activeHours: number | null) {
  return WINDOW_RINGS.map((spec) => {
    const group = new THREE.Group();
    group.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]);
    const points = Array.from({ length: 257 }, (_, i) => {
      const a = (i / 256) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * spec.radius, 0, Math.sin(a) * spec.radius);
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const line = new THREE.Line(geometry, material);
    // Graduations on the ring: they turn with the window while the ring itself holds still.
    const tickPoints: THREE.Vector3[] = [];
    for (let i = 0; i < RING_TICKS; i++) {
      const a = (i / RING_TICKS) * Math.PI * 2;
      const inner = spec.radius - (i % 6 === 0 ? 0.12 : 0.05);
      tickPoints.push(new THREE.Vector3(Math.cos(a) * inner, 0, Math.sin(a) * inner), new THREE.Vector3(Math.cos(a) * spec.radius, 0, Math.sin(a) * spec.radius));
    }
    const tickGeometry = new THREE.BufferGeometry().setFromPoints(tickPoints);
    const ticks = new THREE.LineSegments(tickGeometry, material);
    group.add(line, ticks);
    rig.add(group);
    return { group, ticks, geometries: [geometry, tickGeometry], material, spec, isActive: spec.hours === activeHours };
  });
}

/** The newest report's window ring, or the 24 h ring when there is no report. */
function pickActiveRing<T extends { isActive: boolean; spec: { hours: number } }>(rings: readonly T[]): T {
  const ring = rings.find((r) => r.isActive) ?? rings.find((r) => r.spec.hours === 24);
  if (!ring) throw new Error("observatory scene: no window ring");
  return ring;
}

function createParticles(count: number) {
  const residents = Math.round(count * RESIDENT_SHARE);
  const seed = new Float32Array(count * 4);
  const mode = new Float32Array(count);
  const start = new Float32Array(count * 3);
  const home = new Float32Array(count * 3);
  const delay = new Float32Array(count);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const isResident = i < residents;
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    mode[i] = isResident ? 1 : 0;
    const far = new THREE.Vector3(gaussian(), gaussian(), gaussian()).normalize().multiplyScalar(7 + Math.random() * 5);
    start.set([far.x, far.y, far.z], i * 3);
    const surface = markSurfacePoint();
    home.set([surface.x, surface.y, surface.z], i * 3);
    // Residents assemble first, so the ¢ forms out of the cloud before the streams start landing on it.
    delay[i] = isResident ? Math.random() * 0.55 : 0.35 + Math.random() * 0.65;
    size[i] = isResident ? 1.6 + Math.random() * 1.8 : 1.2 + Math.random() * 2.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geometry.setAttribute("aMode", new THREE.BufferAttribute(mode, 1));
  geometry.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
  geometry.setAttribute("aHome", new THREE.BufferAttribute(home, 3));
  geometry.setAttribute("aDelay", new THREE.BufferAttribute(delay, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  // Positions are computed in the vertex shader; CPU bounds would be zero and frustum culling would drop the cloud.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 14);
  const material = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uBoot: { value: 0 },
      uScale: { value: 1 },
      uRush: { value: 0 },
      uDark: { value: 1 },
      uInk: { value: new THREE.Color() },
      uSignal: { value: new THREE.Color() },
    },
  });
  return { points: new THREE.Points(geometry, material), geometry, material };
}

function createNodes(nodes: readonly SceneNode[], palette: Palette, parent: THREE.Group) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const meshes = nodes.map((node) => {
    // HDR colour above the bloom threshold: only data (and the mark's accents) glow.
    const material = new THREE.MeshBasicMaterial({ color: rampColor(palette, node.ramp).multiplyScalar(palette.dark ? 1.6 : 1), toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(node.size);
    parent.add(mesh);
    return { mesh, material, node, grow: { value: 1 } };
  });
  return { geometry, meshes };
}

function createComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(Math.max(size.x, 1), Math.max(size.y, 1), { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const bloom = new UnrealBloomPass(size, 0.7, 0.4, 0.62);
  const finish = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.05 }, uAberration: { value: 0 }, uVignette: { value: 0.3 } },
    vertexShader: FINISH_VERTEX,
    fragmentShader: FINISH_FRAGMENT,
  });
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(finish);
  return { composer, bloom, finish, target };
}

/** A named uniform, typed. Shader passes clone their uniforms, so they are looked up once here and kept. */
function uniform<T>(uniforms: Record<string, THREE.IUniform>, name: string): THREE.IUniform<T> {
  const found = uniforms[name];
  if (!found) throw new Error(`observatory scene: missing uniform ${name}`);
  return found as THREE.IUniform<T>;
}

function write(el: HTMLElement | null, text: string): void {
  if (el && el.textContent !== text) el.textContent = text;
}

export function createObservatoryScene(options: SceneOptions): SceneHandle {
  const { host, root } = options;
  const narrow = host.clientWidth < NARROW;
  const particleCount = narrow ? PARTICLES_NARROW : PARTICLES_WIDE;
  const palette = readPalette(root);

  const renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance", antialias: false });
  renderer.setPixelRatio(cappedDpr(window.devicePixelRatio));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = palette.page.clone();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  const rig = new THREE.Group();
  scene.add(rig);
  const markHolder = new THREE.Group();
  rig.add(markHolder);
  const mark = createMark(palette.signal, narrow ? 24 : 48);
  markHolder.add(mark.group);
  const particles = createParticles(particleCount);
  markHolder.add(particles.points);
  const rings = createRings(rig, options.windowHours);
  const activeRing = pickActiveRing(rings);
  const nodes = createNodes(options.nodes, palette, activeRing.group);
  const { composer, bloom, finish, target } = createComposer(renderer, scene, camera);

  const pu = {
    uTime: uniform<number>(particles.material.uniforms, "uTime"),
    uBoot: uniform<number>(particles.material.uniforms, "uBoot"),
    uScale: uniform<number>(particles.material.uniforms, "uScale"),
    uRush: uniform<number>(particles.material.uniforms, "uRush"),
    uDark: uniform<number>(particles.material.uniforms, "uDark"),
    uInk: uniform<THREE.Color>(particles.material.uniforms, "uInk"),
    uSignal: uniform<THREE.Color>(particles.material.uniforms, "uSignal"),
  };
  const fu = {
    uTime: uniform<number>(finish.uniforms, "uTime"),
    uGrain: uniform<number>(finish.uniforms, "uGrain"),
    uAberration: uniform<number>(finish.uniforms, "uAberration"),
    uVignette: uniform<number>(finish.uniforms, "uVignette"),
  };
  const markTime = mark.materials.map((m) => uniform<number>(m.uniforms, "uTime"));
  const markWake = mark.materials.map((m) => uniform<number>(m.uniforms, "uWake"));
  pu.uDark.value = palette.dark ? 1 : 0;
  pu.uInk.value.copy(palette.dark ? new THREE.Color(0.75, 0.9, 0.86) : palette.text);
  pu.uSignal.value.copy(palette.signal);
  particles.material.blending = palette.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  for (const material of mark.materials) uniform<number>(material.uniforms, "uDark").value = palette.dark ? 1 : 0;
  if (!palette.dark) {
    bloom.threshold = 0.9;
    bloom.strength = 0.35;
    fu.uGrain.value = 0.03;
    fu.uVignette.value = 0.08;
  }
  for (const ring of rings) {
    ring.material.color.copy(ring.isActive ? palette.signal.clone().multiplyScalar(palette.dark ? 1.3 : 1) : palette.text);
    ring.material.opacity = ring.isActive ? 0.55 : 0.14;
  }

  const state = {
    running: false,
    paused: options.paused,
    disposed: false,
    ready: false,
    time: options.reducedMotion ? REDUCED_STILL_TIME : 0,
    boot: options.reducedMotion ? BOOT_END : 0,
    wake: options.reducedMotion ? 1 : 0,
    scroll: 0,
    visible: true,
    last: 0,
    readAt: 0,
    startedAt: performance.now(),
    ema: 16.7,
    samples: 0,
    dpr: renderer.getPixelRatio(),
    halved: false,
    highlight: null as number | null,
    hover: null as number | null,
    pointer: new THREE.Vector2(),
    lean: new THREE.Vector2(),
    screen: { x: -100, y: -100 },
    reticle: { x: -100, y: -100 },
    width: 1,
    height: 1,
  };
  let bootTimeline: gsap.core.Timeline | null = null;
  const projected: Array<ScreenPoint | null> = options.nodes.map(() => null);
  const world = new THREE.Vector3();
  const center = new THREE.Vector3();
  if (state.boot >= BOOT_END) for (const u of markWake) u.value = 1;

  function resize(): void {
    const width = host.clientWidth;
    const height = host.clientHeight;
    // A hidden tab or collapsed container reports 0 x 0, and zero-size render targets are invalid.
    if (width === 0 || height === 0) return;
    state.width = width;
    state.height = height;
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(state.dpr);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const wide = camera.aspect > 1.1;
    rig.position.set(wide ? 0.8 : 0, wide ? 0.15 : 0.1, 0);
    rig.scale.setScalar(wide ? 0.95 : 0.74);
    pu.uScale.value = height * state.dpr * 0.012;
    write(options.readouts.dpr, `${state.dpr.toFixed(2)}×`);
    if (!state.running) render(0);
  }

  function placeLabels(): void {
    rig.getWorldPosition(center);
    const centerDistance = camera.position.distanceTo(center);
    nodes.meshes.forEach(({ mesh }, i) => {
      mesh.getWorldPosition(world);
      const isBehind = camera.position.distanceTo(world) > centerDistance + 0.4;
      world.project(camera);
      const point = ndcToScreen(world.x, world.y, state.width, state.height);
      const isVisible = isOnScreen(point, state.width, state.height, -8);
      projected[i] = isVisible ? point : null;
      const label = options.labels[i];
      if (!label) return;
      label.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
      label.style.opacity = !isVisible ? "0" : isBehind && state.highlight !== i ? "0.35" : "1";
    });
    if (options.ringLabel) {
      const p = orbitPoint(activeRing.spec.radius, 2.4, state.time, activeRing.spec.speed * 0.4);
      world.set(p.x, p.y, p.z).applyMatrix4(activeRing.group.matrixWorld).project(camera);
      const point = ndcToScreen(world.x, world.y, state.width, state.height);
      options.ringLabel.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
      options.ringLabel.style.opacity = isOnScreen(point, state.width, state.height, -8) ? "1" : "0";
    }
  }

  function render(dt: number): void {
    if (!state.ready) return;
    state.time += dt;
    const t = state.time;
    const ease = 1 - Math.pow(0.001, dt || 1);
    state.lean.lerp(state.pointer, Math.min(ease, 1));
    rig.rotation.set(-state.lean.y * 0.16 + state.scroll * 0.35, state.lean.x * 0.28, 0);
    // Parts move at different rates and the mark only sways, so the ¢ stays legible.
    markHolder.rotation.y = Math.sin(t * 0.22) * 0.42;
    for (const ring of rings) ring.ticks.rotation.y = t * ring.spec.speed * 0.35;
    nodes.meshes.forEach(({ mesh, node, grow }, i) => {
      const p = orbitPoint(node.radius, node.phase, t, activeRing.spec.speed);
      mesh.position.set(p.x, p.y, p.z);
      const focus = state.highlight === i ? 1.7 : 1;
      mesh.scale.setScalar(node.size * grow.value * focus);
    });
    camera.position.set(0, -state.scroll * 0.6, 10 - state.scroll * 3.5);
    camera.lookAt(0, state.scroll * 0.2, 0);
    for (const u of markTime) u.value = t;
    pu.uTime.value = t;
    pu.uBoot.value = state.boot;
    pu.uRush.value = state.scroll;
    fu.uTime.value = t;
    scene.updateMatrixWorld();
    placeLabels();
    composer.render(dt);
  }

  function adapt(frameMs: number): void {
    state.ema += (frameMs - state.ema) * 0.05;
    state.samples += 1;
    if (state.samples < QUALITY_SAMPLE_FRAMES) return;
    state.samples = 0;
    const step = nextQualityStep(state.ema, state.dpr, state.halved);
    if (step === "drop-dpr") {
      state.dpr = 1;
      resize();
    } else if (step === "halve-particles") {
      state.halved = true;
      particles.geometry.setDrawRange(0, Math.round(particleCount / 2));
      write(options.readouts.particles, Math.round(particleCount / 2).toLocaleString("en-US"));
    }
  }

  function updateReadouts(now: number): void {
    if (now - state.readAt < READOUT_MS) return;
    state.readAt = now;
    write(options.readouts.fps, state.running ? `${Math.round(1000 / state.ema)} fps` : "paused");
    const x = state.pointer.x;
    const y = state.pointer.y;
    write(options.readouts.pointer, `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(2)} ${y >= 0 ? "+" : "−"}${Math.abs(y).toFixed(2)}`);
  }

  function frame(now: number): void {
    const dt = state.last ? Math.min((now - state.last) / 1000, MAX_DT) : 1 / 60;
    if (state.last) adapt(now - state.last);
    state.last = now;
    render(dt);
    state.reticle.x += (state.screen.x - state.reticle.x) * 0.25;
    state.reticle.y += (state.screen.y - state.reticle.y) * 0.25;
    if (options.reticle) options.reticle.style.transform = `translate3d(${state.reticle.x.toFixed(1)}px, ${state.reticle.y.toFixed(1)}px, 0)`;
    updateReadouts(now);
  }

  function play(): void {
    if (!state.ready || state.running || state.paused || state.disposed || document.hidden || !state.visible) return;
    state.running = true;
    state.last = 0;
    renderer.setAnimationLoop(frame);
  }

  function stop(): void {
    state.running = false;
    renderer.setAnimationLoop(null);
    state.readAt = 0;
    updateReadouts(performance.now());
  }

  /** Paused or reduced: one finished still frame, boot complete, nothing moving. */
  function settle(): void {
    bootTimeline?.progress(1);
    state.boot = BOOT_END;
    state.wake = 1;
    for (const u of markWake) u.value = 1;
    for (const n of nodes.meshes) n.grow.value = 1;
    fu.uAberration.value = 0;
    render(0);
  }

  function setPaused(paused: boolean): void {
    state.paused = paused;
    if (state.paused) {
      stop();
      settle();
    } else play();
  }

  function handlePointerMove(event: PointerEvent): void {
    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    state.pointer.set((x / rect.width) * 2 - 1, -((y / rect.height) * 2 - 1));
    state.screen = { x, y };
    if (options.rulerX) options.rulerX.style.transform = `translateX(${x.toFixed(0)}px)`;
    if (options.rulerY) options.rulerY.style.transform = `translateY(${y.toFixed(0)}px)`;
    const hit = nearestNode({ x, y }, projected, HIT_REACH_PX);
    if (hit !== state.hover) {
      state.hover = hit;
      host.style.cursor = hit === null ? "" : "pointer";
      options.onHover(hit);
    }
    if (!state.running) {
      state.readAt = 0;
      updateReadouts(performance.now());
    }
  }

  function handlePointerLeave(): void {
    if (state.hover !== null) {
      state.hover = null;
      host.style.cursor = "";
      options.onHover(null);
    }
  }

  function handleClick(): void {
    if (state.hover !== null) options.onActivate(state.hover);
  }

  function handleVisibility(): void {
    if (document.hidden) stop();
    else play();
  }

  function handleContextLost(event: Event): void {
    event.preventDefault();
    stop();
    options.onContextLost();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    state.visible = entry?.isIntersecting ?? true;
    if (state.visible) play();
    else stop();
  });
  intersection.observe(root);
  host.addEventListener("pointermove", handlePointerMove, { passive: true });
  host.addEventListener("pointerleave", handlePointerLeave);
  host.addEventListener("click", handleClick);
  document.addEventListener("visibilitychange", handleVisibility);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);

  write(options.readouts.particles, particleCount.toLocaleString("en-US"));
  let mm: gsap.MatchMedia | null = null;

  /** Runs once the shaders are compiled, so the first frame never blocks the main thread on a synchronous compile. */
  function start(): void {
    if (state.disposed) return;
    state.ready = true;
    resize();
    gsap.registerPlugin(ScrollTrigger);
    mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Camera dolly as the hero scrolls away: progress lives in state and the render loop reads it.
      ScrollTrigger.create({
        trigger: root,
        start: "top top",
        end: "bottom top",
        scrub: 0.6,
        onUpdate: (self) => {
          state.scroll = self.progress;
          if (!state.running) render(0);
        },
      });
      if (state.paused) return;
      for (const n of nodes.meshes) n.grow.value = 0;
      // From-states are written here at runtime: without JavaScript every HUD element is already visible.
      bootTimeline = gsap
        .timeline()
        .to(state, { boot: BOOT_END, duration: 2.6, ease: "power2.inOut" }, 0)
        .fromTo(fu.uAberration, { value: 0.014 }, { value: 0, duration: 1.8, ease: "power2.out" }, 0)
        .to(markWake, { value: 1, duration: 1.4, ease: "power2.out" }, 0.7)
        .to(nodes.meshes.map((n) => n.grow), { value: 1, duration: 0.6, ease: "back.out(2)", stagger: 0.08 }, 1.5);
      const hud = root.querySelectorAll("[data-boot]");
      if (hud.length > 0) bootTimeline.from(hud, { y: 8, opacity: 0, duration: 0.5, ease: "power3.out", stagger: 0.05 }, 0.15);
    });

    if (state.paused) settle();
    else play();
    updateReadouts(performance.now());
  }

  // Parallel shader compilation (KHR_parallel_shader_compile where available) keeps the long task off the main thread.
  renderer
    .compileAsync(scene, camera)
    .catch(() => undefined)
    .then(start);

  function dispose(): void {
    if (state.disposed) return;
    state.disposed = true;
    stop();
    mm?.revert();
    resizeObserver.disconnect();
    intersection.disconnect();
    host.removeEventListener("pointermove", handlePointerMove);
    host.removeEventListener("pointerleave", handlePointerLeave);
    host.removeEventListener("click", handleClick);
    document.removeEventListener("visibilitychange", handleVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    for (const g of mark.geometries) g.dispose();
    for (const m of mark.materials) m.dispose();
    particles.geometry.dispose();
    particles.material.dispose();
    for (const ring of rings) {
      for (const g of ring.geometries) g.dispose();
      ring.material.dispose();
    }
    nodes.geometry.dispose();
    for (const n of nodes.meshes) n.material.dispose();
    bloom.dispose();
    finish.dispose();
    composer.dispose();
    target.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    setPaused,
    setHighlight(index) {
      state.highlight = index;
      if (!state.running) render(0);
    },
    dispose,
  };
}
