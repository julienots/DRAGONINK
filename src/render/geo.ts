import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Construction de géométries fusionnées à couleurs par sommet :
// un modèle complexe = 1 seul draw call.

const tmpColor = new THREE.Color();

export class GeoBuilder {
  parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, opts: { shade?: number; emissive?: number } = {}): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (geo !== g) geo.dispose();
    g.deleteAttribute('uv');
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    tmpColor.set(color);
    if (opts.shade) tmpColor.multiplyScalar(opts.shade);
    for (let i = 0; i < n; i++) { cols[i * 3] = tmpColor.r; cols[i * 3 + 1] = tmpColor.g; cols[i * 3 + 2] = tmpColor.b; }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    // intensité émissive par sommet (lueurs) pour le shader toon
    const em = new Float32Array(n).fill(opts.emissive ?? 0);
    g.setAttribute('glow', new THREE.BufferAttribute(em, 1));
    this.parts.push(g);
    return this;
  }

  /** dégradé vertical de couleur entre deux teintes (sol, falaises) */
  addGradient(geo: THREE.BufferGeometry, top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation, m?: THREE.Matrix4, jitter = 0, seed = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (geo !== g) geo.dispose();
    g.deleteAttribute('uv');
    if (m) g.applyMatrix4(m);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const h = Math.max(0.0001, bb.max.y - bb.min.y);
    const pos = g.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const ct = new THREE.Color(top), cb = new THREE.Color(bottom);
    let r = seed;
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - bb.min.y) / h;
      tmpColor.copy(cb).lerp(ct, t);
      if (jitter) {
        // bruit par face (3 sommets) pour un rendu facetté
        if (i % 3 === 0) r = (r * 16807) % 2147483647;
        const j = 1 + ((r % 1000) / 1000 - 0.5) * jitter;
        tmpColor.multiplyScalar(j);
      }
      cols[i * 3] = tmpColor.r; cols[i * 3 + 1] = tmpColor.g; cols[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.setAttribute('glow', new THREE.BufferAttribute(new Float32Array(pos.count), 1));
    this.parts.push(g);
    return this;
  }

  build(): THREE.BufferGeometry {
    if (!this.parts.length) return new THREE.BufferGeometry();
    const g = mergeGeometries(this.parts, false)!;
    for (const p of this.parts) p.dispose();
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

export function mat(pos: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): THREE.Matrix4 {
  const s = typeof scale === 'number' ? new THREE.Vector3(scale, scale, scale) : new THREE.Vector3(...scale);
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), s);
}

// ————————————————————————— Matériau toon partagé —————————————————————————

let gradientTex: THREE.DataTexture | null = null;
function toonGradient(): THREE.DataTexture {
  if (gradientTex) return gradientTex;
  const data = new Uint8Array([110, 110, 110, 255, 175, 175, 175, 255, 230, 230, 230, 255, 255, 255, 255, 255]);
  gradientTex = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradientTex.minFilter = THREE.NearestFilter;
  gradientTex.magFilter = THREE.NearestFilter;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

const matCache = new Map<string, THREE.Material>();

/** Matériau cartoon à couleurs par sommet, avec lueur par sommet. */
export function toonMaterial(opts: { transparent?: boolean; opacity?: number; flat?: boolean } = {}): THREE.MeshToonMaterial {
  const key = `toon:${opts.transparent ? 1 : 0}:${opts.opacity ?? 1}:${opts.flat ? 1 : 0}`;
  const c = matCache.get(key);
  if (c) return c as THREE.MeshToonMaterial;
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), transparent: !!opts.transparent, opacity: opts.opacity ?? 1 });
  if (opts.flat) (m as unknown as { flatShading: boolean }).flatShading = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow;');
  };
  m.customProgramCacheKey = () => 'xala-toon-glow';
  matCache.set(key, m);
  return m;
}

export function outlineMaterial(): THREE.MeshBasicMaterial {
  const c = matCache.get('outline');
  if (c) return c as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({ color: 0x2a1d3a, side: THREE.BackSide });
  matCache.set('outline', m);
  return m;
}

export function basicMaterial(color: THREE.ColorRepresentation, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  const key = `basic:${new THREE.Color(color).getHexString()}:${JSON.stringify(opts)}`;
  const c = matCache.get(key);
  if (c) return c as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  matCache.set(key, m);
  return m;
}

/** Texture ronde douce pour particules / halos. */
let softTex: THREE.Texture | null = null;
export function softCircleTexture(): THREE.Texture {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

let starTex: THREE.Texture | null = null;
export function starTexture(): THREE.Texture {
  if (starTex) return starTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  g.fillStyle = '#fff';
  g.shadowColor = '#fff';
  g.shadowBlur = 8;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 26 : 9;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  starTex = new THREE.CanvasTexture(c);
  return starTex;
}
