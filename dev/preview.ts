import { SPECIES_LIST } from '../src/data/species';
import { portrait, eggPortrait } from '../src/render/showcase';
const g = document.getElementById('g')!;
const params = new URLSearchParams(location.search);
const stage = Number(params.get('stage') ?? 2);
const list = params.get('egg') ? SPECIES_LIST.slice(0, 20) : SPECIES_LIST;
for (const sp of list) {
  const d = document.createElement('div');
  d.className = 'c';
  d.innerHTML = `<img src="${params.get('egg') ? eggPortrait(sp.id, 120) : portrait(sp.id, stage, { size: 240 })}"><div>${sp.name}</div>`;
  g.appendChild(d);
}
(window as any).__done = true;
