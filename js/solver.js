// Deal solver: best-first search over the real engine rules, starting from the board's current position.
// Resumable: call step(ms) repeatedly. Works for games where every card is dealt at the start (no stock
// to turn over). Moves out of foundations are not considered.
import { cardRank, cardSuit, CELL_STOCK, CELL_FOUNDATION, CELL_TABLEAU, CELL_CELL } from './engine.js';

/** Why a board can't be checked, or '' if it can. */
export function unsupportedReason(board) {
  if (board.cells.some((c) => c.type === CELL_STOCK)) return 'This game has a stock pile to turn over, which the checker can’t search yet.';
  if (!board.cells.some((c) => c.Ncards)) return 'The table is empty.';
  return '';
}

export class Solver {
  constructor(board, maxStates = 400000) {
    this.b = board;
    this.maxStates = maxStates;
    board.autoplayEnabled = true;
    this.heap = [];
    this.nodes = 0;
    this.bestDone = 0;
    this.total = board.cells.reduce((n, c) => n + c.Ncards, 0);
    this.solution = null;
    this.status = 'running'; // running | solved | unsolvable | limit
    const start = this.snap();
    this.seen = new Set([this.key(start)]);
    this.push([this.score(start), start, null]);
  }

  snap() {
    const cells = this.b.cells;
    let len = 0;
    for (const c of cells) len += 1 + c.Ncards;
    const s = new Uint16Array(len);
    let p = 0;
    for (const c of cells) {
      s[p++] = c.Ncards;
      for (let k = 0; k < c.Ncards; k++) s[p++] = c.cards[k] | (c.hidden[k] ? 0x8000 : 0);
    }
    return s;
  }

  load(s) {
    const b = this.b;
    let p = 0;
    for (const c of b.cells) {
      const n = s[p++];
      c.Ncards = n;
      for (let k = 0; k < n; k++) { const v = s[p++]; c.cards[k] = v & 0x7fff; c.hidden[k] = v & 0x8000 ? 1 : 0; }
    }
    b.undoRec = []; b.undoPos = 0; b.redoPos = 0; b.moves = 0; b.finished = false;
  }

  key(s) {
    const col = [], cel = [], fnd = [];
    let p = 0;
    for (const c of this.b.cells) {
      const n = s[p];
      const str = String.fromCharCode.apply(null, s.subarray(p + 1, p + 1 + n));
      p += 1 + n;
      if (c.type === CELL_TABLEAU) col.push(str); else if (c.type === CELL_CELL) cel.push(str); else if (c.type === CELL_FOUNDATION) fnd.push(n);
    }
    return col.sort().join('|') + '#' + cel.sort().join('|') + '#' + fnd.sort().join('|');
  }

  score(s) {
    let done = 0, runs = 0, empty = 0, blocked = 0, p = 0;
    for (const c of this.b.cells) {
      const n = s[p++];
      const t = c.type;
      if (t === CELL_FOUNDATION) done += n;
      else if (t === CELL_TABLEAU) {
        if (!n) empty++;
        for (let k = 1; k < n; k++) {
          const a = s[p + k - 1] & 0x7fff, d = s[p + k] & 0x7fff;
          if (cardRank(a) === cardRank(d) + 1 && ((cardSuit(a) ^ cardSuit(d)) & 2)) runs++; else blocked += 1;
        }
        // low cards buried under high cards are bad
        for (let k = 0; k < n - 1; k++) if (cardRank(s[p + k] & 0x7fff) < cardRank(s[p + k + 1] & 0x7fff)) blocked += 0.5;
      } else if (t === CELL_CELL) blocked += n * 2;
      p += n;
    }
    return done * 20 + runs * 3 + empty * 6 - blocked;
  }

  push(e) {
    const h = this.heap;
    h.push(e);
    let i = h.length - 1;
    while (i > 0) { const q = (i - 1) >> 1; if (h[q][0] >= h[i][0]) break; [h[q], h[i]] = [h[i], h[q]]; i = q; }
  }

  pop() {
    const h = this.heap;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && h[l][0] > h[m][0]) m = l;
        if (r < h.length && h[r][0] > h[m][0]) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }

  /** Search for up to `ms` milliseconds. Returns the status. */
  step(ms) {
    if (this.status === 'solved' || this.status === 'unsolvable') return this.status;
    this.status = 'running';
    const b = this.b;
    const end = Date.now() + ms;
    while (this.heap.length && !this.solution) {
      if (this.seen.size >= this.maxStates) { this.status = 'limit'; return this.status; }
      if ((this.nodes & 15) === 0 && Date.now() > end) return this.status;
      const [, s, parentLink] = this.pop();
      this.nodes++;
      this.load(s);
      let done = 0;
      for (const c of b.cells) if (c.type === CELL_FOUNDATION) done += c.Ncards;
      if (done > this.bestDone) this.bestDone = done;
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
            if (dc.Ncards === 0 && seenEmpty.has(dc.type)) continue;
            if (b.testMove(d, src, ind)) {
              if (dc.Ncards === 0) { seenEmpty.add(dc.type); if (c.type === dc.type && ind === 0) continue; }
              moves.push([d, src, ind]);
            }
          }
        }
      }
      for (const [d, src, ind] of moves) {
        this.load(s);
        const moved = [src, d, b.cells[src].Ncards - ind, b.cells[src].cards[ind]];
        if (!b.move(d, src, ind)) continue;
        b.autoPlay();
        const link = { prev: parentLink, move: moved };
        if (b.finished || b.cells.every((x) => x.type === CELL_FOUNDATION || x.Ncards === 0)) { this.solution = link; break; }
        const ns = this.snap();
        const k = this.key(ns);
        if (this.seen.has(k)) continue;
        this.seen.add(k);
        this.push([this.score(ns), ns, link]);
      }
    }
    if (this.solution) {
      const path = [];
      for (let l = this.solution; l; l = l.prev) path.push(l.move);
      this.moves = path.reverse();
      this.status = 'solved';
    } else {
      this.status = 'unsolvable';
    }
    return this.status;
  }

  info() {
    return {
      status: this.status, nodes: this.nodes, states: this.seen.size, open: this.heap.length,
      best: this.bestDone, total: this.total, moves: this.moves ? this.moves.length : 0,
    };
  }
}
