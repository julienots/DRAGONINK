import type { ElementId } from '../core/types';

export type StatusId = 'burn' | 'stun' | 'shield' | 'regen' | 'weaken' | 'haste' | 'slow' | 'poison';

export interface SkillDef {
  id: string;
  name: string;
  kind: 'normal' | 'elemental' | 'special' | 'ultimate';
  element: ElementId;
  power: number;
  target: 'enemy' | 'allEnemies' | 'self' | 'allAllies' | 'weakestAlly';
  cooldown: number;
  heal?: number;
  status?: { id: StatusId; chance: number; turns: number; onSelf?: boolean };
  desc: string;
}

export const STATUS_INFO: Record<StatusId, { name: string; icon: string; good: boolean }> = {
  burn: { name: 'Brûlure', icon: '🔥', good: false },
  poison: { name: 'Poison', icon: '☠️', good: false },
  stun: { name: 'Étourdi', icon: '💫', good: false },
  weaken: { name: 'Affaibli', icon: '⬇️', good: false },
  slow: { name: 'Ralenti', icon: '🐌', good: false },
  shield: { name: 'Bouclier', icon: '🛡️', good: true },
  regen: { name: 'Régénération', icon: '💚', good: true },
  haste: { name: 'Célérité', icon: '💨', good: true },
};

type Kit = { elemental: Omit<SkillDef, 'id' | 'kind' | 'element' | 'cooldown'>; special: Omit<SkillDef, 'id' | 'kind' | 'element' | 'cooldown'>; ultimate: Omit<SkillDef, 'id' | 'kind' | 'element' | 'cooldown'> };

const KITS: Record<ElementId, Kit> = {
  flamme: {
    elemental: { name: 'Souffle Braise', power: 1.6, target: 'enemy', status: { id: 'burn', chance: 0.45, turns: 2 }, desc: 'Un souffle brûlant qui peut infliger Brûlure.' },
    special: { name: 'Mur Ardent', power: 0.85, target: 'allEnemies', desc: 'Une vague de feu frappe tous les ennemis.' },
    ultimate: { name: 'Nova Ardente', power: 2.3, target: 'allEnemies', status: { id: 'burn', chance: 0.7, turns: 2 }, desc: 'Une explosion solaire dévastatrice.' },
  },
  aqua: {
    elemental: { name: 'Jet Ondin', power: 1.5, target: 'enemy', desc: 'Un jet d’eau sous pression.' },
    special: { name: 'Pluie Douce', power: 0, target: 'allAllies', heal: 0.22, status: { id: 'regen', chance: 1, turns: 2 }, desc: 'Soigne toute l’équipe et accorde Régénération.' },
    ultimate: { name: 'Raz-de-Nuage', power: 2.1, target: 'allEnemies', status: { id: 'slow', chance: 0.6, turns: 2 }, desc: 'Une immense vague tombée du ciel.' },
  },
  flora: {
    elemental: { name: 'Fouet Liane', power: 1.5, target: 'enemy', status: { id: 'poison', chance: 0.4, turns: 3 }, desc: 'Des lianes qui peuvent empoisonner.' },
    special: { name: 'Floraison', power: 0, target: 'weakestAlly', heal: 0.4, desc: 'Soigne fortement l’allié le plus blessé.' },
    ultimate: { name: 'Forêt Éternelle', power: 1.9, target: 'allEnemies', heal: 0.15, desc: 'Une forêt jaillit, blesse les ennemis et soigne l’équipe.' },
  },
  volt: {
    elemental: { name: 'Décharge Zap', power: 1.55, target: 'enemy', status: { id: 'stun', chance: 0.25, turns: 1 }, desc: 'Peut étourdir la cible.' },
    special: { name: 'Survolt', power: 0, target: 'self', status: { id: 'haste', chance: 1, turns: 3, onSelf: true }, desc: 'Augmente fortement la vitesse.' },
    ultimate: { name: 'Tempête Électrique', power: 2.2, target: 'allEnemies', status: { id: 'stun', chance: 0.3, turns: 1 }, desc: 'La foudre frappe tout le terrain.' },
  },
  ombre: {
    elemental: { name: 'Griffe d’Ombre', power: 1.65, target: 'enemy', status: { id: 'weaken', chance: 0.4, turns: 2 }, desc: 'Peut affaiblir l’attaque adverse.' },
    special: { name: 'Voile Obscur', power: 0.9, target: 'allEnemies', status: { id: 'weaken', chance: 0.5, turns: 2 }, desc: 'Une brume qui affaiblit les ennemis.' },
    ultimate: { name: 'Nuit Sans Fin', power: 2.5, target: 'enemy', desc: 'Une frappe absolue sur une seule cible.' },
  },
  glace: {
    elemental: { name: 'Lance de Givre', power: 1.5, target: 'enemy', status: { id: 'slow', chance: 0.5, turns: 2 }, desc: 'Peut ralentir la cible.' },
    special: { name: 'Armure Givrée', power: 0, target: 'allAllies', status: { id: 'shield', chance: 1, turns: 2 }, desc: 'Protège toute l’équipe.' },
    ultimate: { name: 'Zéro Absolu', power: 2.1, target: 'allEnemies', status: { id: 'stun', chance: 0.35, turns: 1 }, desc: 'Gèle le champ de bataille.' },
  },
  vent: {
    elemental: { name: 'Lame d’Air', power: 1.45, target: 'enemy', desc: 'Rapide et précise.' },
    special: { name: 'Vent Arrière', power: 0, target: 'allAllies', status: { id: 'haste', chance: 1, turns: 2 }, desc: 'Accélère toute l’équipe.' },
    ultimate: { name: 'Cyclone Céleste', power: 2.15, target: 'allEnemies', desc: 'Un cyclone emporte les ennemis.' },
  },
  roche: {
    elemental: { name: 'Éboulement', power: 1.55, target: 'enemy', status: { id: 'stun', chance: 0.2, turns: 1 }, desc: 'Des rochers tombent sur la cible.' },
    special: { name: 'Rempart', power: 0, target: 'allAllies', status: { id: 'shield', chance: 1, turns: 3 }, desc: 'Un rempart de pierre protège l’équipe.' },
    ultimate: { name: 'Séisme Titan', power: 2.2, target: 'allEnemies', desc: 'La terre entière tremble.' },
  },
  lumiere: {
    elemental: { name: 'Rayon d’Aube', power: 1.5, target: 'enemy', desc: 'Un rayon pur et éclatant.' },
    special: { name: 'Bénédiction', power: 0, target: 'allAllies', heal: 0.28, desc: 'Une lumière qui soigne toute l’équipe.' },
    ultimate: { name: 'Jugement Solaire', power: 2.2, target: 'allEnemies', heal: 0.1, desc: 'La lumière punit et guérit.' },
  },
  cosmos: {
    elemental: { name: 'Météore', power: 1.7, target: 'enemy', desc: 'Une petite étoile filante.' },
    special: { name: 'Distorsion', power: 1.0, target: 'allEnemies', status: { id: 'slow', chance: 0.5, turns: 2 }, desc: 'Courbe l’espace autour des ennemis.' },
    ultimate: { name: 'Big Bang Xala', power: 2.6, target: 'allEnemies', desc: 'L’énergie originelle de l’univers.' },
  },
};

export function skillsFor(elements: ElementId[]): SkillDef[] {
  const p = elements[0];
  const s = elements[1] ?? elements[0];
  return [
    { id: `normal_${p}`, kind: 'normal', element: p, name: 'Attaque', power: 1, target: 'enemy', cooldown: 0, desc: 'Une attaque simple et fiable.' },
    { id: `elem_${p}`, kind: 'elemental', element: p, cooldown: 2, ...KITS[p].elemental },
    { id: `spec_${s}`, kind: 'special', element: s, cooldown: 3, ...KITS[s].special },
    { id: `ult_${p}`, kind: 'ultimate', element: p, cooldown: 0, ...KITS[p].ultimate },
  ];
}

export const ULTIMATE_CHARGE = 100;
