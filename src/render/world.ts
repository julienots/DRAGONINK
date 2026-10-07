import * as THREE from 'three';
import type { GameState, IslandId, BuildingInstance, MonsterInstance } from '../core/types';
import { ISLANDS, ISLAND_ORDER, GRID, BUILDING, islandTileOk } from '../data/world';
import { SPECIES } from '../data/species';
import { ELEMENTS } from '../data/elements';
import { buildIsland, buildCloud, type IslandModel } from './islandModel';
import { buildBuildingModel, buildCropMesh, type BuildingModel } from './buildingModels';
import { buildMonsterForSpecies, animateMonster, disposeRig, buildEgg, type MonsterRig, type AnimMode, setModelDetail } from './monsterModel';
import { FxSystem, WeatherSystem } from './fx';
import { satietyNow } from '../systems/monsters';
import { canPlace } from '../systems/buildings';
import { weatherAt } from '../systems/time';
import type { QualityProfile } from '../platform/quality';
import { seededRng } from '../core/util';
import { toonMaterial } from './geo';

interface BuildingView {
  uid: string;
  key: string;
  model: BuildingModel;
  crop?: THREE.Mesh;
  cropKey?: string;
  eggs?: THREE.Group;
  eggsKey?: string;
}

interface MonsterView {
  uid: string;
  key: string;
  rig: MonsterRig;
  home: THREE.Vector3;
  radius: number;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  mode: AnimMode;
  timer: number;
  sleepy: boolean;
}

export interface TapResult {
  kind: 'building' | 'monster' | 'tile' | 'none';
  uid?: string;
  island?: IslandId;
  x?: number;
  y?: number;
}

export interface Marker { el: HTMLElement; pos: THREE.Vector3 }

export class WorldRenderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  battleScene: THREE.Scene | null = null;
  battleCamera: THREE.Camera | null = null;
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  private targetGoal = new THREE.Vector3();
  distance = 40;
  private distanceGoal = 40;
  /** facteur de zoom choisi par le joueur (1 = vue d'ensemble de l'île) */
  private zoom = 0.85;
  private yaw = Math.PI / 4;
  private pitch = 0.92;
  islands = new Map<IslandId, IslandModel>();
  private buildingViews = new Map<string, BuildingView>();
  private monsterViews = new Map<string, MonsterView>();
  private clouds: { mesh: THREE.Mesh; speed: number }[] = [];
  private birds: { mesh: THREE.Mesh; r: number; c: THREE.Vector3; speed: number; phase: number }[] = [];
  fx: FxSystem;
  weather: WeatherSystem;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private skyTop = new THREE.Color('#5a7cff');
  private skyBottom = new THREE.Color('#bfe9ff');
  private skyTex: THREE.CanvasTexture;
  private skyCanvas: HTMLCanvasElement;
  private raycaster = new THREE.Raycaster();
  private markers = new Map<string, Marker>();
  markerLayer: HTMLElement;
  focusIsland: IslandId = 'verdante';
  onTap?: (r: TapResult) => void;
  onIslandFocus?: (id: IslandId) => void;
  selectedUid: string | null = null;
  private selectRing: THREE.Mesh;
  // placement
  placing: { defId: string; uid?: string; island: IslandId; x: number; y: number; ghost: THREE.Group; tiles: THREE.Mesh; valid: boolean } | null = null;
  onPlacementChange?: (valid: boolean) => void;
  private state: GameState | null = null;
  private time = 0;
  paused = false;

  constructor(private canvas: HTMLCanvasElement, public quality: QualityProfile, markerLayer: HTMLElement) {
    this.markerLayer = markerLayer;
    setModelDetail(quality.level);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.5, 400);

    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2; this.skyCanvas.height = 256;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    this.scene.fog = new THREE.Fog(0xbfe9ff, 70, 180);

    this.hemi = new THREE.HemisphereLight(0xfff6e8, 0x7a6ab8, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.position.set(18, 30, 12);
    if (quality.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
      const c = this.sun.shadow.camera;
      c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 80;
      this.sun.shadow.bias = -0.0015;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.fx = new FxSystem(this.scene, quality.particles);
    this.weather = new WeatherSystem(this.scene, quality.particles);

    const ringGeo = new THREE.RingGeometry(0.9, 1.05, 32);
    this.selectRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xfff35a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.selectRing.rotation.x = -Math.PI / 2;
    this.selectRing.visible = false;
    this.scene.add(this.selectRing);

    this.buildAmbient();
    this.bindInput();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ————————————————————————— environnement —————————————————————————

  private buildAmbient(): void {
    const rng = seededRng(77);
    for (let i = 0; i < this.quality.clouds; i++) {
      const mesh = new THREE.Mesh(buildCloud(rng, i % 3 === 0 ? '#f4eaff' : '#ffffff'), toonMaterial({ transparent: true, opacity: 0.92 }));
      const a = rng() * Math.PI * 2, d = 10 + rng() * 80;
      mesh.position.set(Math.cos(a) * d, -6 - rng() * 14, Math.sin(a) * d);
      mesh.scale.setScalar(1 + rng() * 2.2);
      this.scene.add(mesh);
      this.clouds.push({ mesh, speed: 0.4 + rng() * 0.8 });
    }
    // mer de nuages
    const sea = new THREE.Mesh(new THREE.CircleGeometry(260, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -24;
    this.scene.add(sea);
    for (let i = 0; i < this.quality.birds; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.35, 0.1, 0, 0, 0, 0.1, 0, 0, 0.1, 0.35, 0.1, 0, 0, 0, -0.1, 0, 0, 0.1]), 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x3a3060, side: THREE.DoubleSide }));
      this.scene.add(m);
      this.birds.push({ mesh: m, r: 8 + rng() * 25, c: new THREE.Vector3((rng() - 0.5) * 60, 6 + rng() * 6, (rng() - 0.5) * 60), speed: 0.2 + rng() * 0.3, phase: rng() * 10 });
    }
  }

  private paintSky(top: THREE.Color, bottom: THREE.Color): void {
    const g = this.skyCanvas.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#' + top.getHexString());
    grd.addColorStop(0.65, '#' + bottom.getHexString());
    grd.addColorStop(1, '#' + bottom.clone().lerp(new THREE.Color('#ffffff'), 0.4).getHexString());
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 256);
    this.skyTex.needsUpdate = true;
    (this.scene.fog as THREE.Fog).color.copy(bottom);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // portrait : champ plus large pour voir toute l'île
    this.camera.fov = this.camera.aspect < 1 ? 48 : 36;
    this.camera.updateProjectionMatrix();
    this.distanceGoal = this.baseDistance() * this.zoom;
  }

  /** Distance pour voir environ 17 unités de large (une île entière). */
  private baseDistance(): number {
    const vf = (this.camera.fov * Math.PI) / 360;
    const hTan = Math.tan(vf) * Math.min(1.6, this.camera.aspect);
    return THREE.MathUtils.clamp(8.5 / hTan, 22, 60);
  }

  setQuality(q: QualityProfile): void {
    this.quality = q;
    setModelDetail(q.level);
    this.renderer.setPixelRatio(q.pixelRatio);
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    this.fx.density = q.particles;
    this.resize();
  }

  // ————————————————————————— coordonnées —————————————————————————

  islandOrigin(id: IslandId): THREE.Vector3 {
    const p = ISLANDS[id].pos;
    return new THREE.Vector3(p[0], 0, p[1]);
  }

  tileToWorld(id: IslandId, x: number, y: number, size = 1): THREE.Vector3 {
    const o = this.islandOrigin(id);
    return new THREE.Vector3(o.x - GRID / 2 + x + size / 2, 0.08, o.z - GRID / 2 + y + size / 2);
  }

  worldToTile(p: THREE.Vector3): { island: IslandId; x: number; y: number } | null {
    for (const id of ISLAND_ORDER) {
      if (!this.islands.has(id)) continue;
      const o = this.islandOrigin(id);
      const lx = p.x - o.x + GRID / 2, ly = p.z - o.z + GRID / 2;
      if (lx >= 0 && ly >= 0 && lx < GRID && ly < GRID && Math.hypot(p.x - o.x, p.z - o.z) < ISLANDS[id].radius / 2 + 1.2) {
        return { island: id, x: Math.floor(lx), y: Math.floor(ly) };
      }
    }
    return null;
  }

  // ————————————————————————— synchronisation état → scène —————————————————————————

  sync(s: GameState): void {
    this.state = s;
    for (const id of ISLAND_ORDER) {
      const unlocked = s.islands[id].unlocked;
      if (!this.islands.has(id)) {
        const m = buildIsland(ISLANDS[id], this.quality.islandDetail);
        m.group.position.copy(this.islandOrigin(id));
        this.scene.add(m.group);
        this.islands.set(id, m);
      }
      const m = this.islands.get(id)!;
      // les îles verrouillées apparaissent en silhouette brumeuse
      m.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        if (!unlocked) {
          if (!mesh.userData.lockedMat) mesh.userData.lockedMat = new THREE.MeshBasicMaterial({ color: 0xc8c0e8, transparent: true, opacity: 0.55 });
          if (!mesh.userData.origMat) mesh.userData.origMat = mesh.material;
          mesh.material = mesh.userData.lockedMat;
        } else if (mesh.userData.origMat) {
          mesh.material = mesh.userData.origMat;
        }
      });
    }

    // bâtiments
    const seen = new Set<string>();
    for (const b of s.buildings) {
      seen.add(b.uid);
      const key = `${b.defId}:${b.level}:${b.busyKind === 'build' ? 'u' : ''}:${b.x}:${b.y}`;
      let v = this.buildingViews.get(b.uid);
      if (v && v.key !== key) { this.removeBuildingView(v); v = undefined; }
      if (!v) {
        const model = buildBuildingModel(b.defId, b.level, b.busyKind === 'build');
        const size = BUILDING[b.defId].size;
        model.group.position.copy(this.tileToWorld(b.islandId, b.x, b.y, size));
        model.group.rotation.y = BUILDING[b.defId].kind === 'habitat' ? Math.PI / 2 : 0;
        model.group.userData.uid = b.uid;
        this.scene.add(model.group);
        v = { uid: b.uid, key, model };
        this.buildingViews.set(b.uid, v);
      }
      this.syncBuildingDetails(v, b, s.lastSeenAt);
    }
    for (const [uid, v] of this.buildingViews) if (!seen.has(uid)) this.removeBuildingView(v);

    // Xalamons
    const mseen = new Set<string>();
    for (const m of s.monsters) {
      if (!m.habitatUid) continue;
      const hab = s.buildings.find((b) => b.uid === m.habitatUid);
      if (!hab || hab.busyKind === 'build') continue;
      mseen.add(m.uid);
      const key = `${m.speciesId}:${m.stage}:${m.skin ?? ''}:${hab.uid}`;
      let v = this.monsterViews.get(m.uid);
      if (v && v.key !== key) { this.removeMonsterView(v); v = undefined; }
      if (!v) v = this.createMonsterView(m, hab, key);
      v.sleepy = satietyNow(m, Date.now()) < 15;
    }
    for (const [uid, v] of this.monsterViews) if (!mseen.has(uid)) this.removeMonsterView(v);
  }

  private syncBuildingDetails(v: BuildingView, b: BuildingInstance, _now: number): void {
    const def = BUILDING[b.defId];
    if (def.kind === 'farm') {
      const now = Date.now();
      const prog = b.crop ? Math.min(1, (now - b.crop.plantedAt) / Math.max(1, b.crop.readyAt - b.crop.plantedAt)) : -1;
      const ck = b.crop ? `${b.crop.cropId}:${prog >= 1 ? 'r' : prog > 0.5 ? 'h' : 's'}` : '';
      if (ck !== v.cropKey) {
        if (v.crop) { v.model.group.remove(v.crop); v.crop.geometry.dispose(); v.crop = undefined; }
        if (b.crop) { v.crop = buildCropMesh(b.crop.cropId, prog >= 1 ? 1 : prog > 0.5 ? 0.75 : 0.3); v.model.group.add(v.crop); }
        v.cropKey = ck;
      }
    }
    if (def.kind === 'nursery') {
      const ek = (b.nursery ?? []).map((n) => n.egg.speciesId).join(',');
      if (ek !== v.eggsKey) {
        if (v.eggs) v.model.group.remove(v.eggs);
        const grp = new THREE.Group();
        (b.nursery ?? []).forEach((n, i) => {
          const e = buildEgg(n.egg.speciesId, 0.45);
          const a = (i / Math.max(1, b.nursery!.length)) * Math.PI * 2;
          e.position.set(Math.cos(a) * 0.45, 0.28, Math.sin(a) * 0.45);
          e.userData.wobble = i;
          grp.add(e);
        });
        v.model.group.add(grp);
        v.eggs = grp;
        v.eggsKey = ek;
      }
    }
  }

  private removeBuildingView(v: BuildingView): void {
    this.scene.remove(v.model.group);
    v.model.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.buildingViews.delete(v.uid);
  }

  private createMonsterView(m: MonsterInstance, hab: BuildingInstance, key: string): MonsterView {
    const rig = buildMonsterForSpecies(m.speciesId, m.stage, { skin: m.skin, outline: this.quality.outline });
    rig.group.userData.monsterUid = m.uid;
    const size = BUILDING[hab.defId].size;
    const home = this.tileToWorld(hab.islandId, hab.x, hab.y, size);
    home.y = 0.3;
    const radius = size * 0.26;
    const rng = seededRng(parseInt(m.uid.slice(1), 36) || 1);
    const pos = home.clone().add(new THREE.Vector3((rng() - 0.5) * radius, 0, (rng() - 0.5) * radius));
    rig.group.position.copy(pos);
    rig.group.scale.setScalar(1.35);
    this.scene.add(rig.group);
    const v: MonsterView = { uid: m.uid, key, rig, home, radius, pos, target: pos.clone(), mode: 'idle', timer: rng() * 3, sleepy: false };
    this.monsterViews.set(m.uid, v);
    return v;
  }

  private removeMonsterView(v: MonsterView): void {
    this.scene.remove(v.rig.group);
    disposeRig(v.rig);
    this.monsterViews.delete(v.uid);
  }

  monsterWorldPos(uid: string): THREE.Vector3 | null {
    const v = this.monsterViews.get(uid);
    return v ? v.rig.group.position.clone().add(new THREE.Vector3(0, v.rig.height, 0)) : null;
  }

  buildingWorldPos(uid: string): THREE.Vector3 | null {
    const v = this.buildingViews.get(uid);
    return v ? v.model.group.position.clone().add(new THREE.Vector3(0, v.model.height + 0.6, 0)) : null;
  }

  playMonster(uid: string, mode: AnimMode, seconds = 2): void {
    const v = this.monsterViews.get(uid);
    if (!v) return;
    v.mode = mode;
    v.timer = seconds;
  }

  // ————————————————————————— caméra & interaction —————————————————————————

  focus(id: IslandId, instant = false): void {
    this.focusIsland = id;
    this.targetGoal.copy(this.islandOrigin(id));
    if (instant) this.target.copy(this.targetGoal);
    const isl = ISLANDS[id];
    this.skyBottom.set(isl.sky);
    this.skyTop.set(id === 'cosmique' || id === 'ombres' ? '#1a1240' : '#4f6bff');
    this.paintSky(this.skyTop, this.skyBottom);
    this.onIslandFocus?.(id);
  }

  zoomBy(f: number): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom * f, 0.3, 1.6);
    this.distanceGoal = this.baseDistance() * this.zoom;
  }

  focusPoint(p: THREE.Vector3, dist?: number): void {
    this.targetGoal.set(p.x, 0, p.z);
    if (dist) { this.zoom = dist / this.baseDistance(); this.distanceGoal = dist; }
  }

  private bindInput(): void {
    const c = this.canvas;
    const pointers = new Map<number, { x: number; y: number }>();
    let downAt = 0, downX = 0, downY = 0, moved = 0, pinchDist = 0;
    let dragPlacement = false;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      downAt = performance.now(); downX = e.clientX; downY = e.clientY; moved = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      dragPlacement = false;
      if (this.placing && pointers.size === 1) {
        const hit = this.pick(e.clientX, e.clientY);
        if (hit && hit.island === this.placing.island) {
          const sz = BUILDING[this.placing.defId].size;
          if (Math.abs(hit.x - this.placing.x - sz / 2) <= sz && Math.abs(hit.y - this.placing.y - sz / 2) <= sz) dragPlacement = true;
        }
      }
    });
    c.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(dx) + Math.abs(dy);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.zoomBy(pinchDist / d);
        pinchDist = d;
        return;
      }
      if (dragPlacement && this.placing) {
        const hit = this.pick(e.clientX, e.clientY);
        if (hit && hit.island === this.placing.island) {
          const sz = BUILDING[this.placing.defId].size;
          this.movePlacement(hit.x - Math.floor(sz / 2), hit.y - Math.floor(sz / 2));
        }
        return;
      }
      // déplacement de la caméra
      const k = this.distance / Math.max(300, c.clientHeight) * 1.6;
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.targetGoal.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k * 1.4);
      this.clampTarget();
    });
    const up = (e: PointerEvent) => {
      const was = pointers.has(e.pointerId);
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (!was) return;
      const isTap = performance.now() - downAt < 450 && Math.hypot(e.clientX - downX, e.clientY - downY) < 12 && moved < 18;
      if (isTap && !dragPlacement) this.handleTap(e.clientX, e.clientY);
      dragPlacement = false;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
  }

  private clampTarget(): void {
    const o = this.islandOrigin(this.focusIsland);
    const d = this.targetGoal.clone().sub(o);
    // pan libre dans l'archipel : on change d'île focalisée si on s'en approche
    let best: IslandId = this.focusIsland, bestD = d.length();
    for (const id of ISLAND_ORDER) {
      const dd = this.targetGoal.distanceTo(this.islandOrigin(id));
      if (dd < bestD - 2) { best = id; bestD = dd; }
    }
    if (best !== this.focusIsland && this.state?.islands[best].unlocked) {
      this.focusIsland = best;
      const isl = ISLANDS[best];
      this.skyBottom.set(isl.sky);
      this.skyTop.set(best === 'cosmique' || best === 'ombres' ? '#1a1240' : '#4f6bff');
      this.paintSky(this.skyTop, this.skyBottom);
      this.onIslandFocus?.(best);
    }
    this.targetGoal.x = THREE.MathUtils.clamp(this.targetGoal.x, -90, 90);
    this.targetGoal.z = THREE.MathUtils.clamp(this.targetGoal.z, -70, 80);
  }

  private ndc(x: number, y: number): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  pick(x: number, y: number): { island: IslandId; x: number; y: number } | null {
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.05);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return null;
    return this.worldToTile(p);
  }

  private handleTap(x: number, y: number): void {
    if (this.placing) {
      const hit = this.pick(x, y);
      if (hit && hit.island === this.placing.island) {
        const sz = BUILDING[this.placing.defId].size;
        this.movePlacement(hit.x - Math.floor(sz / 2), hit.y - Math.floor(sz / 2));
      }
      return;
    }
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    // Xalamons d'abord
    const mons = [...this.monsterViews.values()].map((v) => v.rig.body);
    const mh = this.raycaster.intersectObjects(mons, false)[0];
    if (mh) {
      let o: THREE.Object3D | null = mh.object;
      while (o && !o.userData.monsterUid) o = o.parent;
      if (o) { this.onTap?.({ kind: 'monster', uid: o.userData.monsterUid }); return; }
    }
    const hit = this.pick(x, y);
    if (!hit || !this.state) { this.onTap?.({ kind: 'none' }); return; }
    const b = this.state.buildings.find((bb) => {
      const sz = BUILDING[bb.defId].size;
      return bb.islandId === hit.island && hit.x >= bb.x && hit.x < bb.x + sz && hit.y >= bb.y && hit.y < bb.y + sz;
    });
    if (b) this.onTap?.({ kind: 'building', uid: b.uid, island: b.islandId });
    else this.onTap?.({ kind: 'tile', island: hit.island, x: hit.x, y: hit.y });
  }

  select(uid: string | null): void {
    this.selectedUid = uid;
    this.selectRing.visible = !!uid;
  }

  // ————————————————————————— placement —————————————————————————

  startPlacement(defId: string, island: IslandId, x: number, y: number, uid?: string): void {
    this.cancelPlacement();
    const model = buildBuildingModel(defId, uid ? this.state?.buildings.find((b) => b.uid === uid)?.level ?? 1 : 1, false);
    model.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { const mm = (m.material as THREE.Material).clone(); mm.transparent = true; (mm as THREE.MeshToonMaterial).opacity = 0.75; m.material = mm; }
    });
    const size = BUILDING[defId].size;
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x5cff7a, transparent: true, opacity: 0.45, depthWrite: false }));
    tiles.rotation.x = -Math.PI / 2;
    const ghost = new THREE.Group();
    ghost.add(model.group);
    ghost.add(tiles);
    tiles.position.y = 0.12;
    this.scene.add(ghost);
    if (uid) { const v = this.buildingViews.get(uid); if (v) v.model.group.visible = false; }
    this.placing = { defId, uid, island, x, y, ghost, tiles, valid: false };
    this.movePlacement(x, y);
    this.focusPoint(this.tileToWorld(island, x, y, size));
  }

  movePlacement(x: number, y: number): void {
    const p = this.placing;
    if (!p || !this.state) return;
    const size = BUILDING[p.defId].size;
    x = THREE.MathUtils.clamp(x, 0, GRID - size);
    y = THREE.MathUtils.clamp(y, 0, GRID - size);
    p.x = x; p.y = y;
    p.ghost.position.copy(this.tileToWorld(p.island, x, y, size));
    p.valid = canPlace(this.state, p.island, size, x, y, p.uid);
    (p.tiles.material as THREE.MeshBasicMaterial).color.set(p.valid ? 0x5cff7a : 0xff4d6a);
    this.onPlacementChange?.(p.valid);
  }

  cancelPlacement(): void {
    if (!this.placing) return;
    this.scene.remove(this.placing.ghost);
    if (this.placing.uid) { const v = this.buildingViews.get(this.placing.uid); if (v) v.model.group.visible = true; }
    this.placing = null;
  }

  islandTilesFree(id: IslandId): number {
    let n = 0;
    for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) if (islandTileOk(id, x, y)) n++;
    return n;
  }

  // ————————————————————————— marqueurs DOM —————————————————————————

  setMarker(id: string, pos: THREE.Vector3, el: HTMLElement): void {
    const m = this.markers.get(id);
    if (m && m.el !== el) m.el.remove();
    if (!el.isConnected) this.markerLayer.appendChild(el);
    this.markers.set(id, { el, pos });
  }

  removeMarker(id: string): void {
    const m = this.markers.get(id);
    if (m) { m.el.remove(); this.markers.delete(id); }
  }

  markerIds(): string[] { return [...this.markers.keys()]; }

  project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = p.clone().project(this.camera);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.x > -1.2 && v.x < 1.2 && v.y > -1.2 && v.y < 1.2 };
  }

  // ————————————————————————— boucle —————————————————————————

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.target.lerp(this.targetGoal, Math.min(1, dt * 6));
    this.distance += (this.distanceGoal - this.distance) * Math.min(1, dt * 6);
    const cp = this.pitch;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(cp) * this.distance,
      this.target.y + Math.sin(cp) * this.distance,
      this.target.z + Math.cos(this.yaw) * Math.cos(cp) * this.distance,
    );
    this.camera.lookAt(this.target);
    this.sun.position.set(this.target.x + 14, 28, this.target.z + 10);
    this.sun.target.position.copy(this.target);

    // nuages & oiseaux
    for (const c of this.clouds) {
      c.mesh.position.x += c.speed * dt;
      if (c.mesh.position.x > 110) c.mesh.position.x = -110;
    }
    for (const b of this.birds) {
      const a = t * b.speed + b.phase;
      b.mesh.position.set(b.c.x + Math.cos(a) * b.r, b.c.y + Math.sin(a * 3) * 0.4, b.c.z + Math.sin(a) * b.r);
      b.mesh.rotation.y = -a;
      b.mesh.scale.y = 1 + Math.sin(t * 12 + b.phase) * 0.6;
    }
    for (const isl of this.islands.values()) {
      if (isl.waterfall) {
        const m = isl.waterfall.material as THREE.MeshBasicMaterial;
        if (m.map) m.map.offset.y = (t * 0.8) % 1;
      }
      for (const a of isl.animated) {
        if (a.kind === 'float') { a.mesh.position.y = a.base + Math.sin(t * a.speed) * 0.4; a.mesh.rotation.y += dt * 0.3; }
      }
    }

    // bâtiments animés
    for (const v of this.buildingViews.values()) {
      for (const s of v.model.spinners) s.rotation.z += dt * 2;
      if (v.eggs) v.eggs.children.forEach((e, i) => { e.rotation.z = Math.sin(t * 3 + i) * 0.12; });
    }

    // Xalamons : petite IA de comportement
    for (const v of this.monsterViews.values()) {
      v.timer -= dt;
      if (v.timer <= 0) {
        const r = Math.random();
        if (v.sleepy && r < 0.6) { v.mode = 'sleep'; v.timer = 5 + Math.random() * 6; }
        else if (r < 0.45) {
          v.mode = 'walk';
          const a = Math.random() * Math.PI * 2, d = Math.random() * v.radius;
          v.target.set(v.home.x + Math.cos(a) * d, v.home.y, v.home.z + Math.sin(a) * d);
          v.timer = 4;
        } else if (r < 0.62) { v.mode = 'idle'; v.timer = 2 + Math.random() * 3; }
        else if (r < 0.72) { v.mode = 'happy'; v.timer = 1.6; }
        else if (r < 0.8) { v.mode = 'eat'; v.timer = 2; }
        else if (r < 0.9 && v.rig.floating) { v.mode = 'fly'; v.timer = 4; }
        else { v.mode = 'sleep'; v.timer = 4 + Math.random() * 4; }
      }
      if (v.mode === 'walk' || v.mode === 'fly') {
        const d = v.target.clone().sub(v.pos);
        const dist = d.length();
        if (dist > 0.05) {
          d.normalize();
          v.pos.addScaledVector(d, Math.min(dist, dt * (v.mode === 'fly' ? 0.9 : 0.6)));
          const ang = Math.atan2(d.x, d.z);
          v.rig.group.rotation.y += ((ang - v.rig.group.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 6);
        } else if (v.mode === 'walk') { v.mode = 'idle'; }
      }
      v.rig.group.position.copy(v.pos);
      animateMonster(v.rig, t, v.mode);
    }

    // sélection
    if (this.selectedUid) {
      const bv = this.buildingViews.get(this.selectedUid);
      const mv = this.monsterViews.get(this.selectedUid);
      if (bv) {
        const size = BUILDING[this.state!.buildings.find((b) => b.uid === bv.uid)?.defId ?? 'farm']?.size ?? 2;
        this.selectRing.position.set(bv.model.group.position.x, 0.14, bv.model.group.position.z);
        this.selectRing.scale.setScalar(size * 0.55 + Math.sin(t * 5) * 0.04);
      } else if (mv) {
        this.selectRing.position.set(mv.pos.x, 0.32, mv.pos.z);
        this.selectRing.scale.setScalar(0.6 + Math.sin(t * 5) * 0.03);
      }
    }

    // météo de l'île focalisée
    if (this.quality.weather && this.state) this.weather.set(weatherAt(this.focusIsland, Date.now()));
    this.weather.update(dt, this.target);
    this.hemi.intensity = 1.35 + this.weather.flash * 2.5;
    this.fx.update(dt);

    // marqueurs DOM
    for (const m of this.markers.values()) {
      const p = this.project(m.pos);
      m.el.style.display = p.visible ? '' : 'none';
      if (p.visible) m.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -100%)`;
    }
  }

  render(): void {
    if (this.battleScene && this.battleCamera) this.renderer.render(this.battleScene, this.battleCamera);
    else this.renderer.render(this.scene, this.camera);
  }

  elementColor(speciesId: string): string {
    return ELEMENTS[SPECIES[speciesId].elements[0]].color;
  }
}
