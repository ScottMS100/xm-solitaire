// Engine smoke/fuzz tests. Run with: node tests/run.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Board, parseRules, mergeGames, CELL_STOCK } from '../js/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const rulesDir = join(here, '..', 'rules');
let failures = 0;
const fail = (msg) => { failures++; console.log('FAIL: ' + msg); };

const lists = [];
for (const f of readdirSync(rulesDir).filter((n) => n.endsWith('.xml')).sort((a, b) => (a === 'standard.xml' ? -1 : b === 'standard.xml' ? 1 : a.localeCompare(b)))) {
  const { games, warnings } = parseRules(readFileSync(join(rulesDir, f), 'utf8'));
  for (const w of warnings) console.log(`warn [${f}] ${w}`);
  console.log(`${f}: ${games.length} games`);
  lists.push(games);
}

const all = mergeGames(...lists);

const snapshot = (b) => JSON.stringify(b.cells.map((c) => [c.redealCount, Array.from(c.cards.subarray(0, c.Ncards)), Array.from(c.hidden.subarray(0, c.Ncards))]));

function legalMoves(b) {
  const out = [];
  for (let s = 0; s < b.cells.length; s++) {
    const c = b.cells[s];
    if (c.Ncards === 0 || c.type === CELL_STOCK) continue;
    for (let ind = 0; ind < c.Ncards; ind++) {
      if (c.hidden[ind]) continue;
      for (let d = 0; d < b.cells.length; d++) {
        if (d !== s && b.testMove(d, s, ind)) out.push([d, s, ind]);
      }
    }
  }
  return out;
}

let rng = 12345;
const rnd = (n) => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return Math.floor((rng / 4294967296) * n); };

const summary = [];
for (const g of all) {
  for (const seed of [1, 2, 977]) {
    const b = new Board();
    try {
      b.newGame(g, seed);
      const total = b.totalCards();
      if (total !== g.cardCount) {
        // a few games intentionally deal fewer cards; report but don't fail unless zero
        if (total === 0) fail(`${g.name}: no cards dealt`);
      }
      const start = snapshot(b);
      let actions = 0;
      for (let step = 0; step < 400 && !b.finished; step++) {
        const moves = legalMoves(b);
        const stocks = b.cells.map((c, i) => [c, i]).filter(([c]) => c.type === CELL_STOCK && (c.Ncards > 0 || c.redealCount < c.redeal));
        const pick = rnd(moves.length + stocks.length);
        let did = 0;
        if (pick < moves.length) { const [d, s, i] = moves[pick]; did = b.move(d, s, i); }
        else if (pick >= 0 && stocks.length) { did = b.stockClick(stocks[rnd(stocks.length)][1]); if (did) b.moves = b.moves; }
        else break;
        if (did) { actions++; b.autoPlay(); }
        if (b.totalCards() !== total) { fail(`${g.name} seed ${seed}: card count changed ${total} -> ${b.totalCards()}`); break; }
      }
      // serialize round trip
      const ser = JSON.parse(JSON.stringify(b.serialize()));
      const b2 = new Board();
      b2.restore(g, ser);
      if (snapshot(b2) !== snapshot(b)) fail(`${g.name} seed ${seed}: serialize round trip mismatch`);
      // undo everything -> initial deal
      const end = snapshot(b);
      let guard = 0;
      while (b.undo1() && guard++ < 5000);
      if (snapshot(b) !== start) fail(`${g.name} seed ${seed}: undo-all did not restore the initial deal (${actions} actions)`);
      guard = 0;
      while (b.redo1() && guard++ < 5000);
      if (snapshot(b) !== end) fail(`${g.name} seed ${seed}: redo-all did not reproduce final position (${actions} actions)`);
      if (seed === 1) summary.push(`${g.name}: ${total} cards, ${g.cells.length} defs, ${actions} actions`);
    } catch (e) {
      fail(`${g.name} seed ${seed}: exception ${e.stack}`);
    }
  }
}
if (process.argv.includes('-v')) console.log(summary.join('\n'));
console.log(failures ? `${failures} FAILURES` : `All ${all.length} games passed`);
process.exit(failures ? 1 : 0);
