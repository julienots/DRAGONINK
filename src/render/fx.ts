import * as THREE from 'three';
import { softCircleTexture, starTexture } from './geo';
import type { WeatherId } from '../data/world';

// Effets : explosions de particules (récolte, éclosion, niveau) et météo.

interface Burst {
  points: THREE.Points;
  vel: Float32Array;
  life: number;
  max: number;
  gravity: number;
}

export class FxSystem {
  private bursts: Burst[] = [];
  constructor(private scene: THREE.Scene, public density = 1) {}

  burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, opts: { count?: number; speed?: number; up?: number; size?: number; life?: number; gravity?: number; star?: boolean } = {}): void {
    const n = Math.max(4, Math.round((opts.count ?? 24) * this.density));
    const p = new Float32Array(n * 3);
    const v = new Float32Array(n * 3);
    const sp = opts.speed ?? 2.5;
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      v[i * 3] = Math.cos(a) * sp * e;
      v[i * 3 + 1] = (opts.up ?? 3) * (0.5 + Math.random());
      v[i * 3 + 2] = Math.sin(a) * sp * e;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ color, size: opts.size ?? 0.35, map: opts.star ? starTexture() : softCircleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, m);
    pts.frustumCulled = false;
    this.scene.add(pts);
    const life = opts.life ?? 1.1;
    this.bursts.push({ points: pts, vel: v, life, max: life, gravity: opts.gravity ?? 5 });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let k = 0; k < a.length; k += 3) {
        b.vel[k + 1] -= b.gravity * dt;
        a[k] += b.vel[k] * dt; a[k + 1] += b.vel[k + 1] * dt; a[k + 2] += b.vel[k + 2] * dt;
      }
      pos.needsUpdate = true;
      (b.points.material as THREE.PointsMaterial).opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) {
        this.scene.remove(b.points);
        b.points.geometry.dispose();
        (b.points.material as THREE.Material).dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}

export class WeatherSystem {
  group = new THREE.Group();
  private points: THREE.Points | null = null;
  private lines: THREE.LineSegments | null = null;
  private rainbow: THREE.Mesh | null = null;
  current: WeatherId | null = null;
  private vel = 0;
  flash = 0;
  private flashTimer = 3;
  area = 22;

  constructor(scene: THREE.Scene, private density = 1) {
    scene.add(this.group);
  }

  set(w: WeatherId): void {
    if (w === this.current) return;
    this.clear();
    this.current = w;
    const A = this.area;
    if (w === 'rain' || w === 'storm') {
      const n = Math.round(500 * this.density);
      const pos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * A, y = Math.random() * 14, z = (Math.random() - 0.5) * A;
        pos.set([x, y, z, x + 0.05, y - 0.5, z], i * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.55 }));
      this.lines.frustumCulled = false;
      this.group.add(this.lines);
      this.vel = 16;
    } else if (w === 'snow' || w === 'stars' || w === 'sun') {
      const n = Math.round((w === 'sun' ? 60 : 380) * this.density);
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * A, Math.random() * 14, (Math.random() - 0.5) * A], i * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const color = w === 'snow' ? 0xffffff : w === 'stars' ? 0xfff4b0 : 0xfff1a8;
      this.points = new THREE.Points(g, new THREE.PointsMaterial({ color, size: w === 'snow' ? 0.22 : 0.3, map: w === 'stars' ? starTexture() : softCircleTexture(), transparent: true, depthWrite: false, opacity: w === 'sun' ? 0.7 : 0.95, blending: w === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending }));
      this.points.frustumCulled = false;
      this.group.add(this.points);
      this.vel = w === 'snow' ? 1.3 : w === 'stars' ? 3.5 : 0.25;
    } else if (w === 'rainbow') {
      const c = document.createElement('canvas');
      c.width = 4; c.height = 64;
      const g2 = c.getContext('2d')!;
      const grd = g2.createLinearGradient(0, 0, 0, 64);
      ['#ff4d4d', '#ffa64d', '#ffee4d', '#5cff7a', '#4dc3ff', '#9a5cff'].forEach((col, i) => grd.addColorStop(i / 5, col));
      g2.fillStyle = grd;
      g2.fillRect(0, 0, 4, 64);
      const tex = new THREE.CanvasTexture(c);
      const geo = new THREE.TorusGeometry(14, 0.9, 4, 48, Math.PI);
      this.rainbow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.45, depthWrite: false }));
      this.rainbow.position.set(0, -2, -14);
      this.group.add(this.rainbow);
    }
  }

  clear(): void {
    for (const o of [this.points, this.lines, this.rainbow]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.points = this.lines = this.rainbow = null;
    this.current = null;
  }

  update(dt: number, center: THREE.Vector3): void {
    this.group.position.set(center.x, 0, center.z);
    const o = this.points ?? this.lines;
    if (o) {
      const pos = o.geometry.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      const t = performance.now() / 1000;
      for (let k = 0; k < a.length; k += 3) {
        a[k + 1] -= this.vel * dt;
        if (this.current === 'snow') a[k] += Math.sin(t + k) * dt * 0.3;
        if (this.current === 'stars') { a[k] += dt * 1.2; }
        if (a[k + 1] < -2) {
          a[k + 1] += 16;
          if (this.lines && k % 6 === 0) { a[k + 4] = a[k + 1] - 0.5; }
        }
      }
      if (this.lines) for (let k = 0; k < a.length; k += 6) a[k + 4] = a[k + 1] - 0.5;
      pos.needsUpdate = true;
    }
    if (this.current === 'storm') {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) { this.flash = 1; this.flashTimer = 3 + Math.random() * 6; }
    }
    this.flash = Math.max(0, this.flash - dt * 3);
  }
}
