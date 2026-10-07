import * as THREE from 'three';
import { buildMonsterForSpecies, buildEgg, animateMonster, disposeRig, type MonsterRig, type AnimMode, buildMonster } from './monsterModel';
import { SPECIES } from '../data/species';
import type { Appearance } from '../data/species';

// Second contexte WebGL partagé : portraits (images en cache) et vues 3D
// isolées (fiche Xalamon, éclosion, évolution, Codex).

let renderer: THREE.WebGLRenderer | null = null;
const portraitCache = new Map<string, string>();

function getRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function lightScene(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6a5a9a, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 1.6);
  d.position.set(2, 4, 3);
  scene.add(d);
}

const box = new THREE.Box3();
const v3 = new THREE.Vector3();
/** Cadre la caméra sur l'objet (boîte englobante) avec une marge. */
function fitCamera(cam: THREE.PerspectiveCamera, obj: THREE.Object3D, aspect = 1, margin = 1.15): void {
  obj.updateMatrixWorld(true);
  box.setFromObject(obj);
  const size = box.getSize(v3).clone();
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.y * 0.55, Math.max(size.x, size.z) * 0.55 / Math.min(1, aspect), 0.3) * margin;
  const dist = radius / Math.tan((cam.fov * Math.PI) / 360);
  const dir = new THREE.Vector3(0.38, 0.32, 1).normalize();
  cam.position.copy(center).addScaledVector(dir, dist);
  cam.lookAt(center);
}

/** Portrait PNG (data URL) d'une espèce à un stade donné, mis en cache. */
export function portrait(speciesId: string, stage: number, opts: { silhouette?: boolean; skin?: string; size?: number } = {}): string {
  const size = opts.size ?? 160;
  const key = `${speciesId}:${stage}:${opts.silhouette ? 1 : 0}:${opts.skin ?? ''}:${size}`;
  const c = portraitCache.get(key);
  if (c) return c;
  try {
    const r = getRenderer();
    r.setSize(size, size, false);
    const scene = new THREE.Scene();
    lightScene(scene);
    const rig = buildMonsterForSpecies(speciesId, stage, { skin: opts.skin });
    if (opts.silhouette) {
      const black = new THREE.MeshBasicMaterial({ color: 0x241a3a });
      rig.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = black; if ((o as THREE.Points).isPoints) o.visible = false; });
      rig.baseMaterial = black;
    }
    animateMonster(rig, 0.4, 'idle');
    rig.group.rotation.y = -0.45;
    scene.add(rig.group);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    fitCamera(cam, rig.group);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    disposeRig(rig);
    portraitCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

export function eggPortrait(speciesId: string, size = 96): string {
  const key = `egg:${speciesId}:${size}`;
  const c = portraitCache.get(key);
  if (c) return c;
  try {
    const r = getRenderer();
    r.setSize(size, size, false);
    const scene = new THREE.Scene();
    lightScene(scene);
    const egg = buildEgg(speciesId);
    egg.rotation.set(0.15, 0.6, 0.1);
    scene.add(egg);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
    cam.position.set(0.9, 1.1, 2.3);
    cam.lookAt(0, 0.5, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    portraitCache.set(key, url);
    return url;
  } catch {
    return '';
  }
}

/** Vue 3D animée affichée dans un élément DOM (un seul viewer actif). */
export class Showcase {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  rig: MonsterRig | null = null;
  egg: THREE.Group | null = null;
  mode: AnimMode = 'happy';
  private raf = 0;
  private t0 = performance.now();
  private canvas: HTMLCanvasElement;
  private ctx2d: CanvasRenderingContext2D;
  spin = true;
  fitPending = false;
  dragYaw = -0.4;
  onFrame?: (t: number) => void;

  constructor(private host: HTMLElement) {
    lightScene(this.scene);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'showcase-canvas';
    host.appendChild(this.canvas);
    this.ctx2d = this.canvas.getContext('2d')!;
    let dragging = false, lastX = 0;
    this.canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; this.spin = false; });
    window.addEventListener('pointerup', () => { dragging = false; });
    this.canvas.addEventListener('pointermove', (e) => { if (dragging) { this.dragYaw += (e.clientX - lastX) * 0.012; lastX = e.clientX; } });
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  showSpecies(speciesId: string, stage: number, skin?: string): void {
    this.clear();
    this.rig = buildMonsterForSpecies(speciesId, stage, { skin, outline: true });
    this.scene.add(this.rig.group);
    this.fitPending = true;
  }

  showLook(look: Appearance, stage: number, boss = false): void {
    this.clear();
    this.rig = buildMonster(look, stage, { boss, outline: true });
    this.scene.add(this.rig.group);
    this.fitPending = true;
  }

  showEgg(speciesId: string): void {
    this.clear();
    this.egg = buildEgg(speciesId, 1.3);
    this.scene.add(this.egg);
    this.cam.position.set(0, 1.0, 3.2);
    this.cam.lookAt(0, 0.65, 0);
  }

  clear(): void {
    if (this.rig) { this.scene.remove(this.rig.group); disposeRig(this.rig); this.rig = null; }
    if (this.egg) { this.scene.remove(this.egg); this.egg = null; }
  }

  private loop(now: number): void {
    this.raf = requestAnimationFrame(this.loop);
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    if (!this.host.isConnected) { this.dispose(); return; }
    const t = (now - this.t0) / 1000;
    const r = getRenderer();
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(w * pr), Hh = Math.round(h * pr);
    if (this.canvas.width !== W || this.canvas.height !== Hh) { this.canvas.width = W; this.canvas.height = Hh; }
    r.setSize(W, Hh, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
    if (this.rig) {
      animateMonster(this.rig, t, this.mode);
      if (this.fitPending) { this.rig.group.rotation.y = 0; animateMonster(this.rig, 0.4, 'idle'); fitCamera(this.cam, this.rig.group, w / h, 1.25); this.fitPending = false; }
      if (this.spin) this.dragYaw += 0.008;
      this.rig.group.rotation.y = this.dragYaw;
    }
    if (this.egg) this.onFrame?.(t);
    else this.onFrame?.(t);
    r.render(this.scene, this.cam);
    this.ctx2d.clearRect(0, 0, W, Hh);
    this.ctx2d.drawImage(r.domElement, 0, 0, W, Hh, 0, 0, W, Hh);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.canvas.remove();
  }
}

export function speciesExists(id: string): boolean { return !!SPECIES[id]; }
