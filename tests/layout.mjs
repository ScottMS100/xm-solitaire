// Layout sanity check: node tests/layout.mjs   (card sizes + off-screen cells for every game at several screen sizes)
import { readFileSync } from 'node:fs';
import { Board, parseRules, mergeGames } from '../js/engine.js';
import { computeLayout, cardPos } from '../js/layout.js';

const rd = (f) => parseRules(readFileSync(new URL('../rules/' + f, import.meta.url), 'utf8')).games;
const games = mergeGames(rd('standard.xml'), rd('popular.xml'));
const sizes = [[390, 640], [800, 360], [1024, 700], [768, 950]];
let bad = 0;
const small = [];
for (const [W, H] of sizes) {
  let minCw = 1e9;
  let minName = '';
  for (const g of games) {
    const b = new Board();
    b.newGame(g, 7);
    const L = computeLayout(b, W, H, {});
    if (L.cardW < minCw) { minCw = L.cardW; minName = g.name; }
    for (let i = 0; i < b.cells.length; i++) {
      const c = b.cells[i];
      for (let j = Math.max(0, L.cells[i].start); j <= Math.max(0, c.Ncards - 1); j++) {
        const p = cardPos(L, i, j);
        if (p.x < -1 || p.y < -1 || p.x + L.cardW > W + 1 || p.y + L.cardH > H + 1) {
          bad++;
          if (bad < 15) console.log(`off-screen: ${g.name} ${W}x${H} cell ${i} card ${j} at ${p.x},${p.y} size ${L.cardW}x${L.cardH}`);
          break;
        }
      }
    }
    if (L.cardW < 28) small.push(`${g.name}@${W}x${H}:${L.cardW}`);
  }
  console.log(`${W}x${H}: smallest card ${minCw}px wide (${minName})`);
}
console.log('off-screen cells:', bad);
console.log('very small (<28px):', small.length ? small.join(', ') : 'none');
