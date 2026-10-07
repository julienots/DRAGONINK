import * as THREE from 'three';
import type { BattleState, TurnResult, Fighter } from '../systems/battle';
import { buildMonster, animateMonster, disposeRig, flashMonster, type MonsterRig, type AnimMode } from './monsterModel';
import { GeoBuilder, mat, toonMaterial, softCircleTexture } from './geo';
import { FxSystem } from './fx';
import { ELEMENTS } from '../data/elements';
import type { WorldRenderer } from './world';
import { buildCloud } from './islandModel';
import { seededRng } from '../core/util';

interface FighterView {
  f: Fighter;
  rig: MonsterRig;
  home: THREE.Vector3;
  mode: AnimMode;
  modeUntil: number;
}

// Scène de combat : arène flottante, deux équipes face à face,
// projectiles élémentaires, chiffres de dégâts, KO.

export class BattleView {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.3, 200);
  private views = new Map<string, FighterView>();
  private fx: FxSystem;
  private t = 0;
  private projectiles: { mesh: THREE.Points; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; done: () => void }[] = [];
  speed = 1;
  private shake = 0;

  constructor(private world: WorldRenderer, private numbersLayer: HTMLElement, bossMode: boolean) {
    const top = bossMode ? '#2a1240' : '#5a7cff';
    const c = document.createElement('canvas');
    c.width = 2; c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0, top); grd.addColorStop(1, bossMode ? '#ff7a5a' : '#ffd6ec');
    g.fillStyle = grd; g.fillRect(0, 0, 2, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7a6ab8, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);
    // arène
    const ag = new GeoBuilder();
    ag.addGradient(new THREE.CylinderGeometry(7, 6.6, 1, 36), '#f3d28a', '#b48a5e', mat([0, -0.5, 0]), 0.04, 5);
    ag.addGradient(new THREE.ConeGeometry(6.6, 7, 24, 3), '#8a6a4a', '#3a2c40', mat([0, -4.5, 0], [Math.PI, 0, 0]), 0.15, 9);
    ag.add(new THREE.RingGeometry(2.4, 2.6, 40), '#ffffff', mat([0, 0.02, 0], [-Math.PI / 2, 0, 0]), { emissive: 0.3 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      ag.add(new THREE.BoxGeometry(0.5, 1.6 + (i % 3) * 0.3, 0.4), '#fff4e6', mat([Math.cos(a) * 6.4, 0.7, Math.sin(a) * 6.4], [0, -a, 0]));
      ag.add(new THREE.SphereGeometry(0.16, 8, 6), i % 2 ? '#5cf2ff' : '#ff7bf1', mat([Math.cos(a) * 6.4, 1.8 + (i % 3) * 0.3, Math.sin(a) * 6.4]), { emissive: 1 });
    }
    this.scene.add(new THREE.Mesh(ag.build(), toonMaterial()));
    const rng = seededRng(5);
    for (let i = 0; i < 10; i++) {
      const cl = new THREE.Mesh(buildCloud(rng), toonMaterial({ transparent: true, opacity: 0.9 }));
      const a = rng() * Math.PI * 2;
      cl.position.set(Math.cos(a) * (14 + rng() * 20), -4 - rng() * 6, Math.sin(a) * (14 + rng() * 20));
      cl.scale.setScalar(1.5 + rng() * 2);
      this.scene.add(cl);
    }
    this.fx = new FxSystem(this.scene, world.quality.particles);
    world.battleScene = this.scene;
    world.battleCamera = this.camera;
    this.resize();
  }

  resize(): void {
    const c = this.world.renderer.domElement;
    this.camera.aspect = (c.clientWidth || 1) / (c.clientHeight || 1);
    // en portrait, on recule la caméra pour voir les deux équipes
    const portrait = this.camera.aspect < 1;
    this.camera.fov = portrait ? 52 : 40;
    this.camera.position.set(0, portrait ? 13 : 7.5, portrait ? 13.5 : 11);
    this.camera.lookAt(0, 0.8, 0);
    this.camera.updateProjectionMatrix();
  }

  setup(b: BattleState): void {
    for (const f of b.fighters) {
      const side = f.side === 0 ? 1 : -1;
      const team = b.fighters.filter((x) => x.side === f.side);
      const idx = team.indexOf(f);
      const n = team.length;
      const rig = buildMonster(f.look, f.stage, { boss: f.isBoss, outline: this.world.quality.outline, rarity: undefined, seed: f.speciesId ?? f.bossId, skin: f.skin });
      const home = f.isBoss ? new THREE.Vector3(0, 0, -2.6) : new THREE.Vector3((idx - (n - 1) / 2) * 2.3, 0, side * 2.6);
      rig.group.position.copy(home);
      rig.group.rotation.y = f.side === 0 ? Math.PI : 0;
      if (f.side === 0) rig.group.rotation.y = Math.PI;
      // l'équipe du joueur regarde vers -z, l'adversaire vers +z
      rig.group.rotation.y = f.side === 0 ? Math.PI : 0;
      rig.group.scale.setScalar(f.isBoss ? 1 : 1.25);
      this.scene.add(rig.group);
      this.views.set(f.id, { f, rig, home, mode: 'idle', modeUntil: 0 });
    }
  }

  fighterScreenPos(id: string): { x: number; y: number } | null {
    const v = this.views.get(id);
    if (!v) return null;
    const p = v.rig.group.position.clone().add(new THREE.Vector3(0, v.rig.height * v.rig.group.scale.x + 0.3, 0)).project(this.camera);
    const c = this.world.renderer.domElement;
    return { x: (p.x * 0.5 + 0.5) * c.clientWidth, y: (-p.y * 0.5 + 0.5) * c.clientHeight };
  }

  private setMode(id: string, mode: AnimMode, ms: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.mode = mode;
    v.modeUntil = performance.now() + ms / this.speed;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms / this.speed));
  }

  private shoot(from: THREE.Vector3, to: THREE.Vector3, color: string, dur = 380): Promise<void> {
    return new Promise((resolve) => {
      const n = 16;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.55, map: softCircleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false;
      this.scene.add(pts);
      this.projectiles.push({ mesh: pts, from, to, t: 0, dur: dur / 1000 / this.speed, done: resolve });
    });
  }

  number(targetId: string, text: string, cls: string): void {
    const p = this.fighterScreenPos(targetId);
    if (!p) return;
    const el = document.createElement('div');
    el.className = `dmg-num ${cls}`;
    el.textContent = text;
    el.style.left = `${p.x + (Math.random() - 0.5) * 30}px`;
    el.style.top = `${p.y}px`;
    this.numbersLayer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  async play(res: TurnResult): Promise<void> {
    const actor = this.views.get(res.actor);
    if (!actor) return;
    const sk = res.skill;
    const pre = res.events.filter((e) => e.kind === 'dot' || e.kind === 'stunned' || (e.kind === 'heal' && !e.source));
    for (const e of pre) {
      if (e.kind === 'dot') { this.number(e.target, `-${e.amount}`, 'dot'); this.setMode(e.target, 'hit', 300); }
      if (e.kind === 'stunned') this.number(e.target, 'Étourdi !', 'info');
      if (e.kind === 'heal') this.number(e.target, `+${e.amount}`, 'heal');
    }
    if (pre.length) await this.wait(380);
    if (!sk) { this.syncKo(); return; }
    const color = ELEMENTS[sk.element].color;
    const offensive = sk.power > 0;
    this.setMode(res.actor, offensive ? 'attack' : 'happy', 700);
    // élan vers l'avant
    const dir = actor.f.side === 0 ? -1 : 1;
    const lunge = sk.kind === 'normal' ? 1.1 : 0.4;
    actor.rig.group.position.z = actor.home.z + dir * lunge;
    this.number(res.actor, sk.name, sk.kind === 'ultimate' ? 'ult' : 'skill');
    if (sk.kind === 'ultimate') { this.shake = 0.5; this.fx.burst(actor.rig.group.position.clone().add(new THREE.Vector3(0, 1, 0)), color, { count: 50, speed: 4, up: 4, star: true }); }
    await this.wait(200);
    const from = actor.rig.group.position.clone().add(new THREE.Vector3(0, actor.rig.height * 0.7, 0));
    const targets = res.targets.map((id) => this.views.get(id)).filter(Boolean) as FighterView[];
    if (offensive) {
      await Promise.all(targets.map((t) => this.shoot(from, t.rig.group.position.clone().add(new THREE.Vector3(0, t.rig.height * 0.6 * t.rig.group.scale.x, 0)), color)));
    } else {
      for (const t of targets) this.fx.burst(t.rig.group.position.clone().add(new THREE.Vector3(0, 0.8, 0)), color, { count: 20, speed: 1.5, up: 2.5 });
    }
    for (const e of res.events) {
      if (e.kind === 'damage') {
        const tv = this.views.get(e.target);
        if (tv) {
          flashMonster(tv.rig, 140);
          this.setMode(e.target, 'hit', 400);
          this.fx.burst(tv.rig.group.position.clone().add(new THREE.Vector3(0, 0.7 * tv.rig.group.scale.x, 0)), color, { count: 14, speed: 2.5, up: 2 });
        }
        const tag = e.mult! > 1 ? ' Super efficace !' : e.mult! < 1 ? ' Peu efficace' : '';
        this.number(e.target, `-${e.amount}${e.crit ? '!' : ''}`, e.mult! > 1 ? 'super' : e.mult! < 1 ? 'weak' : 'dmg');
        if (tag) this.number(e.target, tag.trim(), e.mult! > 1 ? 'super-label' : 'weak-label');
        if (e.crit) this.shake = Math.max(this.shake, 0.25);
      } else if (e.kind === 'heal') {
        this.number(e.target, `+${e.amount}`, 'heal');
      } else if (e.kind === 'status') {
        this.number(e.target, statusLabel(e.status!), 'info');
      }
    }
    await this.wait(260);
    actor.rig.group.position.copy(actor.home);
    this.syncKo();
    await this.wait(240);
  }

  syncKo(): void {
    for (const v of this.views.values()) {
      if (v.f.hp <= 0 && v.mode !== 'ko') { v.mode = 'ko'; v.modeUntil = Infinity; this.fx.burst(v.rig.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffffff', { count: 18 }); }
    }
  }

  celebrate(side: 0 | 1): void {
    for (const v of this.views.values()) if (v.f.side === side && v.f.hp > 0) { v.mode = 'happy'; v.modeUntil = Infinity; }
  }

  update(dt: number): void {
    this.t += dt;
    const now = performance.now();
    for (const v of this.views.values()) {
      if (v.mode !== 'ko' && now > v.modeUntil && v.mode !== 'idle') v.mode = 'idle';
      animateMonster(v.rig, this.t, v.mode);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt / p.dur;
      const pos = p.mesh.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let k = 0; k < arr.length / 3; k++) {
        const tt = Math.max(0, Math.min(1, p.t - k * 0.03));
        const x = p.from.x + (p.to.x - p.from.x) * tt, z = p.from.z + (p.to.z - p.from.z) * tt;
        const y = p.from.y + (p.to.y - p.from.y) * tt + Math.sin(tt * Math.PI) * 1.2;
        arr[k * 3] = x + (Math.random() - 0.5) * 0.15; arr[k * 3 + 1] = y; arr[k * 3 + 2] = z;
      }
      pos.needsUpdate = true;
      if (p.t >= 1.4) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
        p.done();
      }
    }
    this.fx.update(dt);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x = (Math.random() - 0.5) * this.shake;
    } else this.camera.position.x = 0;
  }

  dispose(): void {
    for (const v of this.views.values()) disposeRig(v.rig);
    this.views.clear();
    if (this.world.battleScene === this.scene) { this.world.battleScene = null; this.world.battleCamera = null; }
  }
}

function statusLabel(s: string): string {
  return ({ burn: '🔥 Brûlure', poison: '☠️ Poison', stun: '💫 Étourdi', weaken: '⬇️ Affaibli', slow: '🐌 Ralenti', shield: '🛡️ Bouclier', regen: '💚 Régén.', haste: '💨 Célérité' } as Record<string, string>)[s] ?? s;
}
