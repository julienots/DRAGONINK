// Écran de lancement original : ciel spatial bleu/violet, îles flottantes,
// créatures qui apparaissent, logo XalaMonsters et révélation SUPERESSENCE.

interface Creature { x: number; y: number; r: number; color: string; color2: string; born: number; horns: number; island: number; ears: boolean }

export class LoadingScreen {
  el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private t0 = performance.now();
  private stars: { x: number; y: number; r: number; p: number }[] = [];
  private clouds: { x: number; y: number; s: number; v: number; a: number }[] = [];
  private creatures: Creature[] = [];
  private progress = 0;
  private shown = 0;
  private lastT = 0;
  private bar: HTMLElement;
  private label: HTMLElement;
  private pct: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'loading';
    this.el.innerHTML = `<canvas></canvas>
      <div class="ld-center">
        <div class="ld-logo" aria-label="XalaMonsters">${'XalaMonsters'.split('').map((c, i) => `<span style="animation-delay:${0.25 + i * 0.07}s">${c}</span>`).join('')}</div>
        <div class="ld-se">${'SUPERESSENCE'.split('').map((c, i) => `<span style="animation-delay:${1.3 + i * 0.09}s">${c}</span>`).join('')}</div>
      </div>
      <div class="ld-bottom"><div class="ld-label">Chargement de l’archipel...</div>
        <div class="ld-bar"><i></i><b></b></div><div class="ld-pct">0 %</div></div>`;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.bar = this.el.querySelector('.ld-bar i')!;
    this.label = this.el.querySelector('.ld-label')!;
    this.pct = this.el.querySelector('.ld-pct')!;
    for (let i = 0; i < 140; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.75, r: Math.random() * 1.6 + 0.3, p: Math.random() * 6 });
    for (let i = 0; i < 9; i++) this.clouds.push({ x: Math.random(), y: 0.55 + Math.random() * 0.4, s: 0.6 + Math.random() * 1.2, v: 0.004 + Math.random() * 0.012, a: 0.5 + Math.random() * 0.4 });
    const palette = [['#ff6a2b', '#ffd36b'], ['#2fa8ff', '#c3f1ff'], ['#3fcf5a', '#dfffa8'], ['#ffd400', '#fff7c2'], ['#8a5cff', '#e3c2ff'], ['#9fe9ff', '#ffffff'], ['#ff7bf1', '#ffe2f2']];
    const spots: [number, number, number][] = [[0.18, 0.62, 0], [0.26, 0.6, 0], [0.5, 0.47, 1], [0.58, 0.46, 1], [0.79, 0.66, 2], [0.86, 0.65, 2], [0.42, 0.48, 1]];
    spots.forEach(([x, y, isl], i) => this.creatures.push({ x, y, r: 0.026 + (i % 3) * 0.006, color: palette[i][0], color2: palette[i][1], born: 0.6 + i * 0.45, horns: i % 3, island: isl, ears: i % 2 === 0 }));
    const loop = () => { this.draw(); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  setProgress(p: number, label?: string): void {
    this.progress = Math.max(this.progress, Math.min(1, p));
    if (label) this.label.textContent = label;
  }

  private island(cx: number, cy: number, w: number, top: string, t: number, seed: number): void {
    const g = this.ctx;
    const y = cy + Math.sin(t * 0.8 + seed) * 6;
    // falaise
    const grd = g.createLinearGradient(0, y, 0, y + w * 0.75);
    grd.addColorStop(0, '#8a5ab8'); grd.addColorStop(1, 'rgba(40,20,90,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(cx - w / 2, y);
    g.quadraticCurveTo(cx - w * 0.3, y + w * 0.35, cx - w * 0.05, y + w * 0.7);
    g.lineTo(cx + w * 0.06, y + w * 0.62);
    g.quadraticCurveTo(cx + w * 0.3, y + w * 0.32, cx + w / 2, y);
    g.fill();
    // plateau
    g.fillStyle = top;
    g.beginPath();
    g.ellipse(cx, y, w / 2, w * 0.1, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath();
    g.ellipse(cx - w * 0.08, y - w * 0.025, w * 0.32, w * 0.045, 0, 0, Math.PI * 2);
    g.fill();
    // arbres
    for (let i = 0; i < 3; i++) {
      const tx = cx - w * 0.35 + i * w * 0.33 + (seed % 2) * 10;
      g.fillStyle = '#6a3a2a'; g.fillRect(tx - 2, y - w * 0.09, 4, w * 0.08);
      g.fillStyle = i % 2 ? '#3fae3a' : '#57c94a';
      g.beginPath(); g.arc(tx, y - w * 0.12, w * 0.06, 0, Math.PI * 2); g.fill();
    }
  }

  private creature(c: Creature, W: number, H: number, t: number, bob: number): void {
    const age = t - c.born;
    if (age < 0) return;
    const g = this.ctx;
    const pop = Math.min(1, age * 3);
    const s = (pop < 1 ? pop * 1.2 - Math.max(0, pop - 0.8) : 1) * c.r * Math.min(W, H * 1.4);
    const x = c.x * W, y = c.y * H + bob - s * 0.9 + Math.abs(Math.sin(t * 3 + c.x * 10)) * -4;
    g.save();
    g.globalAlpha = Math.min(1, age * 2);
    // ombre
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.beginPath(); g.ellipse(x, y + s * 0.95, s * 0.8, s * 0.2, 0, 0, Math.PI * 2); g.fill();
    // oreilles / cornes
    g.fillStyle = c.color;
    if (c.ears) for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x + sx * s * 0.5, y - s * 0.5); g.lineTo(x + sx * s * 0.85, y - s * 1.25); g.lineTo(x + sx * s * 0.15, y - s * 0.8); g.fill(); }
    g.fillStyle = '#fff3c4';
    for (let i = 0; i < c.horns; i++) { const hx = x + (i - (c.horns - 1) / 2) * s * 0.45; g.beginPath(); g.moveTo(hx - s * 0.1, y - s * 0.85); g.lineTo(hx, y - s * 1.35); g.lineTo(hx + s * 0.1, y - s * 0.85); g.fill(); }
    // corps
    const grd = g.createRadialGradient(x - s * 0.3, y - s * 0.4, s * 0.1, x, y, s * 1.1);
    grd.addColorStop(0, c.color2); grd.addColorStop(0.45, c.color); grd.addColorStop(1, c.color);
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(x, y, s, s * 0.92, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = c.color2;
    g.beginPath(); g.ellipse(x, y + s * 0.35, s * 0.55, s * 0.4, 0, 0, Math.PI * 2); g.fill();
    // yeux
    const blink = Math.sin(t * 1.3 + c.x * 20) > 0.97 ? 0.15 : 1;
    for (const sx of [-1, 1]) {
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(x + sx * s * 0.35, y - s * 0.12, s * 0.24, s * 0.28 * blink, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1d1430';
      g.beginPath(); g.ellipse(x + sx * s * 0.37, y - s * 0.08, s * 0.14, s * 0.18 * blink, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(x + sx * s * 0.32, y - s * 0.18, s * 0.06, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,120,170,.6)';
      g.beginPath(); g.ellipse(x + sx * s * 0.62, y + s * 0.15, s * 0.12, s * 0.07, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  private flyer(W: number, H: number, t: number): void {
    const g = this.ctx;
    const p = ((t * 0.09) % 1.4) - 0.2;
    const x = p * W, y = H * 0.3 + Math.sin(t * 1.5) * H * 0.04;
    const s = Math.min(W, H) * 0.035;
    const flap = Math.sin(t * 12);
    g.save();
    g.fillStyle = '#ffb3f7';
    for (const sx of [-1, 1]) {
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + sx * s * 1.4, y - s * (1.2 + flap * 0.9), x + sx * s * 2.4, y - s * flap * 0.6);
      g.quadraticCurveTo(x + sx * s * 1.2, y + s * 0.2, x, y + s * 0.3);
      g.fill();
    }
    g.fillStyle = '#4b5cff';
    g.beginPath(); g.ellipse(x, y, s, s * 0.85, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff4b0';
    g.beginPath(); g.moveTo(x - s * 1.6, y + s * 0.2); g.lineTo(x - s * 0.8, y); g.lineTo(x - s * 0.8, y + s * 0.4); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x + s * 0.4, y - s * 0.15, s * 0.28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d1430';
    g.beginPath(); g.arc(x + s * 0.47, y - s * 0.12, s * 0.15, 0, Math.PI * 2); g.fill();
    // traînée d'étoiles
    for (let i = 1; i < 8; i++) {
      g.fillStyle = `rgba(255,244,176,${0.6 - i * 0.07})`;
      g.beginPath(); g.arc(x - s * 1.6 - i * s * 0.7, y + Math.sin(t * 6 + i) * 3, s * 0.12 * (1 - i / 9), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  private draw(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    if (this.canvas.width !== Math.round(W * dpr)) { this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr); }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = (performance.now() - this.t0) / 1000;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0d0a2e'); bg.addColorStop(0.45, '#2a1f7a'); bg.addColorStop(0.8, '#6a3cbc'); bg.addColorStop(1, '#ff9ad1');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // nébuleuse
    const neb = g.createRadialGradient(W * 0.7, H * 0.25, 0, W * 0.7, H * 0.25, W * 0.6);
    neb.addColorStop(0, 'rgba(92,242,255,.22)'); neb.addColorStop(1, 'rgba(92,242,255,0)');
    g.fillStyle = neb; g.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      g.fillStyle = `rgba(255,255,255,${0.4 + Math.sin(t * 2 + s.p) * 0.35})`;
      g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill();
    }
    // planète au loin
    g.fillStyle = 'rgba(255,123,241,.35)';
    g.beginPath(); g.arc(W * 0.15, H * 0.18, Math.min(W, H) * 0.07, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,244,176,.35)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(W * 0.15, H * 0.18, Math.min(W, H) * 0.12, Math.min(W, H) * 0.025, -0.3, 0, Math.PI * 2); g.stroke();
    // îles
    const isl: [number, number, number, string][] = [[0.22, 0.66, 0.34, '#5fcf4a'], [0.53, 0.5, 0.28, '#8de35a'], [0.83, 0.69, 0.3, '#ffb3d9']];
    isl.forEach(([x, y, w, c], i) => this.island(x * W, y * H, w * Math.min(W, H * 1.2), c, t, i * 1.7));
    for (const c of this.creatures) this.creature(c, W, H, t, Math.sin(t * 0.8 + c.island * 1.7) * 6);
    this.flyer(W, H, t);
    // nuages
    for (const c of this.clouds) {
      c.x += c.v / 60;
      if (c.x > 1.3) c.x = -0.3;
      g.fillStyle = `rgba(255,255,255,${c.a * 0.45})`;
      const cx = c.x * W, cy = c.y * H, r = 40 * c.s;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.arc(cx + r, cy + 6, r * 0.8, 0, Math.PI * 2); g.arc(cx - r, cy + 8, r * 0.7, 0, Math.PI * 2); g.fill();
    }
    // progression lissée
    const dt = Math.min(0.1, t - this.lastT);
    this.lastT = t;
    this.shown = Math.min(this.progress, this.shown + Math.max((this.progress - this.shown) * dt * 5, dt * 0.35));
    this.bar.style.width = `${(this.shown * 100).toFixed(1)}%`;
    this.pct.textContent = `${Math.round(this.shown * 100)} %`;
  }

  /** Attend une durée minimale puis un toucher (nécessaire pour activer l'audio). */
  async waitTap(): Promise<void> {
    while (this.shown < 0.985) await new Promise((r) => setTimeout(r, 50));
    const minTime = 2600;
    const el = performance.now() - this.t0;
    if (el < minTime) await new Promise((r) => setTimeout(r, minTime - el));
    this.label.textContent = 'Touchez pour commencer';
    this.label.classList.add('tap');
    this.el.classList.add('ready');
    await new Promise<void>((resolve) => {
      const go = () => { this.el.removeEventListener('pointerup', go); resolve(); };
      this.el.addEventListener('pointerup', go);
    });
  }

  hide(): void {
    this.el.classList.add('out');
    setTimeout(() => { cancelAnimationFrame(this.raf); this.el.remove(); }, 650);
  }
}
