// Is `finished` consistent with the foundations? Plays Spidercells with a simple greedy+random policy.
import { readFileSync } from 'node:fs';
import { Board, parseRules, CELL_STOCK, CELL_FOUNDATION } from '../js/engine.js';
const { games } = parseRules(readFileSync(new URL('../rules/standard.xml', import.meta.url), 'utf8'));
const g = games.find((x) => x.name === 'Spidercells');
let rng = 5; const rnd = (n) => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return Math.floor((rng / 4294967296) * n); };
let wins = 0, incons = 0, maxDone = 0, runs = 0;
for (let game = 0; game < 4000; game++) {
  const b = new Board(); b.newGame(g, 3918199961 + (game % 50));
  for (let step = 0; step < 400; step++) {
    const mv = [];
    for (let s = 0; s < b.cells.length; s++) { const c = b.cells[s]; if (!c.Ncards || c.type === CELL_FOUNDATION) continue; for (let ind = c.Ncards - 1; ind >= 0; ind--) { if (c.hidden[ind]) continue; for (let d = 0; d < b.cells.length; d++) if (d !== s && b.testMove(d, s, ind)) mv.push([d, s, ind]); } }
    if (!mv.length) break;
    // prefer moves onto tableau piles that extend runs (non-cell destinations), else random
    const good = mv.filter(([d]) => b.cells[d].type === 2 && b.cells[d].Ncards > 0);
    const pool = good.length && rnd(4) ? good : mv;
    const [d, s, i] = pool[rnd(pool.length)];
    b.move(d, s, i); b.autoPlay();
    const full = b.cells.filter((c) => c.type === CELL_FOUNDATION && c.Ncards === 13).length;
    maxDone = Math.max(maxDone, full);
    const all = b.cells.every((c) => c.type === CELL_FOUNDATION || c.Ncards === 0);
    if (b.finished !== all) { incons++; console.log('finished flag', b.finished, 'but all-on-foundation', all, 'full piles', full); break; }
    if (b.finished) { wins++; break; }
  }
  runs++;
}
console.log({ runs, wins, incons, maxFullStacks: maxDone });
