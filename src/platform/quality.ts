// Niveaux graphiques LOW / MEDIUM / HIGH / ULTRA avec détection automatique
// et rétrogradation dynamique si le FPS chute.

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  level: QualityLevel;
  pixelRatio: number;
  antialias: boolean;
  shadows: boolean;
  shadowSize: number;
  outline: boolean;
  particles: number;
  clouds: number;
  birds: number;
  islandDetail: number;
  weather: boolean;
}

export function profileFor(level: QualityLevel): QualityProfile {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  switch (level) {
    case 'low': return { level, pixelRatio: Math.min(dpr, 1) * 0.75, antialias: false, shadows: false, shadowSize: 0, outline: false, particles: 0.3, clouds: 8, birds: 0, islandDetail: 0.5, weather: true };
    case 'medium': return { level, pixelRatio: Math.min(dpr, 1.25), antialias: false, shadows: false, shadowSize: 0, outline: false, particles: 0.6, clouds: 14, birds: 4, islandDetail: 1, weather: true };
    case 'high': return { level, pixelRatio: Math.min(dpr, 2), antialias: true, shadows: true, shadowSize: 1024, outline: true, particles: 1, clouds: 20, birds: 8, islandDetail: 1, weather: true };
    case 'ultra': return { level, pixelRatio: Math.min(dpr, 3), antialias: true, shadows: true, shadowSize: 2048, outline: true, particles: 1.5, clouds: 28, birds: 12, islandDetail: 1.2, weather: true };
  }
}

/** Détection à partir du matériel disponible (mémoire, cœurs, GPU). */
export function detectQuality(): QualityLevel {
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const mem = nav.deviceMemory ?? 4;
    const cores = nav.hardwareConcurrency ?? 4;
    let gpu = '';
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    const g = gpu.toLowerCase();
    if (/swiftshader|llvmpipe|software/.test(g)) return 'low';
    if (mem <= 2 || cores <= 4 || /mali-4|mali-t|adreno \(tm\) 3|powervr sgx/.test(g)) return 'low';
    if (mem <= 4 || /adreno \(tm\) 5|mali-g5/.test(g)) return 'medium';
    if (mem >= 8 && cores >= 8 && /adreno \(tm\) 7|mali-g7|apple|nvidia|radeon|geforce/.test(g)) return 'ultra';
    return 'high';
  } catch {
    return 'medium';
  }
}

/** Surveille le FPS et propose un niveau inférieur en cas de lenteur durable. */
export class FpsMonitor {
  private frames = 0;
  private acc = 0;
  fps = 60;
  private lowSeconds = 0;
  onDowngrade?: () => void;

  tick(dt: number): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 1) {
      this.fps = this.frames / this.acc;
      this.frames = 0;
      this.acc = 0;
      if (this.fps < 26) this.lowSeconds++;
      else this.lowSeconds = Math.max(0, this.lowSeconds - 1);
      if (this.lowSeconds >= 6) {
        this.lowSeconds = 0;
        this.onDowngrade?.();
      }
    }
  }
}

export function lowerLevel(l: QualityLevel): QualityLevel | null {
  return l === 'ultra' ? 'high' : l === 'high' ? 'medium' : l === 'medium' ? 'low' : null;
}
