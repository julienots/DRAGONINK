import * as THREE from 'three';
import { GeoBuilder, mat, toonMaterial } from './geo';
import { BUILDING } from '../data/world';
import { ELEMENTS } from '../data/elements';
import type { ElementId } from '../core/types';

// Modèles 3D des bâtiments. Les habitats deviennent visuellement plus
// impressionnants à chaque niveau (plus d'éléments, lueurs, ornements dorés).

export interface BuildingModel {
  group: THREE.Group;
  height: number;
  spinners: THREE.Object3D[];
}

function platform(g: GeoBuilder, size: number, top: string, side: string, h = 0.22): void {
  const r = size * 0.48;
  g.add(new THREE.CylinderGeometry(r, r * 1.04, h, 20), side, mat([0, h / 2, 0]));
  g.add(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.04, 20), top, mat([0, h + 0.01, 0]));
}

function fence(g: GeoBuilder, size: number, color: string, level: number): void {
  const r = size * 0.47;
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; // ouverture
    g.add(new THREE.CylinderGeometry(0.05, 0.06, 0.32, 5), color, mat([Math.cos(a) * r, 0.36, Math.sin(a) * r]));
    if (level >= 5) g.add(new THREE.SphereGeometry(0.07, 6, 4), '#ffd36b', mat([Math.cos(a) * r, 0.55, Math.sin(a) * r]), { emissive: 0.4 });
  }
}

function habitat(g: GeoBuilder, el: ElementId | 'any', level: number, size: number, spinMeshes: THREE.Object3D[], root: THREE.Group): number {
  const E = el === 'any' ? { color: '#c9b8ff', color2: '#ffffff' } : ELEMENTS[el];
  let h = 1;
  const L = level;
  switch (el) {
    case 'flamme':
      platform(g, size, '#7a3a24', '#4a2c24');
      g.add(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), '#ff7a1c', mat([0.2, 0.26, 0.1]), { emissive: 1 });
      for (let i = 0; i < 2 + L; i++) g.add(new THREE.DodecahedronGeometry(0.22 + (i % 2) * 0.1, 0), '#3a221c', mat([Math.cos(i * 1.7) * 0.95, 0.3, Math.sin(i * 1.7) * 0.95]));
      if (L >= 2) { g.add(new THREE.ConeGeometry(0.55, 0.9 + L * 0.15, 8), '#5a3328', mat([-0.55, 0.65, -0.5])); g.add(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), '#ffb347', mat([-0.55, 1.12 + L * 0.075, -0.5]), { emissive: 1 }); h = 1.4 + L * 0.15; }
      if (L >= 4) for (let i = 0; i < 3; i++) g.add(new THREE.OctahedronGeometry(0.18), '#ffcf4d', mat([0.7 - i * 0.3, 0.5 + i * 0.1, -0.7], [0, i, 0], [0.6, 1.6, 0.6]), { emissive: 0.8 });
      break;
    case 'aqua':
      platform(g, size, '#7fd9ff', '#3a7fb5');
      g.add(new THREE.CylinderGeometry(0.85, 0.85, 0.06, 20), '#2fa8ff', mat([0, 0.26, 0]), { emissive: 0.25 });
      for (let i = 0; i < L + 1; i++) g.add(new THREE.CylinderGeometry(0.22, 0.22, 0.03, 10), '#3fcf5a', mat([Math.cos(i * 2.1) * 0.5, 0.3, Math.sin(i * 2.1) * 0.5]));
      if (L >= 2) { g.add(new THREE.CylinderGeometry(0.12, 0.2, 0.6 + L * 0.1, 8), '#e9fbff', mat([0, 0.55, 0])); g.add(new THREE.SphereGeometry(0.22, 10, 8), '#8ee6ff', mat([0, 0.95 + L * 0.05, 0]), { emissive: 0.4 }); h = 1.3; }
      if (L >= 3) g.add(new THREE.TorusGeometry(0.8, 0.09, 6, 20, Math.PI), '#ff7f9a', mat([0, 0.25, -0.6], [0, 0, 0]));
      break;
    case 'flora':
      platform(g, size, '#5fcf4a', '#8a5a36');
      for (let i = 0; i < 1 + L; i++) {
        const a = i * 2.3, d = 0.85;
        g.add(new THREE.CylinderGeometry(0.06, 0.09, 0.6, 6), '#8a5a36', mat([Math.cos(a) * d, 0.5, Math.sin(a) * d]));
        g.add(new THREE.SphereGeometry(0.34, 9, 7), i % 2 ? '#3fae3a' : '#7bdc5a', mat([Math.cos(a) * d, 0.95, Math.sin(a) * d]));
      }
      for (let i = 0; i < 6; i++) g.add(new THREE.SphereGeometry(0.06, 6, 4), ['#ff6a8a', '#ffe14d', '#ffffff'][i % 3], mat([Math.cos(i) * 0.4, 0.28, Math.sin(i * 1.3) * 0.4]));
      h = 1.3;
      break;
    case 'volt':
      platform(g, size, '#8c8fa8', '#3b3b55');
      for (let i = 0; i < Math.min(4, L); i++) {
        const a = (i / Math.max(1, Math.min(4, L))) * Math.PI * 2 + 0.6;
        g.add(new THREE.CylinderGeometry(0.06, 0.12, 1 + L * 0.12, 6), '#5d6bff', mat([Math.cos(a) * 0.85, 0.75, Math.sin(a) * 0.85]));
        g.add(new THREE.TorusGeometry(0.14, 0.04, 5, 10), '#c0c4dc', mat([Math.cos(a) * 0.85, 1.0, Math.sin(a) * 0.85], [Math.PI / 2, 0, 0]));
        g.add(new THREE.SphereGeometry(0.13, 8, 6), '#fff35a', mat([Math.cos(a) * 0.85, 1.3 + L * 0.06, Math.sin(a) * 0.85]), { emissive: 1 });
      }
      h = 1.6;
      break;
    case 'ombre':
      platform(g, size, '#3d2f5c', '#1a0f33');
      for (let i = 0; i < 2 + L; i++) {
        const a = i * 1.9;
        g.add(new THREE.OctahedronGeometry(0.2 + (i % 3) * 0.06), i % 2 ? '#9a5cff' : '#ff7bf1', mat([Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8], [0, a, 0.2], [0.6, 1.7, 0.6]), { emissive: 0.7 });
      }
      if (L >= 3) g.add(new THREE.TorusGeometry(0.5, 0.06, 6, 16), '#b98cff', mat([0, 1.3, -0.4], [0, 0, 0]), { emissive: 0.8 });
      h = 1.4;
      break;
    case 'glace':
      platform(g, size, '#e8f6ff', '#7fa8c8');
      g.add(new THREE.SphereGeometry(0.55 + L * 0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#cfefff', mat([-0.4, 0.24, -0.4]));
      for (let i = 0; i < L + 1; i++) g.add(new THREE.ConeGeometry(0.15, 0.6 + (i % 2) * 0.3, 6), '#bdf0ff', mat([Math.cos(i * 1.6) * 0.85, 0.5, Math.sin(i * 1.6) * 0.85]), { emissive: 0.2 });
      h = 1.2;
      break;
    case 'vent': {
      platform(g, size, '#c9f5e4', '#5c9a86');
      g.add(new THREE.CylinderGeometry(0.1, 0.16, 1.4 + L * 0.15, 8), '#f0fff8', mat([-0.5, 0.9, -0.5]));
      const blades = new GeoBuilder();
      for (let i = 0; i < 4; i++) blades.add(new THREE.BoxGeometry(0.12, 0.7, 0.03), i % 2 ? '#8fe3c0' : '#ffffff', mat([Math.cos((i * Math.PI) / 2) * 0.35, Math.sin((i * Math.PI) / 2) * 0.35, 0], [0, 0, (i * Math.PI) / 2]));
      const bm = new THREE.Mesh(blades.build(), toonMaterial());
      bm.position.set(-0.5, 1.6 + L * 0.15, -0.38);
      root.add(bm);
      spinMeshes.push(bm);
      for (let i = 0; i < L; i++) g.add(new THREE.SphereGeometry(0.3, 8, 6), '#ffffff', mat([Math.cos(i * 2) * 0.8, 0.4, Math.sin(i * 2) * 0.8], [0, 0, 0], [1.3, 0.6, 1]));
      h = 2;
      break;
    }
    case 'roche':
      platform(g, size, '#b0865a', '#4e3a26');
      g.add(new THREE.TorusGeometry(0.6, 0.3, 6, 10, Math.PI), '#8a6a4a', mat([0, 0.25, -0.45]));
      for (let i = 0; i < L + 2; i++) g.add(new THREE.DodecahedronGeometry(0.2 + (i % 3) * 0.08, 0), '#a87e52', mat([Math.cos(i * 1.4) * 0.8, 0.35, Math.sin(i * 1.4) * 0.8]));
      if (L >= 3) g.add(new THREE.OctahedronGeometry(0.2), '#9fe9ff', mat([0, 0.95, -0.45], [0, 0, 0], [0.7, 1.4, 0.7]), { emissive: 0.6 });
      h = 1.1;
      break;
    case 'lumiere':
      platform(g, size, '#fffbe6', '#e0c98a');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        g.add(new THREE.CylinderGeometry(0.1, 0.12, 1 + L * 0.12, 10), '#ffffff', mat([Math.cos(a) * 0.8, 0.75, Math.sin(a) * 0.8]));
      }
      g.add(new THREE.SphereGeometry(0.28 + L * 0.03, 12, 10), '#ffe680', mat([0, 1.0 + L * 0.08, 0]), { emissive: 1 });
      if (L >= 3) g.add(new THREE.TorusGeometry(0.85, 0.05, 6, 24), '#ffd36b', mat([0, 1.3 + L * 0.12, 0], [Math.PI / 2, 0, 0]), { emissive: 0.6 });
      h = 1.8;
      break;
    case 'cosmos':
      platform(g, size, '#2b2f6b', '#151838');
      g.add(new THREE.SphereGeometry(0.35, 12, 10), '#ff7bf1', mat([0, 1.0, 0]), { emissive: 0.7 });
      for (let i = 0; i < Math.min(3, L); i++) g.add(new THREE.TorusGeometry(0.55 + i * 0.18, 0.03, 4, 28), ['#5cf2ff', '#ffd36b', '#ffffff'][i], mat([0, 1.0, 0], [1.2 + i * 0.4, i, 0]), { emissive: 0.8 });
      for (let i = 0; i < 6; i++) g.add(new THREE.OctahedronGeometry(0.08), '#ffffff', mat([Math.cos(i) * 0.9, 0.35 + (i % 3) * 0.2, Math.sin(i) * 0.9]), { emissive: 1 });
      h = 1.6;
      break;
    default:
      platform(g, size, '#efe6ff', '#8a7ab8');
      for (let i = 0; i < 6; i++) g.add(new THREE.OctahedronGeometry(0.25), ['#ff6a2b', '#2fa8ff', '#3fcf5a', '#ffd400', '#6a3cbc', '#7fe3ff'][i], mat([Math.cos(i) * 0.8, 0.6, Math.sin(i) * 0.8], [0, i, 0], [0.6, 1.6, 0.6]), { emissive: 0.6 });
      h = 1.4;
  }
  fence(g, size, L >= 4 ? '#ffd36b' : E.color, L);
  // fanion de niveau
  g.add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 5), '#6a4a2a', mat([size * 0.42, 0.65, size * 0.12]));
  g.add(new THREE.BoxGeometry(0.04, 0.24, 0.36), E.color, mat([size * 0.42, 0.98, size * 0.3]), { emissive: 0.2 });
  return h;
}

export function buildBuildingModel(defId: string, level: number, under: boolean): BuildingModel {
  const def = BUILDING[defId];
  const size = def.size;
  const g = new GeoBuilder();
  const root = new THREE.Group();
  const spinners: THREE.Object3D[] = [];
  let h = 1;
  if (under) {
    // chantier
    platform(g, size, '#d9b98a', '#8a6a4a', 0.12);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(new THREE.BoxGeometry(0.08, 1.2, 0.08), '#b4865a', mat([x * size * 0.32, 0.7, z * size * 0.32]));
    g.add(new THREE.BoxGeometry(size * 0.7, 0.08, 0.08), '#b4865a', mat([0, 1.2, size * 0.32]));
    g.add(new THREE.BoxGeometry(size * 0.7, 0.08, 0.08), '#b4865a', mat([0, 1.2, -size * 0.32]));
    g.add(new THREE.BoxGeometry(0.5, 0.4, 0.5), '#c9915a', mat([0.2, 0.32, 0.1], [0, 0.4, 0]));
    g.add(new THREE.BoxGeometry(0.35, 0.3, 0.35), '#ffcf4d', mat([-0.3, 0.27, -0.2], [0, 0.9, 0]));
    h = 1.3;
  } else switch (def.kind) {
    case 'habitat':
      h = habitat(g, def.element as ElementId | 'any', level, size, spinners, root);
      break;
    case 'farm': {
      g.add(new THREE.BoxGeometry(size * 0.92, 0.16, size * 0.92), '#8a5a36', mat([0, 0.08, 0]));
      for (let i = 0; i < 4; i++) g.add(new THREE.BoxGeometry(size * 0.84, 0.1, 0.24), '#6a4228', mat([0, 0.18, -0.6 + i * 0.4]));
      for (const sx of [-1, 1]) g.add(new THREE.BoxGeometry(0.06, 0.25, size * 0.92), '#c9a06a', mat([sx * size * 0.46, 0.2, 0]));
      if (level >= 3) g.add(new THREE.BoxGeometry(0.3, 0.3, 0.3), '#c9a06a', mat([size * 0.4, 0.3, size * 0.4]));
      h = 0.5;
      break;
    }
    case 'nursery': {
      platform(g, size, '#ffe8c4', '#c9a06a');
      g.add(new THREE.TorusGeometry(0.75, 0.22, 8, 20), '#c9915a', mat([0, 0.35, 0], [Math.PI / 2, 0, 0]));
      g.add(new THREE.SphereGeometry(1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), '#ffd6ec', mat([0, 0.22, 0], [0, 0, 0], [1, 1.05, 1]));
      g.add(new THREE.TorusGeometry(1.0, 0.06, 6, 24), '#ffffff', mat([0, 0.75, 0], [Math.PI / 2, 0, 0]), { emissive: 0.2 });
      g.add(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 12, 1, false, 0, Math.PI), '#ffb3d9', mat([0, 0.5, 1.05], [0, -Math.PI / 2, 0]));
      for (let i = 0; i < level; i++) g.add(new THREE.SphereGeometry(0.1, 8, 6), '#fff4b0', mat([Math.cos(i * 1.2) * 0.9, 1.45 + Math.sin(i) * 0.1, Math.sin(i * 1.2) * 0.4]), { emissive: 0.8 });
      h = 1.6;
      break;
    }
    case 'breeding': {
      platform(g, size, '#ffe0f0', '#b07aa8');
      for (const sx of [-1, 1]) {
        g.add(new THREE.TorusGeometry(0.55, 0.13, 8, 16, Math.PI), '#f4e8ff', mat([sx * 0.35, 0.25, 0], [0, 0, 0], [1, 1.6, 1]));
      }
      g.add(new THREE.OctahedronGeometry(0.3), '#ff4fa3', mat([0, 1.15, 0], [0, 0, 0], [0.8, 1.2, 0.8]), { emissive: 0.9 });
      for (let i = 0; i < level + 2; i++) g.add(new THREE.SphereGeometry(0.07, 6, 4), '#ffb3d9', mat([Math.cos(i) * 1.1, 0.3, Math.sin(i) * 1.1]), { emissive: 0.6 });
      h = 1.8;
      break;
    }
    case 'kitchen': {
      platform(g, size, '#e8d0a8', '#8a6a4a', 0.12);
      g.add(new THREE.BoxGeometry(1.1, 0.75, 0.95), '#ffe3b8', mat([0, 0.5, -0.1]));
      g.add(new THREE.ConeGeometry(0.95, 0.6, 4), '#ff7a5a', mat([0, 1.17, -0.1], [0, Math.PI / 4, 0]));
      g.add(new THREE.BoxGeometry(0.18, 0.5, 0.18), '#a07050', mat([0.3, 1.4, -0.25]));
      g.add(new THREE.CylinderGeometry(0.22, 0.17, 0.25, 10), '#4a4a5a', mat([0.5, 0.3, 0.6]));
      g.add(new THREE.BoxGeometry(0.3, 0.42, 0.04), '#8a5a36', mat([0, 0.35, 0.38]));
      h = 1.6;
      break;
    }
    case 'storage': {
      platform(g, size, '#e8e0f0', '#7a6a9a', 0.12);
      g.add(new THREE.BoxGeometry(1.2, 0.9, 1.0), '#b8a8e0', mat([0, 0.57, 0]));
      g.add(new THREE.CylinderGeometry(0.62, 0.62, 1.2, 12, 1, false, 0, Math.PI), '#8a7ab8', mat([0, 1.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.84]));
      g.add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 16), '#ffcf4d', mat([0, 0.6, 0.52], [Math.PI / 2, 0, 0]), { emissive: 0.4 });
      for (let i = 0; i < level; i++) g.add(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), '#ffcf4d', mat([0.75, 0.15 + i * 0.06, 0.6]), { emissive: 0.3 });
      h = 1.8;
      break;
    }
    case 'energy': {
      platform(g, size, '#d8d8e8', '#5a5a7a', 0.12);
      g.add(new THREE.CylinderGeometry(0.55, 0.6, 0.45, 10), '#8c8fa8', mat([0, 0.35, 0]));
      g.add(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 12), '#5cf2ff', mat([0, 0.58, 0]), { emissive: 0.6 });
      g.add(new THREE.OctahedronGeometry(0.28 + level * 0.03), '#fff35a', mat([0, 1.15, 0], [0, 0, 0], [0.7, 1.4, 0.7]), { emissive: 1 });
      h = 1.6;
      break;
    }
    case 'essence': {
      platform(g, size, '#2b1f5c', '#151838');
      g.add(new THREE.CylinderGeometry(0.35, 0.6, 0.8, 8), '#3d2f7a', mat([0, 0.6, 0]));
      g.add(new THREE.SphereGeometry(0.45, 14, 12), '#8a5cff', mat([0, 1.35, 0]), { emissive: 1 });
      for (let i = 0; i < 3; i++) g.add(new THREE.TorusGeometry(0.7 + i * 0.12, 0.035, 5, 28), i % 2 ? '#5cf2ff' : '#b98cff', mat([0, 1.35, 0], [1 + i * 0.5, i, 0]), { emissive: 1 });
      h = 2.2;
      break;
    }
    case 'arena': {
      g.add(new THREE.CylinderGeometry(1.4, 1.5, 0.25, 24), '#d9b98a', mat([0, 0.12, 0]));
      g.add(new THREE.CylinderGeometry(1.05, 1.05, 0.03, 24), '#f3d28a', mat([0, 0.26, 0]));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (i === 3) continue;
        g.add(new THREE.BoxGeometry(0.28, 0.9, 0.22), '#fff4e6', mat([Math.cos(a) * 1.25, 0.65, Math.sin(a) * 1.25], [0, -a, 0]));
      }
      g.add(new THREE.TorusGeometry(1.25, 0.1, 6, 24), '#ff6a8a', mat([0, 1.12, 0], [Math.PI / 2, 0, 0]));
      for (const [x, z, c] of [[1.2, -0.6, '#ffd36b'], [-1.2, -0.6, '#5cf2ff']] as [number, number, string][]) {
        g.add(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), '#6a4a2a', mat([x, 1.3, z]));
        g.add(new THREE.BoxGeometry(0.04, 0.26, 0.4), c, mat([x, 1.75, z + 0.2]), { emissive: 0.3 });
      }
      h = 1.9;
      break;
    }
    case 'monument': {
      g.add(new THREE.BoxGeometry(1.2, 0.3, 1.2), '#c9c0d8', mat([0, 0.15, 0]));
      if (defId === 'monument_etoile') {
        g.add(new THREE.CylinderGeometry(0.15, 0.4, 2.2 + level * 0.2, 4), '#4b5cff', mat([0, 1.4, 0]));
        g.add(new THREE.OctahedronGeometry(0.3), '#fff4b0', mat([0, 2.8 + level * 0.2, 0]), { emissive: 1 });
        h = 3.2;
      } else {
        g.add(new THREE.BoxGeometry(0.7, 1.2 + level * 0.15, 0.5), '#a89a80', mat([0, 0.9, 0]));
        g.add(new THREE.SphereGeometry(0.35, 10, 8), '#5cf2ff', mat([0, 1.7 + level * 0.15, 0]), { emissive: 0.7 });
        h = 2.2;
      }
      break;
    }
    case 'deco':
    default:
      h = deco(g, defId);
  }
  const mesh = new THREE.Mesh(g.build(), toonMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  return { group: root, height: h, spinners };
}

function deco(g: GeoBuilder, id: string): number {
  switch (id) {
    case 'deco_tree':
      g.add(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), '#8a5a36', mat([0, 0.3, 0]));
      g.add(new THREE.SphereGeometry(0.4, 9, 7), '#57c94a', mat([0, 0.85, 0]));
      g.add(new THREE.SphereGeometry(0.28, 8, 6), '#7bdc5a', mat([0.15, 1.12, 0.05]));
      return 1.3;
    case 'deco_sakura':
      g.add(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), '#6a3a2a', mat([0, 0.3, 0]));
      g.add(new THREE.SphereGeometry(0.42, 9, 7), '#ffb3d9', mat([0, 0.85, 0]));
      g.add(new THREE.SphereGeometry(0.28, 8, 6), '#ffd6ec', mat([0.15, 1.12, 0.05]));
      return 1.3;
    case 'deco_flowers':
      for (let i = 0; i < 6; i++) {
        g.add(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 4), '#3fae3a', mat([Math.cos(i) * 0.25, 0.12, Math.sin(i * 1.7) * 0.25]));
        g.add(new THREE.SphereGeometry(0.08, 7, 5), ['#ff6a8a', '#ffe14d', '#ffffff', '#b98cff'][i % 4], mat([Math.cos(i) * 0.25, 0.27, Math.sin(i * 1.7) * 0.25]));
      }
      return 0.4;
    case 'deco_lantern':
      g.add(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 6), '#4a3a2a', mat([0, 0.4, 0]));
      g.add(new THREE.SphereGeometry(0.16, 8, 6), '#ffb347', mat([0, 0.9, 0], [0, 0, 0], [1, 1.2, 1]), { emissive: 1 });
      return 1.1;
    case 'deco_crystal':
      g.add(new THREE.OctahedronGeometry(0.25), '#5cf2ff', mat([0, 0.75, 0], [0, 0, 0], [0.6, 1.5, 0.6]), { emissive: 0.7 });
      g.add(new THREE.CylinderGeometry(0.2, 0.25, 0.12, 8), '#8a7ab8', mat([0, 0.06, 0]));
      return 1.2;
    case 'deco_fountain':
      g.add(new THREE.CylinderGeometry(0.8, 0.85, 0.25, 16), '#e8e0f0', mat([0, 0.12, 0]));
      g.add(new THREE.CylinderGeometry(0.7, 0.7, 0.04, 16), '#5ac8ff', mat([0, 0.25, 0]), { emissive: 0.3 });
      g.add(new THREE.CylinderGeometry(0.1, 0.15, 0.7, 8), '#e8e0f0', mat([0, 0.5, 0]));
      g.add(new THREE.SphereGeometry(0.2, 10, 8), '#8ee6ff', mat([0, 0.95, 0]), { emissive: 0.5 });
      return 1.2;
    case 'deco_statue':
      g.add(new THREE.BoxGeometry(0.5, 0.3, 0.5), '#c9c0d8', mat([0, 0.15, 0]));
      g.add(new THREE.SphereGeometry(0.25, 10, 8), '#ffd36b', mat([0, 0.55, 0]), { emissive: 0.2 });
      g.add(new THREE.SphereGeometry(0.18, 10, 8), '#ffd36b', mat([0, 0.88, 0.05]), { emissive: 0.2 });
      g.add(new THREE.ConeGeometry(0.06, 0.18, 6), '#ffd36b', mat([0.08, 1.06, 0]));
      g.add(new THREE.ConeGeometry(0.06, 0.18, 6), '#ffd36b', mat([-0.08, 1.06, 0]));
      return 1.2;
    case 'deco_flame_torch':
      g.add(new THREE.CylinderGeometry(0.18, 0.1, 0.5, 8), '#5a3328', mat([0, 0.25, 0]));
      g.add(new THREE.ConeGeometry(0.16, 0.4, 7), '#ff7a1c', mat([0, 0.7, 0]), { emissive: 1 });
      return 1;
    case 'deco_snowman':
      g.add(new THREE.SphereGeometry(0.3, 10, 8), '#ffffff', mat([0, 0.3, 0]));
      g.add(new THREE.SphereGeometry(0.2, 10, 8), '#ffffff', mat([0, 0.72, 0]));
      g.add(new THREE.ConeGeometry(0.04, 0.16, 6), '#ff8a2b', mat([0, 0.72, 0.22], [Math.PI / 2, 0, 0]));
      return 1;
    case 'deco_star_lamp':
      g.add(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 6), '#2b2f6b', mat([0, 0.4, 0]));
      g.add(new THREE.OctahedronGeometry(0.2), '#fff4b0', mat([0, 0.95, 0]), { emissive: 1 });
      return 1.2;
    case 'deco_pumpkin':
      g.add(new THREE.SphereGeometry(0.32, 12, 8), '#ff8a1c', mat([0, 0.26, 0], [0, 0, 0], [1, 0.8, 1]), { emissive: 0.15 });
      g.add(new THREE.CylinderGeometry(0.04, 0.05, 0.15, 5), '#3f7a2a', mat([0, 0.55, 0]));
      g.add(new THREE.SphereGeometry(0.06, 6, 4), '#ffe14d', mat([0.1, 0.3, 0.28]), { emissive: 1 });
      g.add(new THREE.SphereGeometry(0.06, 6, 4), '#ffe14d', mat([-0.1, 0.3, 0.28]), { emissive: 1 });
      return 0.7;
    case 'deco_eclipse':
      g.add(new THREE.BoxGeometry(0.5, 0.5, 0.5), '#2a1f3a', mat([0, 0.25, 0]));
      g.add(new THREE.TorusGeometry(0.28, 0.05, 6, 20), '#ffd36b', mat([0, 0.85, 0]), { emissive: 0.8 });
      g.add(new THREE.SphereGeometry(0.22, 10, 8), '#1a0f33', mat([0, 0.85, 0.02]));
      return 1.2;
    case 'deco_pass_banner':
      g.add(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 5), '#6a4a2a', mat([0, 0.65, 0]));
      g.add(new THREE.BoxGeometry(0.04, 0.4, 0.55), '#ff4fa3', mat([0, 1.1, 0.28]), { emissive: 0.3 });
      return 1.4;
    default:
      g.add(new THREE.SphereGeometry(0.3, 8, 6), '#ffffff', mat([0, 0.3, 0]));
      return 0.6;
  }
}

/** Petites cultures sur une ferme (taille selon la croissance). */
export function buildCropMesh(cropId: string, progress: number): THREE.Mesh {
  const g = new GeoBuilder();
  const colors: Record<string, [string, string]> = {
    ble_xala: ['#e8c45a', '#c9a03a'], baie_ondine: ['#ff4f6a', '#3fae3a'], carotte_zap: ['#ff8a2b', '#3fae3a'],
    piment_braise: ['#ff3a1c', '#3fae3a'], champi_nuit: ['#9a5cff', '#ffffff'], lys_solaire: ['#ffe14d', '#3fae3a'],
  };
  const [c1, c2] = colors[cropId] ?? ['#7bdc5a', '#3fae3a'];
  const s = 0.3 + Math.min(1, progress) * 0.7;
  const ready = progress >= 1;
  for (let row = 0; row < 4; row++) for (let i = 0; i < 4; i++) {
    const x = -0.6 + i * 0.4, z = -0.6 + row * 0.4;
    g.add(new THREE.ConeGeometry(0.07, 0.28 * s, 4), c2, mat([x, 0.3 + 0.14 * s, z]));
    if (progress > 0.5) g.add(new THREE.SphereGeometry(0.08 * s, 6, 4), c1, mat([x, 0.3 + 0.3 * s, z]), { emissive: ready ? 0.35 : 0 });
  }
  return new THREE.Mesh(g.build(), toonMaterial());
}
