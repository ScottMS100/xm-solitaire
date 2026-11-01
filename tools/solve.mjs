// Solver: node tools/solve.mjs "Spidercells" 3496730557 [maxNodes]
// Best-first search over the real engine rules. Reports a winning move list, or proves there is none
// when the whole reachable state space has been searched.
import { readFileSync, readdirSync } from 'node:fs';
import { Board, parseRules, mergeGames, cardRank, cardSuit, CELL_STOCK, CELL_FOUNDATION, CELL_TABLEAU, CELL_CELL } from '../js/engine.js';

const name = process.argv[2] || 'Spidercells';
const deal = Number(process.argv[3] || 1);
const maxNodes = Number(process.argv[4] || 4000000);
const dir = new URL('../rules/', import.meta.url);
const lists = readdirSync(dir).filter((f) => f.endsWith('.xml')).sort((a, b) => (a === 'standard.xml' ? -1 : b === 'standard.xml' ? 1 : a.localeCompare(b)))
  .map((f) => parseRules(readFileSync(new URL(f, dir), 'utf8')).games);
const g = mergeGames(...lists).find((x) => x.name.toLowerCase() === name.toLowerCase());
if (!g) { console.log('unknown game'); process.exit(1); }
const b = new Board();
b.newGame(g, deal);
const label = (v) => 'A234567891JQK'[cardRank(v) - 1].replace('1', '10') + 'hdcs'[cardSuit(v)];

const snap = () => b.cells.map((c) => [c.Ncards, c.cards.slice(0, c.Ncards), c.hidden.slice(0, c.Ncards)]);
const load = (s) => {
  s.forEach(([n, cards, hid], i) => { const c = b.cells[i]; c.Ncards = n; c.cards.set(cards); c.hidden.set(hid); });
  b.undoRec = []; b.undoPos = 0; b.redoPos = 0; b.moves = 0; b.finished = false;
};
const key = (s) => {
  const col = [], cel = [], fnd = [];
  s.forEach(([n, cards], i) => {
    const t = b.cells[i].type; const str = Array.from(cards).join(',');
    if (t === CELL_TABLEAU) col.push(str); else if (t === CELL_CELL) cel.push(str); else if (t === CELL_FOUNDATION) fnd.push(n);
  });
  return col.sort().join('|') + '#' + cel.sort().join('|') + '#' + fnd.sort().join('|');
};
const score = (s) => {
  let done = 0, runs = 0, empty = 0, blocked = 0;
  s.forEach(([n, cards], i) => {
    const t = b.cells[i].type;
    if (t === CELL_FOUNDATION) done += n;
    if (t === CELL_TABLEAU) {
      if (!n) empty++;
      for (let k = 1; k < n; k++) {
        const a = cards[k - 1], c = cards[k];
        if (cardRank(a) === cardRank(c) + 1 && ((cardSuit(a) ^ cardSuit(c)) & 2)) runs++; else blocked += 1;
      }
      // low cards buried under high cards are bad
      for (let k = 0; k < n - 1; k++) if (cardRank(cards[k]) < cardRank(cards[k + 1])) blocked += 0.5;
    }
    if (t === CELL_CELL) blocked += n * 2;
  });
  return done * 20 + runs * 3 + empty * 6 - blocked;
};

// binary max-heap
const heap = [];
const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] >= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] > heap[m][0]) m = l; if (r < heap.length && heap[r][0] > heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };

const start = snap();
const seen = new Map([[key(start), null]]);
push([score(start), start, null, 0]);
let nodes = 0, solution = null, bestDone = 0;
const start0 = Date.now();
while (heap.length && nodes < maxNodes && !solution) {
  const [, s, parentLink] = pop();
  nodes++;
  load(s);
  bestDone = Math.max(bestDone, s.reduce((n, [c], i) => n + (b.cells[i].type === CELL_FOUNDATION ? c : 0), 0));
  // enumerate moves
  const moves = [];
  for (let src = 0; src < b.cells.length; src++) {
    const c = b.cells[src];
    if (!c.Ncards || c.type === CELL_STOCK || c.type === CELL_FOUNDATION) continue;
    for (let ind = 0; ind < c.Ncards; ind++) {
      if (c.hidden[ind]) continue;
      const seenEmpty = new Set();
      for (let d = 0; d < b.cells.length; d++) {
        if (d === src) continue;
        const dc = b.cells[d];
        if (dc.Ncards === 0) { if (seenEmpty.has(dc.type)) continue; }
        if (b.testMove(d, src, ind)) {
          if (dc.Ncards === 0) { seenEmpty.add(dc.type); if (c.type === dc.type && ind === 0) continue; }
          moves.push([d, src, ind]);
        }
      }
    }
  }
  for (const [d, src, ind] of moves) {
    load(s);
    const moved = [label(b.cells[src].cards[ind]), src, d, b.cells[src].Ncards - ind];
    if (!b.move(d, src, ind)) continue;
    b.autoPlay();
    const ns = snap();
    const k = key(ns);
    const link = { prev: parentLink, move: moved };
    if (b.finished || b.cells.every((x) => x.type === CELL_FOUNDATION || x.Ncards === 0)) { solution = link; break; }
    if (seen.has(k)) continue;
    seen.set(k, link);
    push([score(ns), ns, link]);
  }
}
const secs = ((Date.now() - start0) / 1000).toFixed(1);
if (solution) {
  const path = [];
  for (let l = solution; l; l = l.prev) path.push(l.move);
  path.reverse();
  console.log(`SOLVABLE: found a win in ${path.length} moves (${nodes} states searched, ${secs}s)`);
  console.log(path.map(([card, s, d, n], i) => `${i + 1}. ${n > 1 ? n + ' cards from ' : ''}${card}`).join('  ').slice(0, 600) + ' ...');
} else if (!heap.length) {
  console.log(`NOT SOLVABLE: all ${seen.size} reachable positions searched, none wins; best possible: ${bestDone / 13} of 4 stacks on the foundations (${secs}s)`);
} else {
  console.log(`UNDECIDED: no win found after ${nodes} states (${heap.length} still open, ${secs}s)`);
}
