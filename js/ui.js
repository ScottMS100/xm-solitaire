// Canvas board view: drawing, touch/mouse input and card animation.
import { CELL_STOCK, cardRank, cardSuit, MOVE_UNHIDE, ANIM_RIGHTCLICK, DIR_NO } from './engine.js';
import { computeLayout, cardPos, pileRect, hitTest } from './layout.js';

const ONHID_BLOCKED = 1; // see engine.js

// CanvasRenderingContext2D.roundRect is missing in Safari before 16 (older iPads and iPhones)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, r) {
    const rr = Math.min(Array.isArray(r) ? r[0] : r, w / 2, h / 2);
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Cannot load ' + src));
    img.src = src;
  });
}

const ease = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

export class BoardView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./engine.js').Board} board
   * @param {{tapToMove:boolean, spread:number, animation:number, deck:string}} settings
   * @param {{onAction:()=>void, onWin:()=>void}} hooks
   */
  constructor(canvas, board, settings, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.board = board;
    this.settings = settings;
    this.hooks = hooks;
    this.images = null;
    this.layout = null;
    this.layoutDirty = true;
    this.flights = [];
    this.slotFlights = new Map();
    this.drag = null;
    this.press = null;
    this.reveal = null;
    this.targets = null;
    this.drawQueued = false;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.pendingFrom = null;
    this.recording = null;

    board.onAnimate = (dest, src, ind, anim) => this.onAnimate(dest, src, ind, anim);

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onCancel(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement);
  }

  /** Load (or switch to) a card deck: 'classic' (XM Solitaire's standard deck) or 'modern'. */
  async loadImages(deck = this.settings.deck) {
    if (!this.deckCache) this.deckCache = new Map();
    let d = this.deckCache.get(deck);
    if (!d) {
      const ext = deck === 'modern' ? ['png', 'jpg', 'jpg'] : ['png', 'png', 'png'];
      const [cards, back, cell] = await Promise.all([
        loadImage(`img/${deck}-cards.${ext[0]}`), loadImage(`img/${deck}-back.${ext[1]}`), loadImage(`img/${deck}-cell.${ext[2]}`),
      ]);
      d = { cards, back, cell, sprW: cards.width / 13, sprH: cards.height / 4 };
      this.deckCache.set(deck, d);
    }
    this.images = d;
    this.invalidate();
  }

  resize() {
    const p = this.canvas.parentElement;
    const w = p.clientWidth;
    const h = p.clientHeight;
    if (!w || !h) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.invalidate();
  }

  /** Call whenever the board state or a layout setting changed. */
  invalidate() {
    this.layoutDirty = true;
    this.requestDraw();
  }

  /** Forget all transient state (call when a different game is loaded). */
  reset() {
    this.flights = [];
    this.slotFlights.clear();
    this.drag = null;
    this.press = null;
    this.reveal = null;
    this.targets = null;
    this.invalidate();
  }

  getLayout() {
    if (this.layoutDirty || !this.layout) {
      this.layout = computeLayout(this.board, this.width, this.height, { spread: this.settings.spread, aspect: this.images ? this.images.sprH / this.images.sprW : 1.5 });
      this.layoutDirty = false;
    }
    return this.layout;
  }

  requestDraw() {
    if (this.drawQueued) return;
    this.drawQueued = true;
    requestAnimationFrame((t) => { this.drawQueued = false; this.draw(performance.now() || t); });
  }

  // ---- animation ---------------------------------------------------------------------------
  onAnimate(dest, src, ind) {
    if (!this.settings.animation || !this.recording || !this.width) return;
    const b = this.board;
    const L = (this.layout = computeLayout(b, this.width, this.height, { spread: this.settings.spread, aspect: this.images ? this.images.sprH / this.images.sprW : 1.5 }));
    this.layoutDirty = false;
    const sc = b.cells[src];
    const count = sc.Ncards - ind;
    if (count <= 0) return;
    const items = [];
    for (let k = 0; k < count; k++) {
      const p = this.pendingFrom ? this.pendingFrom[k] : cardPos(L, src, ind + k);
      items.push({ card: sc.cards[ind + k], hidden: !!sc.hidden[ind + k], fx: p.x, fy: p.y });
    }
    this.pendingFrom = null;
    this.recording.push({ items, dest, idx0: b.cells[dest].Ncards, t0: 0, dur: 0, src, srcInd: ind });
  }

  startFlights(list) {
    if (!list.length) return;
    const now = performance.now();
    const n = list.length;
    const dur = (this.settings.animation === 2 ? 110 : 190);
    const stagger = Math.min(this.settings.animation === 2 ? 40 : 70, 900 / n);
    list.forEach((f, i) => {
      f.t0 = now + i * stagger;
      f.dur = dur;
      // a card that was moved here by an earlier flight of the same action must wait for it to land
      for (let j = i - 1; j >= 0; j--) {
        const e = list[j];
        if (e.dest === f.src && e.idx0 + e.items.length > f.srcInd && e.idx0 <= f.srcInd) { f.t0 = Math.max(f.t0, e.t0 + e.dur); break; }
      }
    });
    for (const f of list) {
      this.flights.push(f);
      for (let k = 0; k < f.items.length; k++) this.slotFlights.set(f.dest + ':' + (f.idx0 + k), f);
    }
    this.requestDraw();
  }

  /** Run a board operation, animate whatever it moved, then autoplay (unless auto is false) and report. */
  perform(fn, auto = true) {
    const wasFinished = this.board.finished;
    this.recording = [];
    let result;
    try {
      result = fn();
      if (auto) this.board.autoPlay();
    } finally {
      const list = this.recording;
      this.recording = null;
      this.pendingFrom = null;
      this.invalidate();
      this.startFlights(list);
    }
    this.hooks.onAction();
    if (auto && !wasFinished && this.board.finished) this.hooks.onWin();
    return result;
  }

  // ---- input -----------------------------------------------------------------------------
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    if (e.button !== undefined && e.button > 0 && e.pointerType === 'mouse') {
      // right button: smart move, like XM Solitaire
      if (e.button === 2 && !this.board.finished) {
        const { x, y } = this.local(e);
        const hit = hitTest(this.getLayout(), x, y);
        if (hit && hit.ind >= 0) this.smartMove(hit);
      }
      return;
    }
    if (this.drag || this.press) return;
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    const { x, y } = this.local(e);
    const hit = this.board.finished ? null : hitTest(this.getLayout(), x, y);
    this.press = { id: e.pointerId, x, y, hit, moved: false, long: false, timer: null };
    if (hit && hit.ind >= 0) {
      const c = this.board.cells[hit.cell];
      if (c.type !== CELL_STOCK && !c.hidden[hit.ind]) {
        this.press.timer = setTimeout(() => {
          if (!this.press || this.press.moved) return;
          this.press.long = true;
          this.reveal = { cell: hit.cell, ind: hit.ind };
          this.requestDraw();
        }, 450);
      }
    }
  }

  onMove(e) {
    const { x, y } = this.local(e);
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    if (this.drag) {
      this.drag.x = x - this.drag.offX;
      this.drag.y = y - this.drag.offY;
      this.updateTargets();
      this.requestDraw();
      return;
    }
    if (p.moved || p.long) return;
    if (Math.hypot(x - p.x, y - p.y) < 8) return;
    p.moved = true;
    clearTimeout(p.timer);
    const hit = p.hit;
    if (!hit || hit.ind < 0) return;
    const b = this.board;
    const c = b.cells[hit.cell];
    if (c.type === CELL_STOCK) return;
    if (!this.canDrag(hit.cell, hit.ind)) return;
    const L = this.getLayout();
    const pos = cardPos(L, hit.cell, hit.ind);
    this.drag = {
      cell: hit.cell, ind: hit.ind, count: c.Ncards - hit.ind,
      offX: p.x - pos.x, offY: p.y - pos.y, x: x - (p.x - pos.x), y: y - (p.y - pos.y),
    };
    this.updateTargets();
    this.requestDraw();
  }

  // is there any pile this group could possibly go to? (XM's testDrag)
  canDrag(cell, ind) {
    const b = this.board;
    const c = b.cells[cell];
    for (let i = ind; i < c.Ncards; i++) if (c.hidden[i]) return false;
    for (let i = 0; i < b.cells.length; i++) if (b.testMove(i, cell, ind, 1)) return true;
    return false;
  }

  updateTargets() {
    const d = this.drag;
    const b = this.board;
    const L = this.getLayout();
    const list = [];
    const dr = { x: d.x, y: d.y, w: L.cardW, h: L.cardH };
    let best = -1;
    let bestA = L.cardW * L.cardH * 0.12;
    for (let i = 0; i < b.cells.length; i++) {
      if (i === d.cell || !b.testMove(i, d.cell, d.ind)) continue;
      const r = pileRect(L, i);
      list.push({ cell: i, rect: r });
      const ox = Math.min(dr.x + dr.w, r.x + r.w) - Math.max(dr.x, r.x);
      const oy = Math.min(dr.y + dr.h, r.y + r.h) - Math.max(dr.y, r.y);
      if (ox > 0 && oy > 0 && ox * oy > bestA) { bestA = ox * oy; best = i; }
    }
    this.targets = { list, best };
  }

  onUp(e) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    clearTimeout(p.timer);
    this.press = null;
    const wasReveal = !!this.reveal;
    this.reveal = null;
    if (this.drag) {
      this.drop();
      return;
    }
    if (wasReveal) { this.requestDraw(); return; }
    if (!p.moved && p.hit) this.tap(p.hit);
    this.requestDraw();
  }

  onCancel(e) {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    clearTimeout(p.timer);
    this.press = null;
    this.reveal = null;
    if (this.drag) this.snapBack();
    this.requestDraw();
  }

  snapBack() {
    const d = this.drag;
    this.drag = null;
    this.targets = null;
    const b = this.board;
    const c = b.cells[d.cell];
    const items = [];
    for (let k = 0; k < d.count; k++) {
      const p = this.dragPos(d, k);
      items.push({ card: c.cards[d.ind + k], hidden: false, fx: p.x, fy: p.y });
    }
    if (this.settings.animation) this.startFlights([{ items, dest: d.cell, idx0: d.ind, src: -1, srcInd: 0 }]);
    this.requestDraw();
  }

  dragPos(d, k) {
    const L = this.getLayout();
    const g = L.cells[d.cell];
    const p0 = cardPos(L, d.cell, d.ind);
    const p1 = cardPos(L, d.cell, d.ind + k);
    void g;
    return { x: d.x + (p1.x - p0.x), y: d.y + (p1.y - p0.y) };
  }

  drop() {
    const d = this.drag;
    const best = this.targets ? this.targets.best : -1;
    if (best < 0) { this.snapBack(); return; }
    const positions = [];
    for (let k = 0; k < d.count; k++) positions.push(this.dragPos(d, k));
    this.drag = null;
    this.targets = null;
    this.perform(() => {
      this.pendingFrom = positions;
      const n = this.board.animMove(best, d.cell, d.ind, ANIM_RIGHTCLICK);
      this.pendingFrom = null;
      return n;
    });
  }

  smartMove(hit) {
    this.perform(() => this.board.rightclkMove(hit.cell, hit.ind));
  }

  tap(hit) {
    const b = this.board;
    if (b.finished) return;
    const c = b.cells[hit.cell];
    if (c.type === CELL_STOCK) {
      this.perform(() => b.stockClick(hit.cell));
      return;
    }
    if (hit.ind < 0) return;
    // turn over a face-down top card (Blind Patience)
    if (c.hidden[hit.ind] && hit.ind === c.Ncards - 1 && c.onhid !== ONHID_BLOCKED) {
      this.perform(() => b.move(hit.cell, hit.cell, MOVE_UNHIDE));
      return;
    }
    if (c.hidden[hit.ind]) return;
    if (this.settings.tapToMove) this.smartMove(hit);
    else this.perform(() => b.dblclkMove(hit.cell));
  }

  // ---- drawing ---------------------------------------------------------------------------
  drawCard(card, hidden, x, y, w, h, lift) {
    const ctx = this.ctx;
    const im = this.images;
    const r = Math.max(2, w * 0.08);
    ctx.save();
    if (lift) {
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 10 * this.dpr;
      ctx.shadowOffsetY = 3 * this.dpr;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      ctx.shadowColor = 'transparent';
    }
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.clip();
    if (hidden || !card) {
      ctx.drawImage(im.back, 0, 0, im.back.width, im.back.height, x, y, w, h);
    } else {
      ctx.drawImage(im.cards, (cardRank(card) - 1) * im.sprW, cardSuit(card) * im.sprH, im.sprW, im.sprH, x, y, w, h);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
  }

  drawEmpty(c, x, y, w, h) {
    const k = this.board.emptyCellKind(c);
    const idx = k.kind === 'redeal' ? 15 : k.kind === 'rank' ? k.rank - 1 : k.kind === 'blocked' ? 14 : 13;
    const im = this.images.cell;
    const sw = im.width / 16;
    this.ctx.globalAlpha = 0.9;
    this.ctx.drawImage(im, idx * sw, 0, sw, im.height, x, y, w, h);
    this.ctx.globalAlpha = 1;
  }

  draw(now) {
    const ctx = this.ctx;
    if (!this.images || !this.width) return;
    const b = this.board;
    if (!b.game) return;
    const L = this.getLayout();
    const { cardW, cardH } = L;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // flights that are still active (and drop the finished ones)
    let animating = false;
    if (this.flights.length) {
      const keep = [];
      for (const f of this.flights) {
        if (now < f.t0 + f.dur) { keep.push(f); animating = true; } else {
          for (let k = 0; k < f.items.length; k++) {
            const key = f.dest + ':' + (f.idx0 + k);
            if (this.slotFlights.get(key) === f) this.slotFlights.delete(key);
          }
        }
      }
      this.flights = keep;
    }
    const drag = this.drag;

    // empty piles
    for (let i = 0; i < b.cells.length; i++) {
      const c = b.cells[i];
      if (c.Ncards !== 0) continue;
      const p = cardPos(L, i, 0);
      this.drawEmpty(c, p.x, p.y, cardW, cardH);
    }
    // cards
    for (let i = 0; i < b.cells.length; i++) {
      const c = b.cells[i];
      const g = L.cells[i];
      let first = g.start;
      if (c.dir === DIR_NO) first = Math.max(g.start, c.Ncards - 1);
      for (let j = first; j < c.Ncards; j++) {
        if (drag && i === drag.cell && j >= drag.ind) break;
        const fl = this.slotFlights.get(i + ':' + j);
        if (fl && now < fl.t0 + fl.dur) {
          const it = fl.items[j - fl.idx0];
          if (it && it.card === c.cards[j]) continue;
        }
        const p = cardPos(L, i, j);
        this.drawCard(c.cards[j], c.hidden[j], p.x, p.y, cardW, cardH, false);
      }
    }
    // legal destinations while dragging
    if (drag && this.targets) {
      ctx.lineWidth = 3;
      for (const t of this.targets.list) {
        const r = t.rect;
        const bestOne = t.cell === this.targets.best;
        ctx.strokeStyle = bestOne ? 'rgba(255,235,59,0.95)' : 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 7);
        ctx.stroke();
      }
    }
    // flying cards
    for (const f of this.flights) {
      const t = Math.min(1, Math.max(0, (now - f.t0) / f.dur));
      const e = ease(t);
      for (let k = 0; k < f.items.length; k++) {
        const it = f.items[k];
        const idx = f.idx0 + k;
        const dc = b.cells[f.dest];
        let to;
        if (idx < dc.Ncards) to = cardPos(L, f.dest, idx); else to = cardPos(L, f.dest, Math.min(idx, dc.Ncards));
        // cards that are face-down in their destination (e.g. stock) are shown face-down when they land
        const hid = idx < dc.Ncards ? !!dc.hidden[idx] : it.hidden;
        const x = it.fx + (to.x - it.fx) * e;
        const y = it.fy + (to.y - it.fy) * e;
        this.drawCard(it.card, t > 0.5 ? hid : it.hidden, x, y, cardW, cardH, t > 0 && t < 1);
      }
    }
    // dragged cards
    if (drag) {
      const c = b.cells[drag.cell];
      for (let k = 0; k < drag.count; k++) {
        const p = this.dragPos(drag, k);
        this.drawCard(c.cards[drag.ind + k], false, p.x, p.y, cardW, cardH, true);
      }
    }
    // card shown by long press
    if (this.reveal) {
      const c = b.cells[this.reveal.cell];
      if (this.reveal.ind < c.Ncards) {
        const p = cardPos(L, this.reveal.cell, this.reveal.ind);
        const x = Math.min(Math.max(2, p.x - cardW * 0.25), this.width - cardW * 1.5 - 2);
        const y = Math.max(2, p.y - cardH * 0.25);
        this.drawCard(c.cards[this.reveal.ind], false, x, y, cardW * 1.5, cardH * 1.5, true);
      }
    }
    if (animating) this.requestDraw();
  }
}
