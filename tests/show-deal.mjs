// node tests/show-deal.mjs "Spidercells" 3496730557  -> prints the starting layout (top card first in each pile)
import { readFileSync } from 'node:fs';
import { Board, parseRules, cardRank, cardSuit, CELL_TABLEAU } from '../js/engine.js';
const g = parseRules(readFileSync(new URL('../rules/standard.xml', import.meta.url), 'utf8')).games.find((x) => x.name === process.argv[2]);
const b = new Board(); b.newGame(g, Number(process.argv[3]));
const lab = (v) => ['A','2','3','4','5','6','7','8','9','10','J','Q','K'][cardRank(v) - 1] + '♥♦♣♠'[cardSuit(v)];
b.cells.filter((c) => c.type === CELL_TABLEAU).forEach((c, i) => console.log(`col ${i + 1}: ` + Array.from(c.cards.subarray(0, c.Ncards)).map(lab).join(' ')));
