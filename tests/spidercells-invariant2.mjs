import { readFileSync } from 'node:fs';
import { Board, parseRules, cardRank, cardSuit, CELL_STOCK, CELL_FOUNDATION } from '../js/engine.js';
const { games } = parseRules(readFileSync(new URL('../rules/standard.xml', import.meta.url), 'utf8'));
const g = games.find((x) => x.name === 'Spidercells');
let rng = 7; const rnd = (n) => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return Math.floor((rng / 4294967296) * n); };
let bad = 0;
const check = (b, what, log) => {
  for (let i = 0; i < b.cells.length; i++) {
    const c = b.cells[i];
    if (c.type !== CELL_FOUNDATION || !c.Ncards) continue;
    const r = Array.from(c.cards.subarray(0, c.Ncards));
    const ok = r.length === 13 && r.every((v, k) => cardRank(v) === 13 - k && (k === 0 || (cardSuit(v) & 2) !== (cardSuit(r[k - 1]) & 2)));
    if (!ok) { bad++; if (bad < 3) console.log('BAD foundation', i, 'after', what, r.map((v) => cardRank(v) + 'hdcs'[cardSuit(v)]).join(' '), '\n  last ops:', log.slice(-8).join(' | ')); return false; }
  }
  return true;
};
for (const seed of [3918199961, 11, 12, 13]) {
  for (let game = 0; game < 400; game++) {
    const b = new Board(); b.newGame(g, seed); const log = [];
    for (let step = 0; step < 300 && !b.finished; step++) {
      const op = rnd(10);
      if (op < 5) { // tap smart-move on a random non-foundation card
        const s = rnd(b.cells.length); const c = b.cells[s]; if (!c.Ncards || c.type === CELL_FOUNDATION) continue;
        const ind = rnd(c.Ncards); if (c.hidden[ind]) continue;
        log.push(`tap ${s}:${ind}`); b.rightclkMove(s, ind); b.autoPlay();
      } else if (op < 7) { log.push('dbl'); const s = rnd(b.cells.length); if (b.cells[s].type !== CELL_FOUNDATION) { b.dblclkMove(s); b.autoPlay(); } }
      else if (op < 9) { log.push('undo'); b.undo(); }
      else { log.push('redo'); b.redo(); }
      if (!check(b, log[log.length - 1], log)) break;
    }
  }
}
console.log(bad ? bad + ' violations' : 'no violations');
