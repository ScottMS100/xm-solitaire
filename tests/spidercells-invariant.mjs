// Every foundation pile in Spidercells must be a complete K..A run in alternating colours.
import { readFileSync } from 'node:fs';
import { Board, parseRules, cardRank, cardSuit, CELL_STOCK, CELL_FOUNDATION } from '../js/engine.js';
const name = process.argv[2] || 'Spidercells';
const seeds = process.argv[3] ? [Number(process.argv[3])] : [3918199961, 1, 2, 3, 4, 5];
const { games } = parseRules(readFileSync(new URL('../rules/standard.xml', import.meta.url), 'utf8'));
const g = games.find((x) => x.name === name);
let rng = 99; const rnd = (n) => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return Math.floor((rng / 4294967296) * n); };
let bad = 0;
const check = (b, what) => {
  for (let i = 0; i < b.cells.length; i++) {
    const c = b.cells[i];
    if (c.type !== CELL_FOUNDATION || !c.Ncards) continue;
    const r = Array.from(c.cards.subarray(0, c.Ncards));
    const ok = r.length === 13 && r.every((v, k) => cardRank(v) === 13 - k && (k === 0 || (cardSuit(v) & 2) !== (cardSuit(r[k - 1]) & 2)));
    if (!ok) { bad++; if (bad < 4) console.log('BAD foundation', i, 'after', what, r.map((v) => cardRank(v) + 'hdcs'[cardSuit(v)]).join(' ')); }
  }
};
for (const seed of seeds) {
  for (let game = 0; game < 300; game++) {
    const b = new Board(); b.newGame(g, seed);
    for (let step = 0; step < 300 && !b.finished; step++) {
      const mv = [];
      for (let s = 0; s < b.cells.length; s++) { const c = b.cells[s]; if (!c.Ncards || c.type === CELL_STOCK || c.type === CELL_FOUNDATION) continue; for (let ind = 0; ind < c.Ncards; ind++) { if (c.hidden[ind]) continue; for (let d = 0; d < b.cells.length; d++) if (d !== s && b.testMove(d, s, ind)) mv.push([d, s, ind]); } }
      if (!mv.length) break;
      const [d, s, i] = mv[rnd(mv.length)];
      b.move(d, s, i); check(b, `move ${s}:${i}->${d}`);
      b.autoPlay(); check(b, 'autoplay');
      if (rnd(10) === 0 && b.canUndo) { b.undo(); check(b, 'undo'); }
    }
  }
}
console.log(bad ? bad + ' violations' : `${name}: no violations`);
