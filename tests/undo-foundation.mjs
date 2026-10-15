// Regression test: undoing the move that completed a Spider sequence must not be reversed by autoplay.
import { readFileSync } from 'node:fs';
import { Board, parseRules } from '../js/engine.js';
const { games } = parseRules(readFileSync(new URL('../rules/popular.xml', import.meta.url), 'utf8'));
const g = games.find((x) => x.name === 'Spider One Suit');
const b = new Board();
b.newGame(g, 1);
for (const c of b.cells) { c.Ncards = 0; c.hidden.fill(0); }
const tabs = b.cells.filter((c) => c.type === 2);
const spade = (r) => r | (3 << 4);
for (let r = 13; r >= 2; r--) tabs[0].cards[13 - r] = spade(r);
tabs[0].Ncards = 12;
tabs[1].cards[0] = spade(1); tabs[1].Ncards = 1;
const ti1 = b.cells.indexOf(tabs[1]); const ti0 = b.cells.indexOf(tabs[0]);
let fail = 0; const check = (ok, msg) => { if (!ok) { fail++; console.log('FAIL: ' + msg); } };
b.move(ti0, ti1, 0); b.autoPlay();
const found = () => b.cells.filter((c) => c.type === 1).reduce((n, c) => n + c.Ncards, 0);
check(found() === 13, 'sequence should go to the foundation (got ' + found() + ')');
b.undo();        // the UI does not autoplay after an undo
b.autoPlay();    // ...but even if autoplay runs, it must stay off
check(found() === 0 && tabs[0].Ncards === 13, 'undo must bring the 13 cards back and keep them there');
b.redo();
check(found() === 13, 'redo puts the sequence back on the foundation');
// the 13 cards were all that was left, so the game is won; undo must reopen it
b.undo();
check(!b.finished, 'undoing the winning move must make the game playable again');
b.redo();
check(b.finished, 'redo of the winning move finishes the game again');
console.log(fail ? fail + ' FAILED' : 'undo-foundation test passed');
process.exit(fail ? 1 : 0);
