import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createMechanisms } from './hero-mechanisms';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const LOOP = 60;
export type HeroRenderer = {
  setActive: (active: boolean) => void;
  setPaused: (paused: boolean) => void;
  dispose: () => void;
  debug?: { snapshot: () => string; stats: () => Record<string, unknown>; seek: (t: number) => void };
};
// Wide waypoints between exhibits let the viewer reorient before each close-up.
const shots = [
  { t: 0, p: [12, 12, 18], target: [0, 1, 0] },
  { t: 5, p: [6.8, 5.2, 9.4], target: [0, 2.1, 0] },
  { t: 9, p: [8.4, 4.8, 8], target: [0, 2.1, 0] },
  { t: 13, p: [-8, 10, 16], target: [-2, 1, 0] },
  { t: 18, p: [-8.7, 4.5, 7.1], target: [-5.9, 1.65, .25] },
  { t: 22, p: [-6.6, 4.2, 7], target: [-5.9, 1.65, .25] },
  { t: 26, p: [11, 12, 17], target: [0, 1, 0] },
  { t: 31, p: [7.6, 6.6, 1.8], target: [2.55, 2.1, -5] },
  { t: 35, p: [8.6, 6.3, -.5], target: [2.55, 2.1, -5] },
  { t: 39, p: [14, 11, 17], target: [1, 1, 0] },
  { t: 44, p: [9.1, 4.2, 9.8], target: [4.65, 1.3, 4.1] },
  { t: 48, p: [7.5, 3.7, 10.8], target: [4.65, 1.3, 4.1] },
  { t: 55, p: [12, 12, 18], target: [0, 1, 0] },
  { t: 60, p: [12, 12, 18], target: [0, 1, 0] },
];
export function poseAt(time: number) {
  const t = ((time % LOOP) + LOOP) % LOOP;
  let i = 0;
  while (i < shots.length - 2 && t > shots[i + 1].t) i++;
  const a = shots[i], b = shots[i + 1];
  const u = (t - a.t) / (b.t - a.t);
  const f = u * u * u * (u * (u * 6 - 15) + 10);
  const mix = (x: number, y: number) => x + (y - x) * f;
  const phase = t / LOOP * Math.PI * 2;
  return { x: mix(a.p[0], b.p[0]), y: mix(a.p[1], b.p[1]), z: mix(a.p[2], b.p[2]),
    tx: mix(a.target[0], b.target[0]), ty: mix(a.target[1], b.target[1]), tz: mix(a.target[2], b.target[2]),
    core: phase * 2 };
}
export async function createHeroRenderer(host: HTMLElement, url: string, signal: AbortSignal): Promise<HeroRenderer> {
  let disposed = false, active = false, paused = false, raf = 0, time = 0, lastTick = 0, lastPaint = 0, drawn = 0;
  let slowFrames = 0, samplingFrames = 0, renderCost = 0, latestFrameCost = 0;
  let narrow = matchMedia('(max-width: 900px)').matches;
  let degraded = false;
  let pixelRatio = Math.min(devicePixelRatio || 1, narrow ? 1 : 1.5);
  let fps = narrow ? 30 : 60;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x0b1326, 0);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.shadowMap.enabled = false;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
  const target = new THREE.Vector3();
  const hero = host.closest('.observatory-hero')!;
  const stories = Array.from(hero.querySelectorAll<HTMLElement>('[data-story]'));
  const markers = Array.from(hero.querySelectorAll<HTMLElement>('[data-chapter]'));
  let lastChapter = -1;
  const chapterAt = (t: number) => t < 12 ? 0 : t < 25 ? 1 : t < 38 ? 2 : t < 52 ? 3 : 0;
  let environment: THREE.WebGLRenderTarget | undefined;
  let model: THREE.Group | undefined;
  let core: THREE.Object3D | undefined;
  let baseCore = 0;
  scene.add(new THREE.HemisphereLight(0xc3d1ff, 0x111827, 1.5));
  const key = new THREE.DirectionalLight(0xdce5ff, 2.6); key.position.set(4, 12, 7); scene.add(key);
  const rim = new THREE.DirectionalLight(0x8882ff, 1.7); rim.position.set(-5, 6, -8); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x86dcff, 1.1); fill.position.set(-9, 4, 4); scene.add(fill);
  const pulseGeometry = new THREE.SphereGeometry(.065, 8, 5);
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .85 });
  const pulses = new THREE.InstancedMesh(pulseGeometry, pulseMaterial, 12); pulses.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const ends = [{ x: -5.9, z: .25, c: 0x89ceff }, { x: 2.55, z: -5, c: 0xc0c1ff }, { x: 4.65, z: 4.1, c: 0xffb783 }].map(e => ({ ...e, len: Math.hypot(e.x, e.z) }));
  for (let i = 0; i < 12; i++) pulses.setColorAt(i, new THREE.Color(ends[Math.floor(i / 4)].c));
  scene.add(pulses);
  const mechanisms = createMechanisms(); scene.add(mechanisms.root);
  const labels = Array.from(hero.querySelectorAll<HTMLElement>('[data-layer-label]'));
  const projected = new THREE.Vector3();
  const applyPose = () => {
    const p = poseAt(time); camera.position.set(p.x, p.y, p.z); target.set(p.tx, p.ty, p.tz); camera.lookAt(target); camera.updateMatrixWorld();
    mechanisms.update(time);
    labels.forEach((label, i) => {
      const reveal = mechanisms.state().architectureReveal;
      projected.copy(mechanisms.labelPoints[i]).project(camera);
      const x = (projected.x * .5 + .5) * host.clientWidth;
      const y = (-projected.y * .5 + .5) * host.clientHeight;
      label.style.opacity = String(Math.max(0, (reveal - .3) / .7));
      label.style.visibility = reveal > .3 && x > 0 && x < host.clientWidth - 96 && y > 20 && y < host.clientHeight - 60 ? 'visible' : 'hidden';
      label.style.transform = `translate3d(${x}px,${y}px,0)`;
    });
    const chapter = chapterAt(time);
    // Dissolve at chapter boundaries using the same clock as the camera.
    const previous = chapterAt((time + LOOP - .85) % LOOP);
    const boundaries = [0, 12, 25, 38, 52];
    const since = time - boundaries.filter(t => t <= time).at(-1)!;
    const blend = Math.min(1, since / .85);
    stories.forEach((story, i) => {
      const opacity = previous === chapter ? Number(i === chapter) : i === chapter ? blend : i === previous ? 1 - blend : 0;
      const value = opacity.toFixed(3), visibility = opacity > 0 ? 'visible' : 'hidden';
      if(story.style.opacity !== value) story.style.opacity = value;
      if(story.style.visibility !== visibility) story.style.visibility = visibility;
    });
    if (chapter !== lastChapter) { markers.forEach((m, i) => m.dataset.active = String(i === chapter)); lastChapter = chapter; }
    if (core) core.rotation.y = baseCore + p.core;
    for (let i = 0; i < 12; i++) {
      const end = ends[Math.floor(i / 4)]; const f = (time * .4 + (i % 4) / 4) % 1;
      const distance = (2.58 + f * (end.len - 4.56)) / end.len;
      matrix.makeTranslation(end.x * distance, .10, end.z * distance); pulses.setMatrixAt(i, matrix);
    }
    pulses.instanceMatrix.needsUpdate = true;
  };
  const paint = () => {
    if (disposed || !model) return;
    applyPose(); const before = performance.now(); renderer.render(scene, camera); latestFrameCost = performance.now() - before; renderCost += latestFrameCost; drawn++;
  };
  const size = () => {
    if (disposed) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    const nowNarrow = w <= 900;
    if(nowNarrow !== narrow) { narrow = nowNarrow; fps = narrow || degraded ? 30 : 60; pixelRatio = Math.min(devicePixelRatio || 1, narrow ? 1 : 1.5, degraded ? pixelRatio : Infinity); renderer.setPixelRatio(pixelRatio); }
    camera.aspect = w / h;
    camera.fov = w <= 900 ? 53 : 43;
    camera.clearViewOffset();
    if (w > 900) camera.setViewOffset(w, h, -w * .17, 0, w, h);
    camera.updateProjectionMatrix(); renderer.setSize(w, h, false);
    if (active && model) paint();
  };
  const resizeObserver = new ResizeObserver(size); resizeObserver.observe(host); size();
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; lastTick = 0; lastPaint = 0; };
  function frame(now: number) {
    raf = 0;
    if (disposed || !active || paused) return;
    if (!lastTick) lastTick = now;
    const elapsed = Math.min((now - lastTick) / 1000, .1); lastTick = now; time = (time + elapsed) % LOOP;
    if (now - lastPaint >= 1000 / fps - .6) {
      const frameGap = lastPaint ? now - lastPaint : 0;
      lastPaint = now; paint(); samplingFrames++;
      if (frameGap > 1000 / fps * 1.7 || latestFrameCost > 12) slowFrames++;
      if (samplingFrames >= 120) {
        if (slowFrames > 28) { degraded = true; pixelRatio = Math.max(.8, pixelRatio - .25); fps = 30; renderer.setPixelRatio(pixelRatio); size(); }
        samplingFrames = 0; slowFrames = 0;
      }
    }
    raf = requestAnimationFrame(frame);
  }
  const start = () => { if (active && !paused && !disposed && model && !raf) { lastTick = 0; lastPaint = 0; raf = requestAnimationFrame(frame); } };
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const dispose = () => {
    if (disposed) return; disposed = true; stop(); resizeObserver.disconnect();
    scene.traverse(obj => { if (obj instanceof THREE.Mesh) { geometries.add(obj.geometry); for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(mat); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); environment?.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
  const onContextLost = (event: Event) => {
    event.preventDefault(); stop(); host.closest('latentsig-hero-scene')?.setAttribute('data-state', 'fallback');
    const button = hero.querySelector<HTMLButtonElement>('.hero-motion'); if (button) button.hidden = true;
    host.dispatchEvent(new CustomEvent('hero-renderer-failed', { bubbles: true }));
    dispose();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, { once: true });
  const abort = () => dispose(); signal.addEventListener('abort', abort, { once: true });
  try {
    // Build the reflection map once; there is no per-frame environment or effect pass.
    const room = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .7; room.dispose(); pmrem.dispose();
    const response = await fetch(url, { signal }); if (!response.ok) throw new Error(`Model response: ${response.status}`);
    const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
    if (signal.aborted || disposed) {
      gltf.scene.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) m.dispose(); } });
      throw new DOMException('Aborted', 'AbortError');
    }
    model = gltf.scene;
    model.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.castShadow = false; obj.receiveShadow = false; } });
    scene.add(model); core = model.getObjectByName('CoreSpin');
    baseCore = core?.rotation.y ?? 0;
    paint();
  } catch (error) { dispose(); throw error; }
  const api: HeroRenderer = {
    setActive(value) { if (value && !active) lastChapter = -1; active = value; if (!active) stop(); else { if (paused) paint(); else start(); } },
    setPaused(value) { paused = value; if (paused) stop(); else start(); },
    dispose() { signal.removeEventListener('abort', abort); dispose(); },
  };
  if (import.meta.env.DEV) api.debug = {
    snapshot: () => { paint(); return renderer.domElement.toDataURL('image/webp', .88); },
    seek: (t) => { time = ((t % LOOP) + LOOP) % LOOP; paint(); },
    stats: () => ({ active, paused, disposed, time, frames: drawn, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, pixelRatio, targetFps: fps, totalSubmissionMs: Number(renderCost.toFixed(2)), meanSubmissionMs: drawn ? Number((renderCost / drawn).toFixed(2)) : 0, mechanisms: mechanisms.state(), chapter: lastChapter, camera: camera.position.toArray(), target: target.toArray(), width: renderer.domElement.width, height: renderer.domElement.height }),
  };
  return api;
}
