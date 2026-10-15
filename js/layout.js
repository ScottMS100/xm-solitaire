// Board layout: turns XM Solitaire's 0..1000 relative cell coordinates into pixels.
// Based on scaleX/scaleY/getDxDy/calcCardW in XM Solitaire's xmsol.cpp (GPL), adapted for touch screens:
// the card size is chosen to fit the game's widest row, and long piles are compressed to stay on screen.
import { DIR_NO, DIR_DOWN, DIR_RIGHT, DIR_UP, DIR_LEFT } from './engine.js';


const SEQ_DY = 20, SEQ_DX = 18, HID_DY = 7, HID_DX = 6; // XM defaults (sequenceDy, ...)

/**
 * @param {import('./engine.js').Board} board
 * @param {number} W viewport width in CSS px
 * @param {number} H viewport height in CSS px
 * @param {{spread?: number, aspect?: number}} opts  spread: multiplier for the spacing between overlapping cards;
 *   aspect: card height / width of the current deck
 */
export function computeLayout(board, W, H, opts = {}) {
  const spread = opts.spread ?? 1.2;
  const CARD_ASPECT = opts.aspect ?? 1.5;
  const cells = board.cells;
  const border = Math.max(4, Math.round(Math.min(W, H) * 0.012));
  const Wb = W - 2 * border;

  // --- card width: the widest that keeps neighbouring piles in the same row apart ---
  let cw = Infinity;
  const rows = new Map();
  for (const c of cells) {
    if (!rows.has(c.y)) rows.set(c.y, new Set());
    rows.get(c.y).add(c.x);
  }
  const GAP = 0.03;
  for (const xs of rows.values()) {
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const dx = sorted[i] - sorted[i - 1];
      if (dx > 0) cw = Math.min(cw, (Wb * dx) / (1000 * (1 + GAP) + dx));
    }
  }
  if (!isFinite(cw)) cw = Wb / 8;
  // ... and the same vertically, except for rows that XM deliberately overlaps (closer than ~1.5 cards at its default size)
  const Hy = Math.min(H, W * 1.15);
  const cols = new Map();
  for (const c of cells) {
    if (!cols.has(c.x)) cols.set(c.x, new Set());
    cols.get(c.x).add(c.y);
  }
  for (const ys of cols.values()) {
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      const dy = sorted[i] - sorted[i - 1];
      if (dy >= 200) cw = Math.min(cw, (((Hy - 2 * border) * dy) / (1000 * (1 + GAP) + dy)) / CARD_ASPECT);
    }
  }
  // XM limits a card to 96/518 of the window height; piles shrink to fit, so allow a bit more
  cw = Math.min(cw, ((96 * H * 1.3) / 518) / CARD_ASPECT, W * 0.2);
  cw = Math.max(cw, 22);
  const cardW = Math.floor(cw);
  const cardH = Math.floor(cw * CARD_ASPECT);

  // Pile positions are spread over a board that is at most 1.15x as tall as it is wide, so that on
  // tall phone screens the piles stay together and the rest of the screen is free for them to grow.
  const scaleX = (x) => Math.round(((Wb - cardW) * x) / 1000 + border);
  const scaleY = (y) => Math.round(((Hy - cardH - 2 * border) * y) / 1000 + border);

  const out = new Array(cells.length);
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    let dx = 0, dy = 0, hdx = 0, hdy = 0;
    switch (c.dir) {
      case DIR_DOWN: dy = SEQ_DY; hdy = HID_DY; break;
      case DIR_RIGHT: dx = SEQ_DX; hdx = HID_DX; break;
      case DIR_UP: dy = -SEQ_DY; hdy = -HID_DY; break;
      case DIR_LEFT: dx = -SEQ_DX; hdx = -HID_DX; break;
      default: break;
    }
    const f = c.spacing * spread;
    dx = (dx * f * cardW) / 7100;
    hdx = (hdx * f * cardW) / 7100;
    dy = (dy * f * cardH) / 9600;
    hdy = (hdy * f * cardH) / 9600;
    const x0 = scaleX(c.x);
    const y0 = scaleY(c.y);
    const start = Math.max(0, c.Ncards - c.maxShow);
    // total travel from the first shown card to the top card
    let sx = 0, sy = 0;
    for (let j = start; j < c.Ncards - 1; j++) {
      if (c.hidden[j]) { sx += hdx; sy += hdy; } else { sx += dx; sy += dy; }
    }
    // compress long piles so that they stay inside the screen
    let k = 1;
    const pad = border;
    if (c.dir === DIR_DOWN && sy > 0) k = Math.min(k, (H - pad - cardH - y0) / sy);
    else if (c.dir === DIR_UP && sy < 0) k = Math.min(k, (y0 - pad) / -sy);
    else if (c.dir === DIR_RIGHT && sx > 0) k = Math.min(k, (W - pad - cardW - x0) / sx);
    else if (c.dir === DIR_LEFT && sx < 0) k = Math.min(k, (x0 - pad) / -sx);
    k = Math.max(0.1, k);
    out[i] = { x0, y0, dx: dx * k, dy: dy * k, hdx: hdx * k, hdy: hdy * k, start };
  }
  const L = { W, H, cardW, cardH, border, cells: out, board };
  L.cardPos = (cell, ind) => cardPos(L, cell, ind);
  return L;
}

/** Top-left pixel position of the card at index `ind` of pile `cell` (ind may equal Ncards: the next slot). */
export function cardPos(L, cell, ind) {
  const c = L.board.cells[cell];
  const g = L.cells[cell];
  let x = g.x0;
  let y = g.y0;
  for (let i = g.start; i < ind; i++) {
    if (c.hidden[i]) { x += g.hdx; y += g.hdy; } else { x += g.dx; y += g.dy; }
  }
  return { x, y };
}

/** Rectangle covering the whole visible pile (or the empty slot). */
export function pileRect(L, cell) {
  const c = L.board.cells[cell];
  const g = L.cells[cell];
  const a = cardPos(L, cell, g.start);
  const b = cardPos(L, cell, Math.max(g.start, c.Ncards - 1));
  if (c.dir === DIR_NO || c.Ncards <= 1) return { x: b.x, y: b.y, w: L.cardW, h: L.cardH };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + L.cardW, h: Math.abs(a.y - b.y) + L.cardH };
}

/** Topmost card or empty cell at pixel (px,py), or null. Returns { cell, ind } (ind = -1 for an empty cell). */
export function hitTest(L, px, py) {
  const cells = L.board.cells;
  const { cardW, cardH } = L;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i];
    if (c.Ncards === 0) continue;
    const g = L.cells[i];
    // later cards in a pile are painted on top, so search from the top card down
    for (let j = c.Ncards - 1; j >= g.start; j--) {
      const p = cardPos(L, i, j);
      if (px >= p.x && px < p.x + cardW && py >= p.y && py < p.y + cardH) return { cell: i, ind: j };
      if (c.dir === DIR_NO) break; // only the top card of a stacked pile is visible
    }
  }
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].Ncards !== 0) continue;
    const p = cardPos(L, i, 0);
    if (px >= p.x && px < p.x + cardW && py >= p.y && py < p.y + cardH) return { cell: i, ind: -1 };
  }
  return null;
}
