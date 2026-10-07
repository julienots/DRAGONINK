import type { Reward, ElementId } from '../core/types';
import { ELEMENTS, RARITIES } from '../data/elements';
import { SPECIES } from '../data/species';
import { CROP, RECIPE, BUILDING } from '../data/world';
import { SKIN } from '../data/progression';
import { fmtNum } from '../core/util';

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** Crée un élément depuis du HTML (les valeurs dynamiques doivent passer par esc). */
export function html<T extends HTMLElement = HTMLElement>(s: string): T {
  const t = document.createElement('template');
  t.innerHTML = s.trim();
  return t.content.firstElementChild as T;
}

export function frag(s: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = s;
  return t.content;
}

/** Délégation de clics : data-act="nom" + data-* → handler(nom, dataset). */
export function onActions(root: HTMLElement, handler: (act: string, data: DOMStringMap, el: HTMLElement) => void): void {
  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t || !root.contains(t) || (t as HTMLButtonElement).disabled) return;
    e.stopPropagation();
    handler(t.dataset.act!, t.dataset, t);
  });
}

export const RES_ICON: Record<string, string> = { coins: '🪙', gems: '💎', energy: '⚡', essence: '🌟' };
export const RES_NAME: Record<string, string> = { coins: 'XalaCoins', gems: 'XalaGems', energy: 'XalaEnergy', essence: 'SuperEssence' };

export function priceHtml(p: { coins?: number; gems?: number; essence?: number; energy?: number }): string {
  const parts: string[] = [];
  for (const k of ['coins', 'gems', 'energy', 'essence'] as const) if (p[k]) parts.push(`${RES_ICON[k]} ${fmtNum(p[k]!)}`);
  return parts.join(' ') || 'Gratuit';
}

export function elChips(els: ElementId[]): string {
  return els.map((e) => `<span class="el-chip" style="--ec:${ELEMENTS[e].color}">${ELEMENTS[e].icon} ${ELEMENTS[e].name}</span>`).join(' ');
}

export function rarityChip(r: keyof typeof RARITIES): string {
  return `<span class="rar" style="--rc:${RARITIES[r].color}">${'★'.repeat(RARITIES[r].stars)} ${RARITIES[r].name}</span>`;
}

export interface RewardLine { icon: string; qty: string; img?: string; label: string }

export function rewardLines(r: Reward): RewardLine[] {
  const out: RewardLine[] = [];
  for (const k of ['coins', 'gems', 'energy', 'essence'] as const) if (r[k]) out.push({ icon: RES_ICON[k], qty: `+${fmtNum(r[k]!)}`, label: RES_NAME[k] });
  for (const [id, n] of Object.entries(r.items ?? {})) {
    const c = CROP[id], rc = RECIPE[id];
    out.push({ icon: c?.icon ?? rc?.icon ?? '📦', qty: `×${n}`, label: c?.name ?? rc?.name ?? id });
  }
  for (const e of r.eggs ?? []) {
    const sp = SPECIES[e];
    out.push({ icon: '🥚', qty: '×1', label: sp ? `Œuf de ${sp.name}` : e.includes('epic') ? 'Œuf Epic' : e.includes('rare') ? 'Œuf Rare' : e.includes('uncommon') ? 'Œuf Uncommon' : 'Œuf Mystère' });
  }
  for (const u of r.unlocks ?? []) out.push({ icon: BUILDING[u]?.icon ?? '🎨', qty: '', label: BUILDING[u]?.name ?? SKIN[u]?.name ?? u });
  if (r.playerXp) out.push({ icon: '⭐', qty: `+${r.playerXp}`, label: 'XP joueur' });
  if (r.passXp) out.push({ icon: '🎟️', qty: `+${r.passXp}`, label: 'XP Pass' });
  if (r.eventCurrency) out.push({ icon: '🎉', qty: `+${r.eventCurrency}`, label: 'Monnaie d’événement' });
  return out;
}

export function rewardInline(r: Reward): string {
  return rewardLines(r).map((l) => `<span title="${esc(l.label)}">${l.icon}${esc(l.qty)}</span>`).join(' ');
}

export function stars(n: number, max = 3): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

export function vibrate(ms = 15): void {
  try { navigator.vibrate?.(ms); } catch { /* ignore */ }
}
