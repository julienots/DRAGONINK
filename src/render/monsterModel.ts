import * as THREE from 'three';
import { GeoBuilder, mat, toonMaterial, softCircleTexture } from './geo';
import { SPECIES, STAGE_SCALE, type Appearance } from '../data/species';
import { RARITIES, rarityIndex } from '../data/elements';
import { SKIN } from '../data/progression';
import { hashString, seededRng } from '../core/util';

// Générateur procédural des Xalamons : chaque espèce est décrite par un
// "plan corporel" et des attributs (cornes, ailes, queue...). Le stade
// d'évolution change réellement la silhouette (tête, ailes, cornes, aura).

export interface MonsterRig {
  group: THREE.Group;
  root: THREE.Group;
  body: THREE.Mesh;
  outline?: THREE.Mesh;
  wings: THREE.Mesh[];
  orbs?: THREE.Group;
  aura?: THREE.Points;
  height: number;
  floating: boolean;
  phase: number;
  flashUntil: number;
  baseMaterial: THREE.Material;
}

const DETAIL = { seg: 14, rings: 10 };
export function setModelDetail(level: 'low' | 'medium' | 'high' | 'ultra'): void {
  DETAIL.seg = level === 'low' ? 9 : level === 'medium' ? 12 : level === 'high' ? 14 : 18;
  DETAIL.rings = level === 'low' ? 7 : level === 'medium' ? 9 : level === 'high' ? 10 : 13;
}

const sphere = (r = 1) => new THREE.SphereGeometry(r, DETAIL.seg, DETAIL.rings);
const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);
const cyl = (r1: number, r2: number, h: number, seg = 8) => new THREE.CylinderGeometry(r1, r2, h, seg);

interface Frame {
  head: THREE.Vector3;
  headR: number;
  tail: THREE.Vector3;
  back: THREE.Vector3;
  shoulder: THREE.Vector3;
  shoulderW: number;
  height: number;
  floating: boolean;
}

function tint(c: string, skin?: string, k = 0.55): string {
  if (!skin) return c;
  return '#' + new THREE.Color(c).lerp(new THREE.Color(skin), k).getHexString();
}

let outlineMat: THREE.ShaderMaterial | null = null;
export function outlineShader(): THREE.ShaderMaterial {
  if (outlineMat) return outlineMat;
  outlineMat = new THREE.ShaderMaterial({
    uniforms: { thickness: { value: 0.022 }, color: { value: new THREE.Color('#2b1c3d') } },
    vertexShader: 'uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
    fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color,1.0); }',
    side: THREE.BackSide,
  });
  return outlineMat;
}

const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

export function buildMonster(look: Appearance, stage: number, opts: { skin?: string; rarity?: string; outline?: boolean; seed?: string; boss?: boolean } = {}): MonsterRig {
  const skin = opts.skin ? SKIN[opts.skin]?.tint : undefined;
  const P = tint(look.primary, skin), S = tint(look.secondary, skin, 0.35), A = look.accent;
  const g = new GeoBuilder();
  const ch = look.chubby ?? 1;
  const hs = [1.3, 1.12, 1, 1][stage];
  const rng = seededRng(hashString((opts.seed ?? '') + look.primary + look.body));
  const glowBoost = stage === 3 ? 0.25 : 0;

  // ——— corps selon le plan ———
  const f: Frame = { head: new THREE.Vector3(), headR: 0.32, tail: new THREE.Vector3(), back: new THREE.Vector3(), shoulder: new THREE.Vector3(), shoulderW: 0.3, height: 1.1, floating: false };
  switch (look.body) {
    case 'quad': {
      g.add(sphere(), P, mat([0, 0.45, 0], [0, 0, 0], [0.42 * ch, 0.36, 0.55]));
      g.add(sphere(), S, mat([0, 0.38, 0.08], [0, 0, 0], [0.34 * ch, 0.27, 0.45]));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(cyl(0.09, 0.1, 0.32), P, mat([sx * 0.22 * ch, 0.15, sz * 0.27]), { shade: 0.9 });
        g.add(sphere(), S, mat([sx * 0.22 * ch, 0.03, sz * 0.27 + 0.04], [0, 0, 0], [0.11, 0.06, 0.13]));
      }
      f.head.set(0, 0.86, 0.42); f.headR = 0.31 * hs; f.tail.set(0, 0.48, -0.52); f.back.set(0, 0.78, -0.1); f.shoulder.set(0, 0.7, 0.1); f.shoulderW = 0.3 * ch; f.height = 1.15;
      g.add(sphere(), S, mat([0, f.head.y - 0.1 * hs, f.head.z + 0.24 * hs], [0, 0, 0], [0.17 * hs, 0.12 * hs, 0.13 * hs]));
      break;
    }
    case 'biped': {
      g.add(sphere(), P, mat([0, 0.48, 0], [0, 0, 0], [0.36 * ch, 0.42, 0.32]));
      g.add(sphere(), S, mat([0, 0.44, 0.12], [0, 0, 0], [0.27 * ch, 0.32, 0.22]));
      for (const sx of [-1, 1]) {
        g.add(cyl(0.1, 0.11, 0.26), P, mat([sx * 0.16, 0.12, 0]), { shade: 0.9 });
        g.add(sphere(), S, mat([sx * 0.16, 0.02, 0.05], [0, 0, 0], [0.12, 0.06, 0.15]));
        g.add(sphere(), P, mat([sx * 0.36 * ch, 0.56, 0.08], [0, 0, sx * 0.5], [0.09, 0.18, 0.09]));
      }
      f.head.set(0, 1.0, 0.05); f.headR = 0.34 * hs; f.tail.set(0, 0.32, -0.3); f.back.set(0, 0.75, -0.25); f.shoulder.set(0, 0.72, -0.15); f.shoulderW = 0.25; f.height = 1.35;
      break;
    }
    case 'blob': {
      g.add(sphere(), P, mat([0, 0.42, 0], [0, 0, 0], [0.5 * ch, 0.42, 0.48 * ch]));
      g.add(sphere(), S, mat([0, 0.34, 0.2], [0, 0, 0], [0.36 * ch, 0.26, 0.3]));
      for (const sx of [-1, 1]) g.add(sphere(), S, mat([sx * 0.22, 0.04, 0.12], [0, 0, 0], [0.14, 0.07, 0.17]));
      f.headR = 0.4 * hs;
      {
        // les yeux doivent affleurer la surface du corps
        const ey = 0.52 + f.headR * 0.12;
        const dz = 0.48 * ch * Math.sqrt(Math.max(0, 1 - ((ey - 0.42) / 0.42) ** 2));
        f.head.set(0, 0.52, dz - f.headR * 0.8 + 0.03);
      } f.tail.set(0, 0.3, -0.45); f.back.set(0, 0.82, -0.05); f.shoulder.set(0, 0.6, -0.1); f.shoulderW = 0.4 * ch; f.height = 0.95;
      break;
    }
    case 'serpent': {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const r = 0.24 - t * 0.12;
        const z = 0.25 - t * 1.05;
        const y = 0.3 + Math.sin(t * Math.PI * 1.6) * 0.12;
        g.add(sphere(), i % 2 ? P : tint(P, '#ffffff', 0.08), mat([Math.sin(t * 5) * 0.12, y, z], [0, 0, 0], [r, r * 0.95, r * 1.2]));
        g.add(sphere(), S, mat([Math.sin(t * 5) * 0.12, y - r * 0.35, z + 0.02], [0, 0, 0], [r * 0.8, r * 0.6, r * 1.1]));
      }
      f.head.set(0, 0.68, 0.45); f.headR = 0.3 * hs; f.tail.set(0.1, 0.28, -0.85); f.back.set(0, 0.5, 0.0); f.shoulder.set(0, 0.55, 0.15); f.shoulderW = 0.2; f.height = 1.0;
      g.add(cyl(0.2, 0.24, 0.35), P, mat([0, 0.48, 0.32], [-0.6, 0, 0]));
      break;
    }
    case 'bird': {
      g.add(sphere(), P, mat([0, 0.52, 0], [0, 0, 0], [0.36 * ch, 0.36, 0.4]));
      g.add(sphere(), S, mat([0, 0.46, 0.14], [0, 0, 0], [0.28 * ch, 0.28, 0.28]));
      for (const sx of [-1, 1]) {
        g.add(cyl(0.025, 0.03, 0.25), A, mat([sx * 0.12, 0.13, 0]));
        g.add(cone(0.07, 0.12, 6), A, mat([sx * 0.12, 0.02, 0.05], [Math.PI / 2, 0, 0]));
      }
      f.head.set(0, 0.95, 0.12); f.headR = 0.28 * hs; f.tail.set(0, 0.5, -0.42); f.back.set(0, 0.8, -0.1); f.shoulder.set(0, 0.68, -0.02); f.shoulderW = 0.32 * ch; f.height = 1.2;
      g.add(cone(0.08 * hs, 0.2 * hs, 8), '#ffb347', mat([0, f.head.y - 0.04, f.head.z + f.headR * 0.95], [Math.PI / 2, 0, 0]));
      break;
    }
    case 'fish': {
      g.add(sphere(), P, mat([0, 0.55, 0], [0, 0, 0], [0.34 * ch, 0.36, 0.55]));
      g.add(sphere(), S, mat([0, 0.46, 0.08], [0, 0, 0], [0.26 * ch, 0.24, 0.46]));
      for (const sx of [-1, 1]) g.add(cone(0.12, 0.3, 4), S, mat([sx * 0.36, 0.48, 0.05], [0, 0, sx * -1.9], [1, 1, 0.3]));
      f.head.set(0, 0.68, 0.3); f.headR = 0.3 * hs; f.tail.set(0, 0.56, -0.55); f.back.set(0, 0.92, -0.05); f.shoulder.set(0, 0.72, 0.0); f.shoulderW = 0.3; f.height = 1.0; f.floating = true;
      break;
    }
    case 'golem': {
      const chunky = new THREE.SphereGeometry(1, 7, 5);
      g.add(chunky, P, mat([0, 0.58, 0], [0, 0.4, 0], [0.55 * ch, 0.5, 0.46]), { shade: 1 });
      g.add(new THREE.SphereGeometry(1, 7, 5), S, mat([0, 0.5, 0.18], [0, 0.2, 0], [0.4 * ch, 0.36, 0.3]));
      for (const sx of [-1, 1]) {
        g.add(new THREE.SphereGeometry(1, 6, 5), P, mat([sx * 0.62 * ch, 0.5, 0.1], [0, 0, sx * 0.25], [0.22, 0.36, 0.22]), { shade: 0.92 });
        g.add(new THREE.SphereGeometry(1, 6, 4), S, mat([sx * 0.66 * ch, 0.18, 0.14], [0, 0, 0], [0.2, 0.14, 0.2]));
        g.add(cyl(0.14, 0.16, 0.22, 7), P, mat([sx * 0.22, 0.1, 0]), { shade: 0.85 });
      }
      f.head.set(0, 1.1, 0.16); f.headR = 0.26 * hs; f.tail.set(0, 0.3, -0.4); f.back.set(0, 0.98, -0.18); f.shoulder.set(0, 0.88, -0.1); f.shoulderW = 0.45; f.height = 1.35;
      break;
    }
    case 'sprite':
    default: {
      g.add(sphere(), P, mat([0, 0.52, 0], [0, 0, 0], [0.25 * ch, 0.28, 0.22]));
      g.add(sphere(), S, mat([0, 0.5, 0.08], [0, 0, 0], [0.18, 0.2, 0.15]));
      for (const sx of [-1, 1]) {
        g.add(sphere(), P, mat([sx * 0.22, 0.52, 0.04], [0, 0, sx * 0.7], [0.06, 0.14, 0.06]));
        g.add(sphere(), S, mat([sx * 0.1, 0.25, 0.02], [0, 0, 0], [0.08, 0.1, 0.08]));
      }
      f.head.set(0, 0.98, 0.02); f.headR = 0.37 * hs; f.tail.set(0, 0.42, -0.22); f.back.set(0, 0.65, -0.18); f.shoulder.set(0, 0.62, -0.12); f.shoulderW = 0.2; f.height = 1.3; f.floating = true;
      break;
    }
  }

  // bébé : tête plus grosse et plus basse proportionnellement
  if (stage === 0 && look.body !== 'blob') f.head.y -= 0.06;
  const H = f.head, r = f.headR;

  // ——— tête ———
  if (look.body !== 'blob') g.add(sphere(), P, mat([H.x, H.y, H.z], [0, 0, 0], [r * 1.05, r, r]));

  // ——— yeux ———
  const eyeZ = H.z + r * 0.8;
  const eyeY = H.y + r * 0.12;
  const eyeSpread = r * 0.42;
  const eyeR = r * (stage === 0 ? 0.33 : 0.28);
  const pupilColor = look.eyes === 'star' ? A : '#1d1430';
  const eyePos: [number, number][] = look.eyes === 'cyclops' ? [[0, 1.45]] : [[-1, 1], [1, 1]];
  for (const [sx, k] of eyePos) {
    const er = eyeR * k;
    const ex = H.x + sx * eyeSpread;
    const sy = look.eyes === 'sleepy' ? 0.5 : 1;
    g.add(sphere(), '#ffffff', mat([ex, eyeY, eyeZ], [0, 0, 0], [er, er * sy * 1.05, er * 0.55]));
    g.add(sphere(), pupilColor, mat([ex + sx * er * 0.05, eyeY - er * 0.08 * sy, eyeZ + er * 0.38], [0, 0, 0], [er * 0.62, er * 0.7 * sy, er * 0.3]), { emissive: look.eyes === 'star' ? 0.6 : 0 });
    g.add(sphere(), '#ffffff', mat([ex + er * 0.25, eyeY + er * 0.3 * sy, eyeZ + er * 0.55], [0, 0, 0], er * 0.18), { emissive: 1 });
    if (look.eyes === 'fierce') g.add(new THREE.BoxGeometry(er * 1.6, er * 0.32, er * 0.4), A, mat([ex, eyeY + er * 1.05, eyeZ + er * 0.1], [0, 0, sx * -0.45]));
    if (look.eyes === 'sleepy') g.add(sphere(), P, mat([ex, eyeY + er * 0.35, eyeZ + er * 0.05], [0, 0, 0], [er * 1.08, er * 0.55, er * 0.62]));
  }
  // joues roses + bouche
  for (const sx of [-1, 1]) g.add(sphere(), '#ff9ab8', mat([H.x + sx * r * 0.66, H.y - r * 0.22, H.z + r * 0.72], [0, 0, 0], [r * 0.15, r * 0.09, r * 0.06]), { emissive: 0.15 });
  g.add(sphere(), '#3a1d2e', mat([H.x, H.y - r * 0.34, H.z + r * 0.9], [0, 0, 0], [r * 0.12, r * 0.06, r * 0.05]));
  if (look.extras?.includes('thirdEye')) {
    g.add(sphere(), '#ffffff', mat([H.x, H.y + r * 0.62, H.z + r * 0.72], [0, 0, 0], [r * 0.14, r * 0.17, r * 0.08]));
    g.add(sphere(), A, mat([H.x, H.y + r * 0.62, H.z + r * 0.79], [0, 0, 0], [r * 0.08, r * 0.1, r * 0.04]), { emissive: 0.8 });
  }

  // ——— oreilles ———
  const earSize = stage === 0 ? 1.15 : 1;
  for (const sx of [-1, 1]) {
    const ex = H.x + sx * r * 0.62, ey = H.y + r * 0.72, ez = H.z - r * 0.05;
    switch (look.ears) {
      case 'cat': g.add(cone(r * 0.28 * earSize, r * 0.55 * earSize, 6), P, mat([ex, ey, ez], [0, 0, sx * -0.35])); g.add(cone(r * 0.16, r * 0.32, 6), S, mat([ex, ey - r * 0.02, ez + r * 0.08], [0, 0, sx * -0.35])); break;
      case 'long': g.add(sphere(), P, mat([ex * 0.8, ey + r * 0.35, ez], [0, 0, sx * -0.25], [r * 0.16, r * 0.62 * earSize, r * 0.1])); g.add(sphere(), S, mat([ex * 0.8, ey + r * 0.35, ez + r * 0.04], [0, 0, sx * -0.25], [r * 0.09, r * 0.48, r * 0.07])); break;
      case 'fin': g.add(cone(r * 0.25, r * 0.6, 4), S, mat([H.x + sx * r * 0.95, H.y + r * 0.1, H.z - r * 0.1], [0, 0, sx * -1.3], [1, 1, 0.35])); break;
      case 'leaf': g.add(sphere(), S, mat([ex, ey + r * 0.1, ez], [0.2, 0, sx * -0.6], [r * 0.22, r * 0.5 * earSize, r * 0.07])); break;
      case 'round': g.add(sphere(), P, mat([ex, ey - r * 0.05, ez], [0, 0, 0], [r * 0.24, r * 0.24, r * 0.12])); g.add(sphere(), S, mat([ex, ey - r * 0.05, ez + r * 0.05], [0, 0, 0], [r * 0.14, r * 0.14, r * 0.08])); break;
      default: break;
    }
  }

  // ——— cornes ———
  const nh = (look.horns ?? 0) + (stage === 3 && (look.horns ?? 0) > 0 ? 1 : 0);
  const hornK = [0.45, 0.75, 1, 1.25][stage];
  for (let i = 0; i < nh; i++) {
    const t = nh === 1 ? 0 : (i / (nh - 1)) * 2 - 1;
    g.add(cone(r * 0.12, r * 0.6 * hornK, 7), A, mat([H.x + t * r * 0.45, H.y + r * 0.85, H.z - r * 0.15 - Math.abs(t) * r * 0.1], [-0.35, 0, -t * 0.45]), { emissive: glowBoost });
  }

  // ——— crête ———
  const crestK = [0.6, 0.85, 1, 1.3][stage];
  const crestGlow = (look.crest === 'flame' || look.crest === 'crystal' ? 0.35 : 0) + glowBoost;
  for (let i = 0; i < 3; i++) {
    const p = new THREE.Vector3().lerpVectors(new THREE.Vector3(H.x, H.y + r * 0.9, H.z - r * 0.2), f.back, i / 2.4);
    const sz = (1 - i * 0.2) * crestK;
    switch (look.crest) {
      case 'flame': g.add(cone(r * 0.2 * sz, r * 0.6 * sz, 6), i === 0 ? A : S, mat([p.x, p.y + r * 0.1, p.z], [-0.4, 0, 0]), { emissive: crestGlow }); break;
      case 'leaf': g.add(sphere(), S, mat([p.x, p.y + r * 0.12, p.z], [-0.5, 0, 0], [r * 0.08, r * 0.3 * sz, r * 0.2 * sz])); break;
      case 'crystal': g.add(new THREE.OctahedronGeometry(r * 0.22 * sz), S, mat([p.x, p.y + r * 0.15, p.z], [0, i, 0], [0.7, 1.6, 0.7]), { emissive: crestGlow }); break;
      case 'spikes': g.add(cone(r * 0.12 * sz, r * 0.4 * sz, 5), A, mat([p.x, p.y + r * 0.08, p.z], [-0.5, 0, 0])); break;
      case 'cloud': if (i < 2) g.add(sphere(), '#ffffff', mat([p.x + (i - 0.5) * r * 0.3, p.y + r * 0.08, p.z], [0, 0, 0], r * 0.24 * sz)); break;
      default: break;
    }
  }
  if (look.crest === 'mane') {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      g.add(sphere(), S, mat([H.x + Math.cos(a) * r * 0.95, H.y + Math.sin(a) * r * 0.85, H.z - r * 0.35], [0, 0, 0], r * 0.3 * crestK), { emissive: glowBoost });
    }
  }

  // ——— queue ———
  const T = f.tail;
  const tailK = [0.6, 0.8, 1, 1.2][stage];
  switch (look.tail) {
    case 'flame':
      g.add(cone(0.08, 0.35 * tailK, 7), P, mat([T.x, T.y + 0.05, T.z - 0.1], [-2.2, 0, 0]));
      g.add(sphere(), A === '#7a2a10' ? '#ffcf4d' : S, mat([T.x, T.y + 0.22 * tailK, T.z - 0.28 * tailK], [0, 0, 0], [0.11 * tailK, 0.16 * tailK, 0.11 * tailK]), { emissive: 0.6 });
      g.add(cone(0.09 * tailK, 0.25 * tailK, 6), '#ffcf4d', mat([T.x, T.y + 0.36 * tailK, T.z - 0.3 * tailK]), { emissive: 0.8 });
      break;
    case 'leaf':
      g.add(cyl(0.04, 0.06, 0.3 * tailK, 6), P, mat([T.x, T.y, T.z - 0.1], [-1.9, 0, 0]));
      g.add(sphere(), S, mat([T.x, T.y + 0.08, T.z - 0.32 * tailK], [-0.6, 0, 0], [0.04, 0.12 * tailK, 0.2 * tailK]));
      break;
    case 'fin':
      g.add(cone(0.18 * tailK, 0.32 * tailK, 4), S, mat([T.x, T.y, T.z - 0.12], [-Math.PI / 2, 0, 0], [1, 1, 0.25]));
      break;
    case 'spike':
      for (let i = 0; i < 3; i++) g.add(cone(0.1 - i * 0.02, 0.22, 6), i === 2 ? A : P, mat([T.x, T.y - i * 0.04, T.z - i * 0.16 * tailK], [-1.9, 0, 0]));
      break;
    case 'bolt':
      for (let i = 0; i < 3; i++) g.add(new THREE.BoxGeometry(0.06, 0.06, 0.18 * tailK), i % 2 ? '#fff35a' : P, mat([T.x + (i % 2 ? 0.07 : -0.07), T.y + i * 0.08, T.z - i * 0.12 * tailK], [0.4, i % 2 ? 0.6 : -0.6, 0]), { emissive: i === 2 ? 0.7 : 0.2 });
      break;
    case 'puff':
      g.add(sphere(), S, mat([T.x, T.y + 0.05, T.z - 0.05], [0, 0, 0], 0.15 * tailK));
      break;
    case 'star':
      g.add(cyl(0.025, 0.04, 0.35 * tailK, 6), P, mat([T.x, T.y + 0.1, T.z - 0.12], [-2.4, 0, 0]));
      g.add(new THREE.OctahedronGeometry(0.1 * tailK), '#fff4b0', mat([T.x, T.y + 0.26 * tailK, T.z - 0.3 * tailK]), { emissive: 0.9 });
      break;
    case 'long':
      for (let i = 0; i < 4; i++) g.add(sphere(), P, mat([T.x + Math.sin(i) * 0.05, T.y - i * 0.05, T.z - i * 0.13 * tailK], [0, 0, 0], 0.09 - i * 0.015));
      break;
    default: break;
  }

  // ——— extras ———
  const ex = look.extras ?? [];
  if (ex.includes('spots')) for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    g.add(sphere(), S, mat([Math.cos(a) * f.shoulderW * 0.85, f.back.y - 0.18 + rng() * 0.1, f.back.z + Math.sin(a) * 0.2], [0, 0, 0], [0.07, 0.04, 0.07]));
  }
  if (ex.includes('stripes')) for (let i = 0; i < 3; i++) g.add(new THREE.TorusGeometry(f.shoulderW * 0.82, 0.025, 5, 16, Math.PI), A, mat([0, f.back.y - 0.15, f.back.z + 0.1 - i * 0.14], [0, Math.PI / 2, 0], [1, 1.05, 1]));
  if (ex.includes('antenna')) for (const sx of [-1, 1]) {
    g.add(cyl(0.012, 0.012, r * 0.7, 5), A, mat([H.x + sx * r * 0.3, H.y + r * 1.1, H.z], [0, 0, sx * -0.3]));
    g.add(sphere(), '#fff35a', mat([H.x + sx * r * 0.42, H.y + r * 1.45, H.z], [0, 0, 0], r * 0.1), { emissive: 0.9 });
  }
  if (ex.includes('crystals')) for (let i = 0; i < 3; i++) g.add(new THREE.OctahedronGeometry(0.1 + i * 0.02), A === '#4e3a26' ? '#9fe9ff' : S, mat([(i - 1) * 0.16, f.back.y + 0.05, f.back.z - 0.1 * i], [0, i, (i - 1) * 0.3], [0.7, 1.7, 0.7]), { emissive: 0.45 + glowBoost });
  if (ex.includes('shell')) g.add(cone(f.shoulderW * 0.9, 0.3, 9), S, mat([0, f.back.y + 0.05, f.back.z - 0.05], [-0.3, 0, 0]));
  if (ex.includes('moss')) for (let i = 0; i < 4; i++) g.add(sphere(), '#6fcf4a', mat([(rng() - 0.5) * 0.4, f.back.y + 0.03, f.back.z + (rng() - 0.5) * 0.3], [0, 0, 0], [0.12, 0.06, 0.12]));
  if (ex.includes('halo') || stage === 3) g.add(new THREE.TorusGeometry(r * 0.75, r * 0.07, 6, 20), '#ffe680', mat([H.x, H.y + r * 1.45, H.z - r * 0.1], [Math.PI / 2 - 0.2, 0, 0]), { emissive: 1 });
  if (ex.includes('rings')) g.add(new THREE.TorusGeometry(f.shoulderW * 1.6, 0.03, 5, 28), '#ffd36b', mat([0, f.shoulder.y - 0.1, 0], [Math.PI / 2 + 0.35, 0.2, 0]), { emissive: 0.7 });

  const bodyGeo = g.build();
  const material = toonMaterial();
  const body = new THREE.Mesh(bodyGeo, material);
  body.castShadow = true;

  const root = new THREE.Group();
  root.add(body);
  let outline: THREE.Mesh | undefined;
  if (opts.outline) {
    outline = new THREE.Mesh(bodyGeo, outlineShader());
    root.add(outline);
  }

  // ——— ailes (maillages séparés pour l'animation) ———
  const wings: THREE.Mesh[] = [];
  if (look.wings && look.wings !== 'none') {
    const wk = [0.35, 0.65, 1, 1.25][stage];
    for (const sx of [-1, 1]) {
      const wg = wingGeometry(look.wings, sx, look, wk);
      const w = new THREE.Mesh(wg, wingMaterial());
      w.position.set(sx * f.shoulderW * 0.75, f.shoulder.y, f.shoulder.z - 0.05);
      w.userData.side = sx;
      root.add(w);
      wings.push(w);
    }
    if (stage >= 1 && look.wings !== 'fin') f.floating = f.floating || look.body === 'bird' || look.body === 'sprite';
  }

  // ——— orbes en orbite ———
  let orbs: THREE.Group | undefined;
  if (ex.includes('orbs')) {
    orbs = new THREE.Group();
    const og = new GeoBuilder();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      og.add(sphere(), i === 0 ? A : S, mat([Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55], [0, 0, 0], 0.07), { emissive: 0.9 });
    }
    orbs.add(new THREE.Mesh(og.build(), toonMaterial()));
    orbs.position.set(0, f.shoulder.y + 0.15, 0);
    root.add(orbs);
  }

  // ——— aura (rareté élevée ou stade supérieur) ———
  let aura: THREE.Points | undefined;
  const rIdx = opts.rarity ? rarityIndex(opts.rarity as never) : 0;
  if (ex.includes('aura') || stage === 3 || rIdx >= 4 || opts.boss) {
    const n = opts.boss ? 60 : 26;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const rr = 0.45 + rng() * 0.35;
      pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = rng() * f.height; pos[i * 3 + 2] = Math.sin(a) * rr;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glow = opts.rarity ? RARITIES[opts.rarity as keyof typeof RARITIES]?.glow ?? S : S;
    aura = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(stage === 3 ? '#ffe680' : glow), size: 0.12, map: softCircleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    root.add(aura);
  }

  const group = new THREE.Group();
  group.add(root);
  const sc = STAGE_SCALE[stage] * (opts.boss ? 2.6 : 1);
  root.scale.setScalar(sc);
  return { group, root, body, outline, wings, orbs, aura, height: f.height * sc, floating: f.floating, phase: rng() * 10, flashUntil: 0, baseMaterial: material };
}

let wingMat: THREE.Material | null = null;
function wingMaterial(): THREE.Material {
  if (wingMat) return wingMat;
  const m = toonMaterial().clone() as THREE.MeshToonMaterial;
  m.side = THREE.DoubleSide;
  m.onBeforeCompile = toonMaterial().onBeforeCompile;
  m.customProgramCacheKey = () => 'xala-toon-glow-ds';
  wingMat = m;
  return m;
}

function wingGeometry(kind: string, sx: number, look: Appearance, k: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const W = 0.62 * k, Hh = 0.5 * k;
  switch (kind) {
    case 'bat':
      shape.moveTo(0, 0); shape.lineTo(W * 0.4, Hh); shape.lineTo(W, Hh * 0.8); shape.lineTo(W * 0.85, Hh * 0.2);
      shape.lineTo(W * 0.62, Hh * 0.35); shape.lineTo(W * 0.5, -Hh * 0.05); shape.lineTo(W * 0.3, Hh * 0.15); shape.lineTo(0, -Hh * 0.1);
      break;
    case 'feather':
    case 'leaf':
      shape.moveTo(0, 0); shape.quadraticCurveTo(W * 0.5, Hh * 1.2, W, Hh * 0.55); shape.quadraticCurveTo(W * 0.6, -Hh * 0.1, 0, -Hh * 0.08);
      break;
    case 'crystal':
      shape.moveTo(0, 0); shape.lineTo(W * 0.35, Hh * 1.1); shape.lineTo(W * 0.6, Hh * 0.4); shape.lineTo(W, Hh * 0.9); shape.lineTo(W * 0.7, -Hh * 0.1); shape.lineTo(0, -Hh * 0.1);
      break;
    case 'fin':
      shape.moveTo(0, 0); shape.lineTo(W * 0.7, Hh * 0.7); shape.lineTo(W * 0.45, -Hh * 0.1);
      break;
    case 'energy':
    default:
      shape.moveTo(0, 0); shape.bezierCurveTo(W * 0.3, Hh * 1.3, W * 1.1, Hh * 1.0, W, Hh * 0.3); shape.bezierCurveTo(W * 0.8, Hh * 0.5, W * 0.5, -Hh * 0.2, 0, -Hh * 0.08);
      break;
  }
  const geo = new THREE.ShapeGeometry(shape, 6);
  const g = new GeoBuilder();
  const color = kind === 'leaf' ? look.secondary : kind === 'crystal' ? '#c8f4ff' : kind === 'energy' ? look.secondary : look.primary;
  const glow = kind === 'energy' ? 0.7 : kind === 'crystal' ? 0.4 : 0;
  g.add(geo, color, mat([0, 0, 0], [0.25, sx > 0 ? -0.5 : Math.PI + 0.5, 0], 1), { emissive: glow });
  if (kind === 'feather' || kind === 'bat') {
    const inner = new THREE.ShapeGeometry(shape, 4);
    g.add(inner, look.secondary, mat([0.01 * sx, -0.01, 0.005], [0.25, sx > 0 ? -0.5 : Math.PI + 0.5, 0], 0.72));
  }
  return g.build();
}

export type AnimMode = 'idle' | 'walk' | 'sleep' | 'eat' | 'happy' | 'attack' | 'hit' | 'ko' | 'fly';

export function animateMonster(rig: MonsterRig, t: number, mode: AnimMode = 'idle'): void {
  const p = t + rig.phase;
  const root = rig.root;
  const base = rig.floating ? 0.25 + Math.sin(p * 1.6) * 0.08 : 0;
  root.position.set(0, base, 0);
  root.rotation.set(0, 0, 0);
  let sy = 1 + Math.sin(p * 2.4) * 0.025, sxz = 1 - Math.sin(p * 2.4) * 0.012;
  let wingSpeed = rig.floating ? 9 : 3, wingAmp = rig.floating ? 0.55 : 0.18;
  switch (mode) {
    case 'walk':
      root.position.y = base + Math.abs(Math.sin(p * 9)) * 0.07;
      root.rotation.z = Math.sin(p * 9) * 0.06;
      break;
    case 'sleep':
      sy = 0.86 + Math.sin(p * 1.2) * 0.03; sxz = 1.06;
      root.rotation.z = 0.35;
      root.position.y = rig.floating ? 0.05 : -0.02;
      wingSpeed = 1; wingAmp = 0.05;
      break;
    case 'eat':
      root.rotation.x = Math.max(0, Math.sin(p * 10)) * 0.25;
      break;
    case 'happy':
      root.position.y = base + Math.abs(Math.sin(p * 6)) * 0.3;
      root.rotation.y = Math.sin(p * 3) * 0.3;
      wingSpeed = 14; wingAmp = 0.7;
      break;
    case 'attack':
      root.rotation.x = -0.25;
      wingSpeed = 16; wingAmp = 0.8;
      break;
    case 'hit':
      root.position.x = Math.sin(p * 60) * 0.06;
      root.rotation.z = -0.2;
      break;
    case 'ko':
      root.rotation.z = Math.PI / 2;
      root.position.y = 0.1;
      sy = 1; sxz = 1;
      wingAmp = 0;
      break;
    case 'fly':
      root.position.y = 0.6 + Math.sin(p * 2) * 0.12;
      wingSpeed = 12; wingAmp = 0.75;
      break;
    default: break;
  }
  const sc = root.scale.x;
  root.scale.set(sc, sc, sc);
  rig.body.scale.set(sxz, sy, sxz);
  if (rig.outline) rig.outline.scale.copy(rig.body.scale);
  for (const w of rig.wings) {
    const s = w.userData.side as number;
    w.rotation.z = s * (Math.sin(p * wingSpeed) * wingAmp + 0.15);
    w.rotation.y = s * -0.2;
  }
  if (rig.orbs) rig.orbs.rotation.y = p * 1.6;
  if (rig.aura) {
    rig.aura.rotation.y = p * 0.4;
    (rig.aura.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(p * 3) * 0.3;
  }
  const flashing = performance.now() < rig.flashUntil;
  const want = flashing ? flashMat : rig.baseMaterial;
  if (rig.body.material !== want) rig.body.material = want;
}

export function flashMonster(rig: MonsterRig, ms = 120): void {
  rig.flashUntil = performance.now() + ms;
}

export function disposeRig(rig: MonsterRig): void {
  rig.body.geometry.dispose();
  for (const w of rig.wings) w.geometry.dispose();
  rig.orbs?.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
  rig.aura?.geometry.dispose();
  (rig.aura?.material as THREE.Material | undefined)?.dispose();
}

export function buildMonsterForSpecies(speciesId: string, stage: number, opts: { skin?: string; outline?: boolean } = {}): MonsterRig {
  const sp = SPECIES[speciesId];
  return buildMonster(sp.look, stage, { ...opts, rarity: sp.rarity, seed: speciesId });
}

// ————————————————————————————— Œufs —————————————————————————————

export function buildEgg(speciesId: string, scale = 1): THREE.Group {
  const sp = SPECIES[speciesId];
  const rIdx = rarityIndex(sp.rarity);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 1.0;
    const rr = Math.sin(Math.PI * t) * (0.36 + (1 - t) * 0.08) * (t < 0.5 ? 1 : 1 - (t - 0.5) * 0.25);
    pts.push(new THREE.Vector2(Math.max(0.001, rr), y));
  }
  const g = new GeoBuilder();
  g.add(new THREE.LatheGeometry(pts, DETAIL.seg + 2), sp.look.primary, undefined, { emissive: rIdx >= 5 ? 0.25 : 0 });
  const rng = seededRng(hashString('egg' + speciesId));
  const spots = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < spots; i++) {
    const a = rng() * Math.PI * 2;
    const y = 0.2 + rng() * 0.6;
    const rr = Math.sin(Math.PI * y) * 0.4;
    g.add(sphere(), sp.look.secondary, mat([Math.cos(a) * rr, y, Math.sin(a) * rr], [0, -a, 0], [0.04, 0.08, 0.08 + rng() * 0.04]));
  }
  if (rIdx >= 2) g.add(new THREE.TorusGeometry(0.405, 0.03, 6, 26), RARITIES[sp.rarity].color, mat([0, 0.5, 0], [Math.PI / 2, 0, 0]), { emissive: 0.5 });
  if (sp.elements[1]) g.add(new THREE.TorusGeometry(0.37, 0.025, 6, 26), sp.look.accent, mat([0, 0.68, 0], [Math.PI / 2, 0, 0], [0.92, 0.92, 1]), { emissive: 0.2 });
  const mesh = new THREE.Mesh(g.build(), toonMaterial());
  mesh.castShadow = true;
  const grp = new THREE.Group();
  grp.add(mesh);
  if (rIdx >= 3) {
    const n = 14 + rIdx * 4;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2; pos[i * 3] = Math.cos(a) * 0.55; pos[i * 3 + 1] = rng() * 1.1; pos[i * 3 + 2] = Math.sin(a) * 0.55; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts2 = new THREE.Points(geo, new THREE.PointsMaterial({ color: RARITIES[sp.rarity].glow, size: 0.1, map: softCircleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts2.name = 'sparkle';
    grp.add(pts2);
  }
  grp.scale.setScalar(scale);
  return grp;
}
