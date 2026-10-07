import * as THREE from 'three';
import { GeoBuilder, mat, toonMaterial } from './geo';
import type { IslandDef } from '../data/world';
import { GRID, islandTileOk } from '../data/world';
import { hashString, seededRng } from '../core/util';

// Îles flottantes : plateau herbeux, falaises coniques, rochers suspendus,
// cascades et décor thématique autour de la zone constructible.

export interface IslandModel {
  group: THREE.Group;
  waterfall?: THREE.Mesh;
  animated: { mesh: THREE.Object3D; kind: 'spin' | 'float' | 'pulse'; speed: number; base: number }[];
  topRadius: number;
}

let waterTex: THREE.CanvasTexture | null = null;
function waterTexture(): THREE.CanvasTexture {
  if (waterTex) return waterTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 32, 128);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(160,220,255,${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 32, Math.random() * 128, 2 + Math.random() * 4, 10 + Math.random() * 30);
  }
  waterTex = new THREE.CanvasTexture(c);
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  return waterTex;
}

export function buildIsland(def: IslandDef, quality: number): IslandModel {
  const rng = seededRng(hashString('island:' + def.id));
  const R = def.radius / 2 + 1.1;
  const g = new GeoBuilder();
  const seg = quality < 1 ? 28 : 44;

  // plateau (bord légèrement irrégulier)
  const top = new THREE.CylinderGeometry(R, R * 0.97, 0.7, seg, 2);
  const pos = top.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const d = Math.hypot(x, z);
    if (d > R * 0.5) {
      const k = 1 + Math.sin(a * 5 + def.radius) * 0.035 + Math.sin(a * 11) * 0.02;
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
  }
  g.addGradient(top, def.ground2, def.cliff, mat([0, -0.35, 0]), 0.05, 3);
  // herbe : anneaux concentriques avec variation de teinte par facette
  const rings = quality < 1 ? 6 : 10;
  const grassGeo = new THREE.CircleGeometry(R * 0.985, seg).toNonIndexed();
  const ringGeo = new THREE.RingGeometry(0.001, R * 0.985, seg, rings).toNonIndexed();
  grassGeo.dispose();
  const gp = ringGeo.attributes.position;
  const cols = new Float32Array(gp.count * 3);
  const c1 = new THREE.Color(def.ground), c2 = new THREE.Color(def.ground2), tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i += 3) {
    const cx = (gp.getX(i) + gp.getX(i + 1) + gp.getX(i + 2)) / 3, cy = (gp.getY(i) + gp.getY(i + 1) + gp.getY(i + 2)) / 3;
    const n = Math.sin(cx * 0.9 + cy * 0.4) * 0.5 + Math.sin(cy * 1.3 - cx * 0.7) * 0.5;
    tmp.copy(c1).lerp(c2, 0.35 + n * 0.3).multiplyScalar(0.94 + rng() * 0.1);
    for (let k = 0; k < 3; k++) cols.set([tmp.r, tmp.g, tmp.b], (i + k) * 3);
  }
  ringGeo.deleteAttribute('uv');
  ringGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  ringGeo.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(gp.count), 1));
  ringGeo.applyMatrix4(mat([0, 0.045, 0], [-Math.PI / 2, 0, 0]));
  g.parts.push(ringGeo);
  // falaise : cône inversé facetté
  const cliff = new THREE.ConeGeometry(R * 0.98, R * 1.25, Math.round(seg * 0.6), 4);
  const cp = cliff.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const y = cp.getY(i);
    if (y < R * 0.6) {
      const n = 1 + (rng() - 0.5) * 0.22;
      cp.setX(i, cp.getX(i) * n); cp.setZ(i, cp.getZ(i) * n);
    }
  }
  g.addGradient(cliff, def.cliff, shade(def.cliff, 0.55), mat([0, -0.7 - R * 0.62, 0], [Math.PI, 0, 0]), 0.18, 7);
  // rochers suspendus
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const d = R * (0.25 + rng() * 0.55);
    const h = 0.8 + rng() * 1.8;
    g.addGradient(new THREE.ConeGeometry(0.35 + rng() * 0.5, h, 6), shade(def.cliff, 0.8), shade(def.cliff, 0.45), mat([Math.cos(a) * d, -R * 0.55 - h * 0.4 - rng() * 1.2, Math.sin(a) * d], [Math.PI, rng(), 0]), 0.2, i + 11);
  }
  // rochers et bordure
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rng() * 0.2;
    const d = R * (0.93 + rng() * 0.05);
    const s = 0.25 + rng() * 0.35;
    g.add(new THREE.DodecahedronGeometry(s, 0), shade(def.cliff, 0.85 + rng() * 0.3), mat([Math.cos(a) * d, 0.05, Math.sin(a) * d], [rng(), rng(), rng()], [1, 0.7, 1]));
  }

  // décor thématique dans l'anneau non constructible
  const animated: IslandModel['animated'] = [];
  const ring = (): [number, number] | null => {
    for (let k = 0; k < 30; k++) {
      const a = rng() * Math.PI * 2;
      const d = R * (0.55 + rng() * 0.37);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const tx = Math.floor(x + GRID / 2), tz = Math.floor(z + GRID / 2);
      if (!islandTileOk(def.id, tx, tz) && Math.hypot(x, z) < R * 0.9) return [x, z];
    }
    return null;
  };
  const count = quality < 1 ? 10 : 18;
  for (let i = 0; i < count; i++) {
    const p = ring();
    if (!p) continue;
    addProp(g, def, p[0], p[1], rng);
  }

  const mesh = new THREE.Mesh(g.build(), toonMaterial());
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const group = new THREE.Group();
  group.add(mesh);

  // cascade
  let waterfall: THREE.Mesh | undefined;
  if (!['cosmique', 'celeste'].includes(def.id)) {
    const a = rng() * Math.PI * 2;
    const wfMat = new THREE.MeshBasicMaterial({ color: def.water, map: waterTexture(), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const h = 7;
    waterfall = new THREE.Mesh(new THREE.PlaneGeometry(1.4, h), wfMat);
    waterfall.position.set(Math.cos(a) * (R + 0.05), -h / 2 + 0.1, Math.sin(a) * (R + 0.05));
    waterfall.lookAt(Math.cos(a) * (R + 5), -h / 2, Math.sin(a) * (R + 5));
    group.add(waterfall);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18), new THREE.MeshBasicMaterial({ color: def.water, transparent: true, opacity: 0.9 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(Math.cos(a) * (R - 1.0), 0.06, Math.sin(a) * (R - 1.0));
    group.add(pool);
  }

  // éléments animés : cristaux flottants / planètes
  if (['cosmique', 'celeste', 'ombres', 'aurore'].includes(def.id)) {
    for (let i = 0; i < 4; i++) {
      const fg = new GeoBuilder();
      const col = def.id === 'cosmique' ? ['#ff7bf1', '#5cf2ff', '#ffd36b', '#7a8cff'][i] : def.id === 'ombres' ? '#b98cff' : def.id === 'aurore' ? '#ffe680' : '#ffffff';
      if (def.id === 'cosmique') {
        fg.add(new THREE.SphereGeometry(0.5 + i * 0.15, 12, 9), col, undefined, { emissive: 0.2 });
        fg.add(new THREE.TorusGeometry(0.9 + i * 0.2, 0.05, 4, 24), '#ffffff', mat([0, 0, 0], [1.2, 0, 0.3]), { emissive: 0.6 });
      } else if (def.id === 'celeste') {
        for (let k = 0; k < 4; k++) fg.add(new THREE.SphereGeometry(0.45, 8, 6), '#ffffff', mat([k * 0.45 - 0.7, Math.sin(k) * 0.15, 0], [0, 0, 0], [1, 0.7, 0.8]));
      } else {
        fg.add(new THREE.OctahedronGeometry(0.5), col, mat([0, 0, 0], [0, 0, 0], [0.6, 1.4, 0.6]), { emissive: 0.6 });
      }
      const m = new THREE.Mesh(fg.build(), toonMaterial());
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const y = 3 + i * 0.6;
      m.position.set(Math.cos(a) * (R + 2), y, Math.sin(a) * (R + 2));
      group.add(m);
      animated.push({ mesh: m, kind: 'float', speed: 0.6 + i * 0.15, base: y });
    }
  }
  return { group, waterfall, animated, topRadius: R };
}

function shade(c: string, k: number): string {
  return '#' + new THREE.Color(c).multiplyScalar(k).getHexString();
}

function addProp(g: GeoBuilder, def: IslandDef, x: number, z: number, rng: () => number): void {
  const s = 0.8 + rng() * 0.6;
  const rot: [number, number, number] = [0, rng() * 6, 0];
  switch (def.id) {
    case 'verdante':
    case 'aurore':
    case 'corail': {
      const leaf = def.id === 'aurore' ? (rng() < 0.5 ? '#ffb3d9' : '#ffd6ec') : def.id === 'corail' ? '#3fcf8a' : rng() < 0.5 ? '#3fae3a' : '#57c94a';
      if (def.id === 'corail' && rng() < 0.5) {
        g.add(new THREE.CylinderGeometry(0.06, 0.1, 1.8 * s, 6), '#b4865a', mat([x, 0.9 * s, z], [0.15, 0, 0.1]));
        for (let k = 0; k < 5; k++) g.add(new THREE.ConeGeometry(0.18, 1.1, 4), '#3fcf6a', mat([x + Math.cos(k * 1.3) * 0.4, 1.8 * s, z + Math.sin(k * 1.3) * 0.4], [Math.cos(k * 1.3) * 1.1, 0, Math.sin(k * 1.3) * 1.1], [1, 1, 0.3]));
      } else if (rng() < 0.65) {
        g.add(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.9 * s, 6), '#8a5a36', mat([x, 0.45 * s, z]));
        g.add(new THREE.SphereGeometry(0.62 * s, 9, 7), leaf, mat([x, 1.2 * s, z], rot, [1, 0.85, 1]));
        g.add(new THREE.SphereGeometry(0.42 * s, 8, 6), shade(leaf, 1.15), mat([x + 0.25 * s, 1.55 * s, z + 0.1], rot));
      } else {
        g.add(new THREE.SphereGeometry(0.4 * s, 8, 6), leaf, mat([x, 0.25 * s, z], rot, [1, 0.7, 1]));
        g.add(new THREE.SphereGeometry(0.08, 6, 4), ['#ff6a8a', '#ffe14d', '#ffffff'][Math.floor(rng() * 3)], mat([x + 0.2, 0.5 * s, z + 0.2]));
      }
      break;
    }
    case 'volcanique':
    case 'dunes':
      if (def.id === 'dunes' && rng() < 0.5) {
        g.add(new THREE.CylinderGeometry(0.18, 0.2, 1.2 * s, 7), '#3f9a4a', mat([x, 0.6 * s, z]));
        g.add(new THREE.CylinderGeometry(0.1, 0.12, 0.5 * s, 6), '#3f9a4a', mat([x + 0.25, 0.8 * s, z], [0, 0, -0.9]));
      } else if (rng() < 0.4 && def.id === 'volcanique') {
        g.add(new THREE.ConeGeometry(1.1 * s, 1.6 * s, 7), '#5a3328', mat([x, 0.8 * s, z]));
        g.add(new THREE.CylinderGeometry(0.32 * s, 0.32 * s, 0.1, 8), '#ff7a1c', mat([x, 1.58 * s, z]), { emissive: 1 });
      } else {
        g.add(new THREE.DodecahedronGeometry(0.5 * s, 0), def.id === 'dunes' ? '#d9a95a' : '#4a2c24', mat([x, 0.3 * s, z], [rng(), rng(), rng()], [1, 0.7, 1]));
        if (def.id === 'volcanique') g.add(new THREE.SphereGeometry(0.15, 6, 4), '#ff8a2b', mat([x + 0.3, 0.12, z]), { emissive: 1 });
      }
      break;
    case 'glaciaire':
      if (rng() < 0.5) {
        for (let k = 0; k < 3; k++) g.add(new THREE.ConeGeometry(0.55 - k * 0.12, 0.7, 7), k === 2 ? '#ffffff' : '#2f7a6a', mat([x, 0.4 + k * 0.38, z]));
      } else g.add(new THREE.OctahedronGeometry(0.45 * s), '#bdf0ff', mat([x, 0.5 * s, z], rot, [0.6, 1.6, 0.6]), { emissive: 0.25 });
      break;
    case 'celeste':
      if (rng() < 0.5) g.add(new THREE.CylinderGeometry(0.2, 0.24, 1.6 * s, 10), '#fff4d6', mat([x, 0.8 * s, z]));
      else g.add(new THREE.SphereGeometry(0.5 * s, 8, 6), '#ffffff', mat([x, 0.3 * s, z], rot, [1.4, 0.6, 1]));
      break;
    case 'ombres':
    case 'cosmique':
      g.add(new THREE.OctahedronGeometry(0.4 * s), def.id === 'ombres' ? '#9a5cff' : '#7a8cff', mat([x, 0.55 * s, z], rot, [0.6, 1.7, 0.6]), { emissive: 0.55 });
      if (rng() < 0.5) g.add(new THREE.OctahedronGeometry(0.25 * s), '#ff7bf1', mat([x + 0.35, 0.35 * s, z + 0.1], rot, [0.6, 1.5, 0.6]), { emissive: 0.55 });
      break;
    case 'tempete':
      g.add(new THREE.DodecahedronGeometry(0.5 * s, 0), '#4a5068', mat([x, 0.3 * s, z], rot, [1, 0.8, 1]));
      if (rng() < 0.4) {
        g.add(new THREE.CylinderGeometry(0.05, 0.08, 2 * s, 6), '#8a93b8', mat([x, s, z]));
        g.add(new THREE.SphereGeometry(0.14, 8, 6), '#ffe14d', mat([x, 2 * s, z]), { emissive: 1 });
      }
      break;
  }
}

export function buildCloud(rng: () => number, color = '#ffffff'): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const r = 0.8 + rng() * 1.2;
    g.add(new THREE.SphereGeometry(r, 8, 6), color, mat([i * 1.1 - n * 0.55, rng() * 0.6, (rng() - 0.5) * 1.2], [0, 0, 0], [1, 0.7, 1]), { emissive: 0.15 });
  }
  return g.build();
}
