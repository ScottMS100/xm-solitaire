// The in-app solver module must agree with the known results.
import { readFileSync } from 'node:fs';
import { Board, parseRules, mergeGames } from '../js/engine.js';
import { Solver, unsupportedReason } from '../js/solver.js';
const dir = new URL('../rules/', import.meta.url);
const games = mergeGames(...['standard.xml', 'popular.xml'].map((f) => parseRules(readFileSync(new URL(f, dir), 'utf8')).games));
const g = (n) => games.find((x) => x.name === n);
let bad = 0;
for (const [name, deal, want] of [['Spidercells', 3496730557, 'unsolvable'], ['Spidercells', 3918199961, 'solved'], ['Spidercells', 1, 'solved']]) {
  const b = new Board(); b.newGame(g(name), deal);
  const s = new Solver(b); const t = Date.now();
  const st = s.step(120000);
  console.log(name, deal, st, JSON.stringify(s.info()), Date.now() - t, 'ms');
  if (st !== want) { bad++; console.log('  FAIL, wanted', want); }
}
const k = new Board(); k.newGame(g('Klondike'), 5);
console.log('Klondike unsupported:', unsupportedReason(k));
process.exit(bad ? 1 : 0);
