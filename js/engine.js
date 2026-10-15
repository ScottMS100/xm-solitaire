/*
 * Rules engine for the XM Solitaire PWA.
 *
 * This is a JavaScript port of the game logic of XM Solitaire (game.cpp / xmsol.h)
 * by Petr Lastovicka, released under the GNU General Public License.
 * Original project: https://sourceforge.net/projects/xmsol/  https://github.com/plastovicka/xmsol
 * This port is therefore also distributed under the GPL (see LICENSE).
 *
 * Game rules are read from XM Solitaire's XML rule format, so every game written for
 * XM Solitaire works here unchanged.
 */
import { parseXml } from './xml.js';

// ---- bit-packed rule constants (identical to xmsol.h) ---------------------------------
export const MCARDS = 4 * 52;
const CARD_SUIT_MASK = 0x30, CARD_SUIT_ROT = 4, CARD_COLOR = 2, CARD_RANK_MASK = 0x0f;
export const cardSuit = (c) => (c & CARD_SUIT_MASK) >> CARD_SUIT_ROT;
export const cardRank = (c) => c & CARD_RANK_MASK;
const makeCard = (rank, suit) => (rank | (suit << CARD_SUIT_ROT));
const makeCardStart = (d) => makeCard((d % 13) + 1, Math.floor(d / 13) % 4);

export const HEART = 0, DIAMOND = 1, CLUB = 2, SPADE = 3;
const RANK_ROT = 0, RANK_MASK = 0xff, RANK_NO = 14, RANK_RANDOM = 15, RANK_RANDOMPLUS1 = 16, RANK_SAMEBASE = 17, RANK_KING4 = 18, RANK_AK = 19;
const CLR_ROT = 8, CLR_MASK = 0xf00, CLR_HEART = 1, CLR_DIAMOND = 2, CLR_CLUB = 3, CLR_SPADE = 4, CLR_RED = 5, CLR_BLACK = 6, CLR_HDCS = 7, CLR_HSDC = 8, CLR_CDHS = 9;
const SUIT_ROT = 12, SUIT_MASK = 0xf000, SUIT_SAME = 1, SUIT_DIFF = 2, SUIT_SAMECOLOR = 3, SUIT_DIFFCOLOR = 4;
const SEQ_ROT = 16, SEQ_MASK = 0xf0000, CONT_ROT = 20, CONT_MASK = 0x100000, SEQ1_MASK = 0x1f0000;
const SEQ_NO = 1, SEQ_DOWN = 2, SEQ_UP = 3, SEQ_UPDOWN = 4, SEQ_DOWN2 = 5, SEQ_UP2 = 6, SEQ_UPDOWN2 = 7, SEQ_RANK = 8,
  SEQ_UPDOWNRANK = 9, SEQ_OSMOSIS = 10, SEQ_SYNCH = 11, SEQ_HIGHER = 12, SEQ_LOWER = 13, SEQ_UPRANK = 14, SEQ_DOWNRANK = 15;
const GROUP_ROT = 21, GROUP_MASK = 0xe00000;
const GROUP_NO = 1, GROUP_NOEMPTY = 2, GROUP_ANYSEQ = 3, GROUP_ALL = 4, GROUP_TOEMPTY = 5, GROUP_ANYFREECELLSEQ = 6, GROUP_PILE = 7;
const DEST_ROT = 25, DEST_MASK = 0x7e000000;
export const CELL_CELL = 0, CELL_FOUNDATION = 1, CELL_TABLEAU = 2, CELL_RESERVE = 3, CELL_STOCK = 4, CELL_WASTE = 5;
export const DIR_NO = 0, DIR_DOWN = 1, DIR_RIGHT = 2, DIR_UP = 3, DIR_LEFT = 4;
const PREV_DOWN = 256, PREV_RIGHT = 257, PREV_UP = 258, PREV_LEFT = 259;
const HIDE_ALL = 256, HIDE_ODD = 257, HIDE_EVEN = 258;
const SHAPE_LEFT = 0, SHAPE_RIGHT = 1, SHAPE_CENTER = 2, SHAPE_INCR = 3, SHAPE_DECR = 4, SHAPE_INCR2 = 5, SHAPE_DECR2 = 6,
  SHAPE_FIRST = 7, SHAPE_LAST = 8, SHAPE_PYRAMID = 9, SHAPE_BRAID = 10, SHAPE_BIND = 11, SHAPE_SIDE = 12;
const DEAL_FILL = 256, DEAL_GAPS = 257, DEAL_BOTTOMTOTOP = 258, DEAL_MAX = 259, DEAL_START = 260, DEAL_START_COL = 261, DEAL_START1 = 262;
const PAIR_SUIT = 256, PAIR_RANK = 257, PAIR_RANKCOLOR = 258;
export const ANIM_NO = 0, ANIM_RIGHTCLICK = 1, ANIM_AUTOPLAY = 2, ANIM_UNDO = 3, ANIM_STOCK = 4;
const SHUFFLE_RAND = 1;
const UNDER_NEXT = 257, UNDER_NEXT1 = 258, UNDER_WASTE = 259;
const AUTO_NO = 0, AUTO_YES = 1, AUTO_BASE = 2;
const MOVE_FIRST = 252, MOVE_UNHIDE = 253, MOVE_HIDE = 254, MOVE_SHUFFLE = 255;
const ONHID_AUTO = 0, ONHID_BLOCKED = 1, ONHID_ANY = 2, ONHID_K = 3;

// ---- rule words ---------------------------------------------------------------------
const W = (name, value, mask, rot) => [name, value, mask, rot];
const WORDS = new Map([
  W('a', 1, RANK_MASK, RANK_ROT), W('2', 2, RANK_MASK, RANK_ROT), W('3', 3, RANK_MASK, RANK_ROT), W('4', 4, RANK_MASK, RANK_ROT),
  W('5', 5, RANK_MASK, RANK_ROT), W('6', 6, RANK_MASK, RANK_ROT), W('7', 7, RANK_MASK, RANK_ROT), W('8', 8, RANK_MASK, RANK_ROT),
  W('9', 9, RANK_MASK, RANK_ROT), W('10', 10, RANK_MASK, RANK_ROT), W('j', 11, RANK_MASK, RANK_ROT), W('q', 12, RANK_MASK, RANK_ROT),
  W('k', 13, RANK_MASK, RANK_ROT), W('no', RANK_NO, RANK_MASK, RANK_ROT), W('rand', RANK_RANDOM, RANK_MASK, RANK_ROT),
  W('rand+1', RANK_RANDOMPLUS1, RANK_MASK, RANK_ROT), W('base', RANK_SAMEBASE, RANK_MASK, RANK_ROT),
  W('anyrank', 0, RANK_MASK, RANK_ROT), W('king4', RANK_KING4, RANK_MASK, RANK_ROT), W('ak', RANK_AK, RANK_MASK, RANK_ROT),

  W('anysuit', 0, SUIT_MASK, SUIT_ROT), W('suit', SUIT_SAME, SUIT_MASK, SUIT_ROT), W('diffsuit', SUIT_DIFF, SUIT_MASK, SUIT_ROT),
  W('color', SUIT_SAMECOLOR, SUIT_MASK, SUIT_ROT), W('alter', SUIT_DIFFCOLOR, SUIT_MASK, SUIT_ROT),

  W('anyseq', 0, SEQ1_MASK, SEQ_ROT), W('noseq', SEQ_NO, SEQ1_MASK, SEQ_ROT), W('rank', SEQ_RANK, SEQ1_MASK, SEQ_ROT),
  W('down', SEQ_DOWN, SEQ_MASK, SEQ_ROT), W('up', SEQ_UP, SEQ_MASK, SEQ_ROT), W('updown', SEQ_UPDOWN, SEQ_MASK, SEQ_ROT),
  W('down2', SEQ_DOWN2, SEQ_MASK, SEQ_ROT), W('up2', SEQ_UP2, SEQ_MASK, SEQ_ROT), W('updown2', SEQ_UPDOWN2, SEQ_MASK, SEQ_ROT),
  W('updownequ', SEQ_UPDOWNRANK, SEQ_MASK, SEQ_ROT), W('osmosis', SEQ_OSMOSIS, SEQ_MASK, SEQ_ROT), W('synch', SEQ_SYNCH, SEQ_MASK, SEQ_ROT),
  W('lower', SEQ_LOWER, SEQ_MASK, SEQ_ROT), W('higher', SEQ_HIGHER, SEQ_MASK, SEQ_ROT), W('upequ', SEQ_UPRANK, SEQ_MASK, SEQ_ROT),
  W('downequ', SEQ_DOWNRANK, SEQ_MASK, SEQ_ROT), W('cont', 1, CONT_MASK, CONT_ROT),

  W('group', 0, GROUP_MASK, GROUP_ROT), W('all', GROUP_ALL, GROUP_MASK, GROUP_ROT), W('nogroup', GROUP_NO, GROUP_MASK, GROUP_ROT),
  W('noempty', GROUP_NOEMPTY, GROUP_MASK, GROUP_ROT), W('anygroup', GROUP_ANYSEQ, GROUP_MASK, GROUP_ROT),
  W('pilegroup', GROUP_PILE, GROUP_MASK, GROUP_ROT), W('fillempty', GROUP_TOEMPTY, GROUP_MASK, GROUP_ROT),
  W('anygroupfreecell', GROUP_ANYFREECELLSEQ, GROUP_MASK, GROUP_ROT),

  W('stock', 1, 1 << (CELL_STOCK + DEST_ROT), CELL_STOCK + DEST_ROT), W('reserve', 1, 1 << (CELL_RESERVE + DEST_ROT), CELL_RESERVE + DEST_ROT),
  W('tableau', 1, 1 << (CELL_TABLEAU + DEST_ROT), CELL_TABLEAU + DEST_ROT), W('waste', 1, 1 << (CELL_WASTE + DEST_ROT), CELL_WASTE + DEST_ROT),
  W('foundation', 1, 1 << (CELL_FOUNDATION + DEST_ROT), CELL_FOUNDATION + DEST_ROT), W('cell', 1, 1 << (CELL_CELL + DEST_ROT), CELL_CELL + DEST_ROT),

  W('spade', CLR_SPADE, CLR_MASK, CLR_ROT), W('s', CLR_SPADE, CLR_MASK, CLR_ROT), W('club', CLR_CLUB, CLR_MASK, CLR_ROT), W('c', CLR_CLUB, CLR_MASK, CLR_ROT),
  W('heart', CLR_HEART, CLR_MASK, CLR_ROT), W('h', CLR_HEART, CLR_MASK, CLR_ROT), W('diamond', CLR_DIAMOND, CLR_MASK, CLR_ROT), W('d', CLR_DIAMOND, CLR_MASK, CLR_ROT),
  W('red', CLR_RED, CLR_MASK, CLR_ROT), W('black', CLR_BLACK, CLR_MASK, CLR_ROT), W('hdcs', CLR_HDCS, CLR_MASK, CLR_ROT),
  W('hsdc', CLR_HSDC, CLR_MASK, CLR_ROT), W('cdhs', CLR_CDHS, CLR_MASK, CLR_ROT), W('anycolor', 0, CLR_MASK, CLR_ROT),
].map((w) => [w[0], w]));

const indHDCS = [CLR_HDCS << CLR_ROT, CLR_HSDC << CLR_ROT, CLR_CDHS << CLR_ROT];
const HDCS = [
  [CLR_HEART << CLR_ROT, CLR_DIAMOND << CLR_ROT, CLR_CLUB << CLR_ROT, CLR_SPADE << CLR_ROT],
  [CLR_HEART << CLR_ROT, CLR_SPADE << CLR_ROT, CLR_DIAMOND << CLR_ROT, CLR_CLUB << CLR_ROT],
  [CLR_CLUB << CLR_ROT, CLR_DIAMOND << CLR_ROT, CLR_HEART << CLR_ROT, CLR_SPADE << CLR_ROT],
];

function parseRule(text, warn) {
  let mask = 0;
  let rule = 0;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const w = WORDS.get(word);
    if (!w) { warn?.(`Unknown word "${word}"`); continue; }
    rule |= w[1] << w[3];
    if (mask & w[2]) warn?.(`Rules overlap at "${word}"`);
    mask |= w[2];
  }
  return { rule, mask };
}

const atoi = (v) => parseInt(v, 10) || 0;

// ---- game definitions ---------------------------------------------------------------
function newCellDef(type) {
  const c = {
    type, x: 0, y: 0, startCount: 0, hideStyle: 0, onhid: 0, redeal: 0, shuffle: 0, deal: 0, fill: 0, blockedBy: [0, 0],
    startRule: 0, inRule: 0, outRule: 0, sameRule: 0, prevRule: 0,
    shape: SHAPE_LEFT, autoplay: 1, dir: DIR_NO, spacing: 100, prevDir: PREV_LEFT, maxCount: 255, maxShow: 255,
    w: 1000, h: 1000, repeat: 1, lines: 1,
  };
  switch (type) {
    case CELL_TABLEAU: c.dir = DIR_DOWN; c.y = 320; c.startCount = 0x7fff; c.inRule = SEQ_DOWN << SEQ_ROT; break;
    case CELL_FOUNDATION: c.inRule = (SEQ_UP << SEQ_ROT) | (SUIT_SAME << SUIT_ROT) | (1 << RANK_ROT); break;
    case CELL_RESERVE: c.inRule = (SEQ_NO << SEQ_ROT) | (RANK_NO << RANK_ROT); break;
    case CELL_CELL: c.inRule = SEQ_NO << SEQ_ROT; break;
    case CELL_WASTE: c.inRule = 1 << (CELL_STOCK + DEST_ROT); break;
    case CELL_STOCK:
      c.startCount = 0x7fff; c.inRule = (SEQ_NO << SEQ_ROT) | (RANK_NO << RANK_ROT); c.hideStyle = HIDE_ALL; c.onhid = ONHID_BLOCKED; c.deal = 1;
      break;
  }
  c.inRule |= GROUP_NO << GROUP_ROT;
  return c;
}

const DIRS = { left: DIR_LEFT, right: DIR_RIGHT, up: DIR_UP, down: DIR_DOWN, no: DIR_NO };
const PREVS = { left: PREV_LEFT, right: PREV_RIGHT, up: PREV_UP, down: PREV_DOWN };
const SHAPES = {
  incr: SHAPE_INCR, decr: SHAPE_DECR, incr2: SHAPE_INCR2, decr2: SHAPE_DECR2, pyramid: SHAPE_PYRAMID, braid: SHAPE_BRAID,
  bind: SHAPE_BIND, left: SHAPE_LEFT, right: SHAPE_RIGHT, center: SHAPE_CENTER, side: SHAPE_SIDE, first: SHAPE_FIRST, last: SHAPE_LAST,
};

function setCellAttr(c, name, value, warn) {
  const i = atoi(value);
  switch (name) {
    case 'x': c.x = i; break;
    case 'y': c.y = i; break;
    case 'w': c.w = i; break;
    case 'h': c.h = i; break;
    case 'repeat': c.repeat = i; break;
    case 'lines': c.lines = i; break;
    case 'count': c.startCount = i; break;
    case 'max': c.maxCount = i; break;
    case 'autoplay': c.autoplay = value === 'base' ? AUTO_BASE : i; break;
    case 'deal':
      c.deal = i;
      if (value === 'fill') { c.deal = DEAL_FILL; if (!c.fill) c.fill = 1; }
      if (value === 'gaps') c.deal = DEAL_GAPS;
      if (value === 'bottomtotop') c.deal = DEAL_BOTTOMTOTOP;
      if (value === 'max') c.deal = DEAL_MAX;
      if (value === 'start') c.deal = DEAL_START;
      if (value === 'start1') c.deal = DEAL_START1;
      if (value === 'start_col') c.deal = DEAL_START_COL;
      break;
    case 'fill': c.fill = i; break;
    case 'redeal': c.redeal = value === 'inf' ? 0x7fffffff : i; break;
    case 'shuffle': if (value === 'rand') c.shuffle = SHUFFLE_RAND; break;
    case 'dir': if (value in DIRS) c.dir = DIRS[value]; break;
    case 'spacing': c.spacing = i; break;
    case 'prev': c.prevDir = value in PREVS ? PREVS[value] : i; break;
    case 'hide':
      c.hideStyle = i;
      if (value === 'all') c.hideStyle = HIDE_ALL;
      if (value === 'odd') c.hideStyle = HIDE_ODD;
      if (value === 'even') c.hideStyle = HIDE_EVEN;
      break;
    case 'onhid':
      if (value === 'any') c.onhid = ONHID_ANY;
      if (value === 'k') c.onhid = ONHID_K;
      break;
    case 'shape': if (value in SHAPES) c.shape = SHAPES[value]; break;
    case 'under':
    case 'under2': {
      const k = name === 'under2' ? 0 : 1;
      c.blockedBy[k] = i;
      if (value === 'next') c.blockedBy[k] = UNDER_NEXT;
      if (value === 'next+1') c.blockedBy[k] = UNDER_NEXT1;
      if (value === 'waste') c.blockedBy[k] = UNDER_WASTE;
      break;
    }
    case 'show': c.maxShow = i; break;
    default: warn?.(`Unknown attribute "${name}"`);
  }
}

const CELL_TAGS = { cell: CELL_CELL, foundation: CELL_FOUNDATION, tableau: CELL_TABLEAU, reserve: CELL_RESERVE, stock: CELL_STOCK, waste: CELL_WASTE };

function buildGame(el, warn) {
  const g = { name: 'Unknown', pair: 0, decks: 1, suit: 0xf, rank: 0x1fff, autoplay: 1, cells: [] };
  for (const [attr, value] of Object.entries(el.attrs)) {
    const i = atoi(value);
    if (attr === 'name') g.name = value;
    else if (attr === 'decks') g.decks = i;
    else if (attr === 'autoplay') g.autoplay = i;
    else if (attr === 'pair') {
      g.pair = i;
      if (value === 'suit') g.pair = PAIR_SUIT;
      if (value === 'rank') g.pair = PAIR_RANK;
      if (value === 'rankcolor') g.pair = PAIR_RANKCOLOR;
    } else if (attr === 'suit') {
      g.suit = 0;
      for (const ch of value) g.suit |= ({ s: 1 << SPADE, c: 1 << CLUB, h: 1 << HEART, d: 1 << DIAMOND })[ch] || 0;
    } else if (attr === 'rank') {
      g.rank = 0;
      for (let k = 0; k < value.length; k++) {
        const ch = value[k];
        let b = 0;
        if (ch === 'a') b = 1;
        if (ch >= '2' && ch <= '9') b = 1 << (ch.charCodeAt(0) - 48 - 1);
        if (ch === '1' && value[k + 1] === '0') { b = 1 << 9; k++; }
        if (ch === 'j') b = 1 << 10;
        if (ch === 'q') b = 1 << 11;
        if (ch === 'k') b = 1 << 12;
        g.rank |= b;
      }
    } else warn?.(`Unknown attribute "${attr}"`);
  }
  for (const ch of el.children) {
    if (!(ch.name in CELL_TAGS)) { warn?.(`Unknown element "${ch.name}"`); continue; }
    const c = newCellDef(CELL_TAGS[ch.name]);
    for (const [a, v] of Object.entries(ch.attrs)) setCellAttr(c, a, v, warn);
    const t = parseRule(ch.text, warn);
    c.inRule = (c.inRule & ~t.mask) | t.rule;
    for (const sub of ch.children) {
      const r = parseRule(sub.text, warn).rule;
      if (sub.name === 'init') c.startRule = r;
      else if (sub.name === 'out') c.outRule = r;
      else if (sub.name === 'same') c.sameRule = r;
      else if (sub.name === 'prev') c.prevRule = r;
      else warn?.(`Unknown element "${sub.name}"`);
    }
    g.cells.push(c);
  }
  return checkGame(g) ? g : null;
}

const nsuit = (g) => ((g.suit & 1) ? 1 : 0) + ((g.suit & 2) ? 1 : 0) + ((g.suit & 4) ? 1 : 0) + ((g.suit & 8) ? 1 : 0);
const nrank = (g) => { let n = 0; for (let i = 1; i < (1 << 13); i <<= 1) if (g.rank & i) n++; return n; };

function checkGame(g) {
  if (g.cells.length === 0) return false;
  if (g.pair) {
    for (const c of g.cells) {
      if (c.type === CELL_FOUNDATION) { c.inRule = (RANK_NO << RANK_ROT) | (SEQ_NO << SEQ_ROT); break; }
    }
  }
  const suits = nsuit(g);
  const ranks = nrank(g);
  g.cardCount = g.decks * ranks * suits;
  for (const c of g.cells) {
    c.w = Math.min(c.w, 1000 - c.x);
    c.h = Math.min(c.h, 1000 - c.y);
    if (c.lines > 1 && c.repeat === 1) c.repeat = c.lines;
    if (c.dir === DIR_NO && (c.outRule & GROUP_MASK) === 0) c.outRule |= GROUP_NO << GROUP_ROT;
    if (((c.prevRule & SEQ_MASK) === (SEQ_SYNCH << SEQ_ROT) || (c.prevRule & SEQ_MASK) === (SEQ_OSMOSIS << SEQ_ROT)) &&
      (c.prevRule & RANK_MASK) === 0) c.prevRule |= RANK_NO << RANK_ROT;
    if (c.type === CELL_FOUNDATION) {
      if ((c.inRule & CONT_MASK) && c.repeat === g.decks * suits && c.maxCount === 255 &&
        (g.decks > 1 || (c.inRule & SUIT_MASK) !== (SUIT_SAME << SUIT_ROT))) c.maxCount = ranks;
    }
  }
  g.nsuit = suits;
  g.nrank = ranks;
  return true;
}

/** Parse an XM Solitaire rules file. Returns { games, warnings }. */
export function parseRules(xmlText) {
  const warnings = [];
  const games = [];
  const root = parseXml(xmlText);
  const top = root.children.find((e) => e.name === 'xmsol');
  if (!top) return { games, warnings: ['Missing <xmsol> element'] };
  for (const el of top.children) {
    if (el.name !== 'game') { warnings.push(`Unknown element "${el.name}"`); continue; }
    const label = el.attrs.name || '?';
    const g = buildGame(el, (m) => warnings.push(`${label}: ${m}`));
    if (g) games.push(g);
  }
  return { games, warnings };
}

// ---- the board ----------------------------------------------------------------------
function seqTest(rule, destCard, srcCard, prevCell) {
  const r = cardRank(destCard);
  const r1 = cardRank(srcCard);
  const isCont = rule & CONT_MASK;
  switch ((rule & SEQ_MASK) >> SEQ_ROT) {
    case SEQ_NO: return 0;
    case SEQ_UP: if (r1 !== r + 1 && (!isCont || r1 !== r - 12)) return 0; break;
    case SEQ_DOWN: if (r1 !== r - 1 && (!isCont || r1 !== r + 12)) return 0; break;
    case SEQ_UPDOWN: if (r1 !== r + 1 && r1 !== r - 1 && (!isCont || (r1 !== r - 12 && r1 !== r + 12))) return 0; break;
    case SEQ_UPDOWNRANK: if (r1 !== r && r1 !== r + 1 && r1 !== r - 1 && (!isCont || (r1 !== r - 12 && r1 !== r + 12))) return 0; break;
    case SEQ_UPRANK: if (r1 !== r + 1 && r1 !== r && (!isCont || r1 !== r - 12)) return 0; break;
    case SEQ_DOWNRANK: if (r1 !== r - 1 && r1 !== r && (!isCont || r1 !== r + 12)) return 0; break;
    case SEQ_UP2: if (r1 !== r + 2 && (!isCont || r1 !== r - 11)) return 0; break;
    case SEQ_DOWN2: if (r1 !== r - 2 && (!isCont || r1 !== r + 11)) return 0; break;
    case SEQ_UPDOWN2: if (r1 !== r + 2 && r1 !== r - 2 && (!isCont || (r1 !== r - 11 && r1 !== r + 11))) return 0; break;
    case SEQ_HIGHER: if (r1 <= r) return 0; break;
    case SEQ_LOWER: if (r1 >= r) return 0; break;
    case SEQ_RANK: if (r1 !== r) return 0; break;
    case SEQ_OSMOSIS:
      if (prevCell) {
        let j = prevCell.Ncards - 1;
        for (;; j--) {
          if (j < 0) return 0;
          if (cardRank(prevCell.cards[j]) === r1) break;
        }
      }
      break;
    case SEQ_SYNCH:
      if (prevCell && prevCell.Ncards !== (prevCell.maxCount < 255 ? prevCell.maxCount : 13)) return 0;
      break;
  }
  return 1;
}

function suitTest(rule, destCard, srcCard) {
  const s = cardSuit(destCard);
  const s1 = cardSuit(srcCard);
  switch ((rule & SUIT_MASK) >> SUIT_ROT) {
    case SUIT_SAME: if (s1 !== s) return 0; break;
    case SUIT_DIFF: if (s1 === s) return 0; break;
    case SUIT_SAMECOLOR: if ((s1 & CARD_COLOR) !== (s & CARD_COLOR)) return 0; break;
    case SUIT_DIFFCOLOR: if ((s1 & CARD_COLOR) === (s & CARD_COLOR)) return 0; break;
  }
  return 1;
}

function colorTest(rule, card) {
  const s = (rule & CLR_MASK) >> CLR_ROT;
  if (s) {
    const s1 = cardSuit(card);
    switch (s) {
      case CLR_HEART: if (s1 !== HEART) return 0; break;
      case CLR_DIAMOND: if (s1 !== DIAMOND) return 0; break;
      case CLR_CLUB: if (s1 !== CLUB) return 0; break;
      case CLR_SPADE: if (s1 !== SPADE) return 0; break;
      case CLR_RED: if (s1 !== HEART && s1 !== DIAMOND) return 0; break;
      case CLR_BLACK: if (s1 !== SPADE && s1 !== CLUB) return 0; break;
    }
  }
  return 1;
}

const isKing4 = (c) => (c.inRule & RANK_MASK) === (RANK_KING4 << RANK_ROT);
const isSameBase = (c) => (c.inRule & RANK_MASK) === (RANK_SAMEBASE << RANK_ROT);

function testHide(c, ind, N) {
  switch (c.hideStyle) {
    case HIDE_ALL: return true;
    case HIDE_ODD: return (ind & 1) === 0;
    case HIDE_EVEN: return (ind & 1) !== 0;
    default: return ind < (c.hideStyle < 0 ? N + c.hideStyle : c.hideStyle);
  }
}

// evalMove: 0 is the best, 7 is the worst
function evalMove(c, srcCell, srcCard) {
  if (c.Ncards > 0 && !c.hidden[c.Ncards - 1]) {
    if ((c.inRule & SEQ_MASK) === 0) return 3;
    if (c.type === CELL_FOUNDATION || srcCell.type === CELL_FOUNDATION) {
      if (srcCell.type === c.type) return 2;
      return 0;
    }
    if ((c.outRule & SUIT_MASK) === (SUIT_SAME << SUIT_ROT)) { // Spider
      if ((srcCard ^ c.cards[c.Ncards - 1]) & CARD_SUIT_MASK) return 2;
    } else if (srcCell.type !== c.type) return 2;
    return 1;
  }
  if (c.type === CELL_FOUNDATION && (c.inRule & RANK_MASK) === 0) return 7;
  if (c.type === CELL_CELL) return 6;
  if (c.type === CELL_FOUNDATION) return 4;
  return 5;
}

export class Board {
  constructor() {
    this.cells = [];
    this.game = null;
    this.number = 0;
    this.seed = 0;
    this.randomRank = 1;
    this.waste = -1;
    this.moves = 0;
    this.doneCards = 0;
    this.donePercent = 0;
    this.playtime = 0;
    this.finished = true;
    this.undoPos = 0;
    this.redoPos = 0;
    this.undoRec = [];
    this.undoing = 0;
    this.autoplayEnabled = true; // user setting
    this.onAnimate = null; // (dest, src, ind, anim) called just before cards move
    this.checkFinish = null;
  }

  // linear congruential generator (same as XM Solitaire so game numbers are compatible)
  rand(n) {
    this.seed = (Math.imul(this.seed, 367413989) + 174680251) >>> 0;
    return Math.floor((n * this.seed) / 4294967296);
  }

  randUndo(n) {
    const result = Math.floor((n * this.seed) / 4294967296);
    this.seed = Math.imul((this.seed - 174680251) | 0, 4253901549 | 0) >>> 0;
    return result;
  }

  king4() {
    let n = 0;
    for (const c of this.cells) {
      if (isKing4(c) && c.Ncards && cardRank(c.cards[0]) === 13) n++;
    }
    return n === this.game.decks * 4 ? 0 : 13;
  }

  baseRank() {
    for (const c of this.cells) {
      if (isSameBase(c) && c.Ncards > 0) return cardRank(c.cards[0]);
    }
    return 0;
  }

  // number of cards that can be moved at once using free cells/columns
  freecell(dest) {
    let res = 1;
    let tab = 0;
    const seq = this.cells[dest].inRule & (SEQ1_MASK | SUIT_MASK);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.Ncards === 0 && i !== dest && !c.prevRule) {
        let rule = c.inRule;
        if ((rule & RANK_MASK) === (RANK_KING4 << RANK_ROT) && !this.king4()) rule &= ~RANK_MASK;
        if (!((rule | c.outRule | c.sameRule) & ~(SEQ1_MASK | SUIT_MASK | GROUP_MASK))) {
          let g = rule & GROUP_MASK;
          if (g !== (GROUP_NOEMPTY << GROUP_ROT) && g !== (GROUP_ALL << GROUP_ROT)) {
            g = c.outRule & GROUP_MASK;
            if (g !== (GROUP_NOEMPTY << GROUP_ROT) && g !== (GROUP_ALL << GROUP_ROT)) {
              g = c.sameRule & GROUP_MASK;
              if (g !== (GROUP_NOEMPTY << GROUP_ROT) && g !== (GROUP_ALL << GROUP_ROT)) {
                res++;
                let s = rule & (SEQ1_MASK | SUIT_MASK);
                if (s === seq || s === 0) {
                  s = c.sameRule & (SEQ1_MASK | SUIT_MASK);
                  if (s === seq || s === 0) { tab++; res--; }
                }
              }
            }
          }
        }
      }
    }
    return res << tab;
  }

  rankTest(rule, card) {
    let r = (rule & RANK_MASK) >> RANK_ROT;
    if (r) {
      const r1 = cardRank(card);
      if (r === RANK_AK) {
        if (r1 !== 1 && r1 !== 13) return 0;
      } else {
        if (r === RANK_RANDOM) r = this.randomRank;
        if (r === RANK_RANDOMPLUS1) r = (this.randomRank % 13) + 1;
        if (r === RANK_SAMEBASE) r = this.baseRank();
        if (r === RANK_KING4) r = this.king4();
        if (r !== r1 && r > 0 && r <= 14) return 0;
      }
    }
    return 1;
  }

  /** The rank a cell is currently restricted to (for drawing empty-cell markers), 0 if none. */
  cellRank(c) {
    let j = (c.inRule & RANK_MASK) >> RANK_ROT;
    if (j === RANK_RANDOM) j = this.randomRank;
    if (j === RANK_RANDOMPLUS1) j = (this.randomRank % 13) + 1;
    if (j === RANK_SAMEBASE) j = this.baseRank();
    if (j === RANK_KING4) j = this.king4();
    return j;
  }

  /** What an empty cell should look like: 'redeal' | 'rank' | 'blocked' | 'free'; rank is in `rank`. */
  emptyCellKind(c) {
    if (c.type === CELL_STOCK && c.redealCount < c.redeal) return { kind: 'redeal' };
    const j = this.cellRank(c);
    if (j > 0 && j <= 13) return { kind: 'rank', rank: j };
    if (j === RANK_NO && (!c.sameRule || ((c.sameRule & RANK_MASK) >> RANK_ROT) === RANK_NO)) return { kind: 'blocked' };
    return { kind: 'free' };
  }

  testMove(dest, src, ind, drag = 0) {
    const cells = this.cells;
    if (dest < 0 || ind < 0) return 0;
    const destCell = cells[dest];
    const srcCell = cells[src];
    const srcCards = srcCell.cards;
    const count = srcCell.Ncards - ind;
    if (src === dest) return ind > MOVE_FIRST ? 1 : 0;
    for (const [cell, idx] of [[srcCell, src], [destCell, dest]]) {
      for (let b = 0; b < 2; b++) {
        if (cell.blockedBy[b]) {
          const i = idx + cell.blockedBy[b];
          if (i >= 0 && i < cells.length && cells[i].Ncards !== 0) return 0;
        }
      }
    }
    const game = this.game;
    if (game.pair && count === 1 && destCell.type !== CELL_FOUNDATION && srcCell.type !== CELL_FOUNDATION) {
      const k = destCell.Ncards;
      if (k > 0 && !srcCell.hidden[ind] && !destCell.hidden[k - 1]) {
        const r = cardRank(srcCards[ind]);
        const r1 = cardRank(destCell.cards[k - 1]);
        const s = cardSuit(srcCards[ind]);
        const s1 = cardSuit(destCell.cards[k - 1]);
        const pair = game.pair;
        switch (pair) {
          case PAIR_SUIT: if (s === s1) return 1; break;
          case PAIR_RANK: if (r === r1) return 1; break;
          case PAIR_RANKCOLOR: if (r === r1 && (s & CARD_COLOR) === (s1 & CARD_COLOR)) return 1; break;
          default: if (r + r1 === pair || (r > pair && r1 > pair)) return 1; break;
        }
      }
    }
    let maxGroup = 0;
    let prevCell = null;
    for (let k = 0; k < 3; k++) {
      let destInd;
      let rule;
      if (k === 0) {
        destInd = destCell.Ncards;
        if (destInd + count > destCell.maxCount) return 0;
        rule = destCell.inRule;
      } else if (k === 1) {
        destInd = 0;
        rule = srcCell.outRule;
      } else {
        rule = destCell.prevRule;
        if (destCell.prevInd < 0) continue;
        prevCell = cells[destCell.prevInd];
        destInd = prevCell.Ncards;
      }
      if (destCell.type === srcCell.type && destCell.sameRule) {
        if (k) break;
        rule = destCell.sameRule;
      }
      if (!rule) continue;
      for (let i = drag; i < count; i++) {
        const srcCard = srcCards[ind + i];
        let destCard;
        if (i === 0) {
          if (destInd === 0) {
            if (!this.rankTest(rule, srcCard)) return 0;
            if (!colorTest(rule, srcCard)) return 0;
            continue;
          }
          const c = k === 2 ? prevCell : destCell;
          if (c.hidden[destInd - 1]) {
            switch (c.onhid) {
              case ONHID_ANY: break;
              case ONHID_K: if (cardRank(srcCard) !== 13) return 0; break;
              default: return 0;
            }
            continue;
          }
          destCard = c.cards[destInd - 1];
        } else {
          if (k === 2 || (rule & GROUP_MASK) === (GROUP_ANYSEQ << GROUP_ROT) || (rule & GROUP_MASK) === (GROUP_PILE << GROUP_ROT)) break;
          if ((rule & GROUP_MASK) === (GROUP_ANYFREECELLSEQ << GROUP_ROT)) {
            if (!maxGroup) maxGroup = this.freecell(dest);
            if (count <= maxGroup) break;
          }
          destCard = srcCards[ind + i - 1];
        }
        if (!seqTest(rule, destCard, srcCard, prevCell) || !suitTest(rule, destCard, srcCard)) {
          if (k === 1 && (destCell.inRule & GROUP_MASK) === 0) {
            if (!maxGroup) maxGroup = this.freecell(dest);
            if (count <= maxGroup) break;
          }
          return 0;
        }
      }
      let grp = (rule & GROUP_MASK) >> GROUP_ROT;
      if (grp === GROUP_PILE) {
        if (count !== srcCell.Ncards) grp = GROUP_NO; else grp = 0;
      } else if (grp === GROUP_TOEMPTY) {
        if (count > 1 && destCell.Ncards === 0) grp = 0; else grp = GROUP_NO;
      }
      switch (grp) {
        case GROUP_NO:
          if (count > 1) {
            if (!maxGroup) maxGroup = this.freecell(dest);
            if (count > maxGroup) return 0;
          }
          break;
        case GROUP_ALL: if (count !== 13) return 0; break;
        case GROUP_NOEMPTY: if (count === srcCell.Ncards) return 0; break;
      }
      const t = rule & DEST_MASK;
      if (t) {
        if (((t >> DEST_ROT) & (1 << (k === 0 ? srcCell : destCell).type)) === 0) return 0;
      }
    }
    for (let i = 0; i < count; i++) {
      if (srcCell.hidden[ind + i]) return 0;
    }
    return count;
  }

  move2(dest, src, ind) {
    const cells = this.cells;
    const srcCell = cells[src];
    const count = srcCell.Ncards - ind;
    const destCell = cells[dest];
    let destInd = destCell.Ncards;
    if (src === dest) {
      switch (ind) {
        case MOVE_SHUFFLE:
          if (destInd <= 0) return;
          for (let i = 0; i < destInd; i++) {
            let j; let k;
            if (this.undoing) { j = this.randUndo(destInd); k = destInd - 1 - i; } else { j = this.rand(destInd); k = i; }
            const w = srcCell.cards[j];
            srcCell.cards[j] = srcCell.cards[k];
            srcCell.cards[k] = w;
          }
          destInd = ind;
          break;
        case MOVE_HIDE:
          srcCell.hidden[destInd - 1] = 1;
          destInd = MOVE_UNHIDE;
          break;
        case MOVE_UNHIDE:
          srcCell.hidden[destInd - 1] = 0;
          destInd = MOVE_HIDE;
          break;
      }
    } else {
      if (count <= 0) return;
      if (destCell.redeal && destInd === 0 && !this.undoing) destCell.redealCount++;
      if (this.undoing && srcCell.redeal && ind === 0) srcCell.redealCount--;
      for (let i = count; i > 0; i--) {
        destCell.cards[destCell.Ncards] = srcCell.cards[srcCell.Ncards - i];
        destCell.hidden[destCell.Ncards] = 0;
        destCell.Ncards++;
      }
      srcCell.Ncards -= count;
    }
    // add undo record
    let r = this.undoRec[this.undoPos];
    if (!this.undoing) {
      if (this.undoPos === this.undoRec.length) { r = {}; this.undoRec.push(r); }
      if (this.undoPos < this.redoPos) {
        if (r.src !== src || r.dest !== dest || r.ind !== ind) this.redoPos = 0;
      } else {
        this.redoPos = 0;
      }
      r.src = src; r.dest = dest; r.ind = ind; r.destInd = destInd; r.group = this.moves; r.unhide = false;
      this.undoPos++;
    }
    if (src !== dest) {
      // unhide exposed card
      if (ind > 0 && (srcCell.onhid === ONHID_AUTO || (srcCell.onhid === ONHID_BLOCKED && srcCell.hideStyle === -1))) {
        if (srcCell.hidden[ind - 1]) {
          srcCell.hidden[ind - 1] = 0;
          if (!this.undoing) r.unhide = true;
        }
      }
      // hide stock card (when undo)
      if (destCell.type === CELL_STOCK && destCell.hideStyle === HIDE_ALL) {
        for (let i = count; i > 0; i--) destCell.hidden[destCell.Ncards - i] = 1;
      }
    }
  }

  move1(dest, src, ind) {
    const cells = this.cells;
    const srcCell = cells[src];
    const count = srcCell.Ncards - ind;
    const destCell = cells[dest];
    const destInd = destCell.Ncards;
    this.move2(dest, src, ind);
    const game = this.game;
    // move pair to a foundation
    if (game.pair && count === 1 && destInd > 0 && !this.undoing && destCell.type !== CELL_FOUNDATION && srcCell.type !== CELL_STOCK) {
      const r2 = cardRank(destCell.cards[destInd]);
      const r1 = cardRank(destCell.cards[destInd - 1]);
      const s2 = cardSuit(destCell.cards[destInd]);
      const s1 = cardSuit(destCell.cards[destInd - 1]);
      const pair = game.pair;
      switch (pair) {
        case PAIR_SUIT: if (s1 !== s2) return; break;
        case PAIR_RANK: if (r1 !== r2) return; break;
        case PAIR_RANKCOLOR: if (r1 !== r2 || (s1 & CARD_COLOR) !== (s2 & CARD_COLOR)) return; break;
        default: if (r1 + r2 !== pair && (r1 <= pair && r2 <= pair)) return; break;
      }
      for (let i = 0; i < cells.length; i++) {
        if (cells[i].type === CELL_FOUNDATION) { this.move2(i, dest, destInd - 1); break; }
      }
    }
  }

  move(dest, src, ind) {
    const count = this.testMove(dest, src, ind);
    if (count) {
      this.move1(dest, src, ind);
      this.moves++;
    }
    return count;
  }

  animate(dest, src, ind, anim) {
    if (this.notdraw || src === dest) return;
    if (this.cells[src].Ncards - ind <= 0) return;
    this.onAnimate?.(dest, src, ind, anim);
  }

  animMove(dest, src, ind, anim) {
    if (this.testMove(dest, src, ind)) {
      this.animate(dest, src, ind, anim);
      return this.move(dest, src, ind);
    }
    return 0;
  }

  animMove1(dest, src, ind, anim) {
    this.animate(dest, src, ind, anim);
    this.move1(dest, src, ind);
  }

  chooseDest(src) {
    const c = this.cells[src];
    let destType = (c.outRule & DEST_MASK) >> DEST_ROT;
    if (!destType) {
      const srcType = c.type;
      if (this.waste >= 0 && this.waste !== src) {
        destType = 1 << CELL_WASTE;
      } else {
        const defs = this.game.cells;
        const has = (t) => defs.some((d) => d.type === t);
        if (srcType !== CELL_WASTE && has(CELL_WASTE)) return 1 << CELL_WASTE;
        if (srcType !== CELL_TABLEAU && has(CELL_TABLEAU)) return 1 << CELL_TABLEAU;
        if (srcType !== CELL_CELL && has(CELL_CELL)) return 1 << CELL_CELL;
        if (srcType !== CELL_RESERVE && has(CELL_RESERVE)) return 1 << CELL_RESERVE;
      }
    }
    return destType;
  }

  stockClick(src) {
    const cells = this.cells;
    const destType = this.chooseDest(src);
    const c = cells[src];
    const isRedeal = c.Ncards === 0;
    let result = 0;
    if (isRedeal) {
      if (c.redealCount < c.redeal || c.redeal === 0x7fffffff) {
        if (c.deal === DEAL_GAPS) {
          for (let i = 0; i < cells.length; i++) {
            const t = cells[i];
            if (t.Ncards > 0 && t.type !== CELL_STOCK && (t.inRule & SEQ_MASK) !== (SEQ_RANK << SEQ_ROT)) {
              const a1 = t.cards[0];
              const r = (t.inRule & RANK_MASK) >> RANK_ROT;
              if (!r || r > 13 || r !== cardRank(a1)) {
                if (t.prevRule && t.prevInd >= 0) {
                  const p = cells[t.prevInd];
                  if (p.Ncards > 0) {
                    const a = p.cards[p.Ncards - 1];
                    if (seqTest(t.prevRule, a, a1, null) && suitTest(t.prevRule, a, a1)) continue;
                  }
                }
                while (t.Ncards > 0) this.animMove1(src, i, t.Ncards - 1, ANIM_STOCK);
              }
            }
          }
        } else if (c.deal === DEAL_BOTTOMTOTOP) {
          result = 1;
          for (let i = 0; i < cells.length; i++) {
            const t = cells[i];
            t.tmp = 0;
            if (t.type === CELL_TABLEAU) {
              t.tmp = t.Ncards;
              if (t.tmp) {
                this.animMove1(src, i, 1, ANIM_STOCK);
                this.animMove1(src, i, 0, ANIM_STOCK);
              }
            }
          }
        } else if (this.waste >= 0 && (destType & (1 << CELL_WASTE))) {
          result = cells[this.waste].Ncards;
          for (let i = result - 1; i >= 0; i--) {
            this.move1(src, this.waste, i);
            c.hidden[result - 1 - i] = 1;
          }
        } else {
          for (let i = 0; i < cells.length; i++) {
            const t = cells[i];
            if (destType & (1 << t.type)) {
              while (t.Ncards > 0) this.animMove1(src, i, t.Ncards - 1, ANIM_STOCK);
            }
          }
        }
        if (c.shuffle === SHUFFLE_RAND) this.move1(src, src, MOVE_SHUFFLE);
      }
    }
    if (c.deal === DEAL_FILL) {
      // handled by autoPlay()
    } else if (c.deal === DEAL_GAPS) {
      for (let i = 0; i < cells.length; i++) {
        const t = cells[i];
        t.tmp = (t.Ncards === 0 && t.prevRule && t.prevInd && cells[t.prevInd].Ncards <= 0) ? 1 : 0;
      }
      for (let i = 0; i < cells.length && c.Ncards > 0; i++) {
        const t = cells[i];
        if ((destType & (1 << t.type)) !== 0 && t.tmp) {
          this.animMove1(i, src, c.Ncards - 1, ANIM_STOCK);
          result++;
        }
      }
    } else if (c.deal === DEAL_BOTTOMTOTOP) {
      if (result) {
        for (let i = cells.length - 1; i >= 0 && c.Ncards > 0; i--) {
          const t = cells[i];
          if (t.tmp) {
            this.animMove1(i, src, c.Ncards - t.tmp, ANIM_STOCK);
            result += t.tmp;
          }
        }
      }
    } else if (this.waste >= 0 && (destType & (1 << CELL_WASTE))) {
      for (let i = 0; i < c.deal && c.Ncards > 0; i++) {
        this.animMove1(this.waste, src, c.Ncards - 1, ANIM_STOCK);
        result++;
      }
    } else {
      let i = -1;
      let change = false;
      let t;
      outer:
      while (result < c.deal && c.Ncards > 0) {
        do {
          i++;
          if (i >= cells.length) {
            i = 0;
            if (!change) break outer;
            change = false;
          }
          t = cells[i];
        } while ((destType & (1 << t.type)) === 0);
        if (c.deal !== DEAL_MAX || t.Ncards < t.maxCount) {
          this.animMove1(i, src, c.Ncards - 1, ANIM_STOCK);
          if (isRedeal && t.hideStyle) this.move1(i, i, MOVE_HIDE);
          change = true;
          result++;
        }
      }
      if (isRedeal) {
        for (let k = 0; k < cells.length; k++) {
          const u = cells[k];
          if (u.hideStyle && (destType & (1 << u.type))) {
            for (let j = 0; j < u.Ncards; j++) {
              if (!testHide(u, j, u.Ncards)) this.move1(k, k, MOVE_UNHIDE);
            }
          }
        }
      }
    }
    if (result) this.moves++;
    return result;
  }

  // double-click: move to a free cell or foundation
  dblclkMove(src) {
    if (src < 0) return 0;
    const srcCell = this.cells[src];
    if (srcCell.Ncards === 0) return 0;
    if (srcCell.type === CELL_STOCK) return this.stockClick(src);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.type === CELL_CELL || c.type === CELL_FOUNDATION) {
        if (this.animMove(i, src, this.cells[src].Ncards - 1, ANIM_RIGHTCLICK)) return 1;
      }
    }
    return 0;
  }

  // right click (here: single tap): move to the most suitable pile
  rightclkMove(src, ind) {
    if (src < 0) return 0;
    const c = this.cells[src];
    if (c.Ncards === 0) return 0;
    if (c.type === CELL_STOCK) return this.stockClick(src);
    const srcCard = c.cards[ind];
    for (let k = 0; k < 8; k++) {
      for (let i = src + 1; ; i++) {
        if (i === this.cells.length) i = 0;
        if (i === src) break;
        if (evalMove(this.cells[i], c, srcCard) === k) {
          if (this.animMove(i, src, ind, ANIM_RIGHTCLICK)) return 1;
        }
      }
    }
    return 0;
  }

  cellFinished(c) {
    const rule = c.inRule;
    const seq = (rule & SEQ_MASK) >> SEQ_ROT;
    let n = this.game.nrank;
    if (seq === SEQ_NO) n = 1;
    if (seq === SEQ_RANK || seq === SEQ_UPDOWNRANK) n = 4;
    n = Math.min(n, c.maxCount);
    if (n !== c.Ncards) return 0;
    let seqRule = rule;
    if (seq === SEQ_UPDOWN) seqRule = SEQ_UP << SEQ_ROT;
    if (seq === SEQ_UPDOWNRANK) seqRule = SEQ_RANK << SEQ_ROT;
    let suitRule = rule;
    if ((rule & SUIT_MASK) === 0 && (c.outRule & SUIT_MASK) === (SUIT_SAME << SUIT_ROT)) suitRule = SUIT_SAME << SUIT_ROT;
    for (let j = 1; j < n; j++) {
      const c1 = c.cards[j - 1];
      const c2 = c.cards[j];
      if (!seqTest(seqRule, c1, c2, null)) return 0;
      if (!suitTest(suitRule, c1, c2)) return 0;
    }
    const pr = c.prevRule;
    if (pr && c.prevInd) {
      const p = this.cells[c.prevInd];
      if (p.Ncards !== 1) return 0;
      const c1 = p.cards[0];
      const c2 = c.cards[0];
      if (!seqTest(pr, c1, c2, null) || !suitTest(pr, c1, c2)) return 0;
    }
    return 1;
  }

  calcDone() {
    if (!this.game) return;
    let t = 0; let f = 0; let n = 0;
    for (const c of this.cells) {
      if (c.type === CELL_FOUNDATION && (c.inRule & SEQ_MASK) !== (SEQ_RANK << SEQ_ROT)) { f += c.Ncards; n++; }
      t += c.Ncards;
    }
    if (!n) {
      for (const c of this.cells) if (this.cellFinished(c)) f += c.Ncards;
    }
    this.donePercent = t === 0 ? -1 : Math.floor((f * 100) / t);
    this.doneCards = f;
  }

  totalCards() {
    let n = 0;
    for (const c of this.cells) n += c.Ncards;
    return n;
  }

  finishFoundation() {
    return this.cells.every((c) => c.Ncards === 0 || c.type === CELL_FOUNDATION);
  }

  finishFullFoundation() {
    return this.cells.every((c) => c.type !== CELL_FOUNDATION || c.Ncards === c.maxCount);
  }

  finishFan() {
    return this.cells.every((c) => c.Ncards === 0 || this.cellFinished(c));
  }

  // autoplay="base" cell
  autoBase(t) {
    if (t.Ncards === 1) {
      const rule = (t.inRule & SEQ_MASK) >> SEQ_ROT;
      const r = cardRank(t.cards[0]);
      for (const c of this.cells) {
        if (c.type === CELL_FOUNDATION || c === t) continue;
        for (let k = 0; k < c.Ncards; k++) {
          if (k === 0 && (c.inRule & RANK_MASK) === (RANK_NO << RANK_ROT)) continue;
          const r1 = cardRank(c.cards[k]);
          switch (rule) {
            case SEQ_RANK: if (r === r1) return 0; break;
            case SEQ_UP: if (r === r1 - 1) return 0; break;
            case SEQ_DOWN: if (r === r1 + 1) return 0; break;
          }
        }
      }
    }
    return 1;
  }

  /**
   * Autoplay: moves cards to foundations when possible and applies "fill" rules.
   * once=true forces autoplay even when the user setting is off ("fast forward").
   */
  autoPlay(once = false) {
    const game = this.game;
    if (!game || this.finished) return;
    const cells = this.cells;
    let disabled = false;
    if (this.undoPos > 0) {
      const u = this.undoRec[this.undoPos - 1];
      if (cells[u.src].type === CELL_FOUNDATION && cells[u.dest].type !== CELL_FOUNDATION) disabled = true;
    }
    const enabled = once || this.autoplayEnabled;
    let moved;
    do {
      moved = false;
      scan:
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.type === CELL_FOUNDATION && game.autoplay && enabled && !disabled) {
          for (let j = 0; j < cells.length; j++) {
            const t = cells[j];
            if ((t.type !== CELL_FOUNDATION || (cells[i].inRule & SEQ_MASK) === (SEQ_RANK << SEQ_ROT)) &&
              t.autoplay !== AUTO_NO && (t.autoplay !== AUTO_BASE || this.autoBase(t)) &&
              (c.Ncards > 0 || ((!isSameBase(c) || this.baseRank()) && (c.inRule & RANK_MASK)))) {
              for (let k = 0; k < t.Ncards; k++) {
                if (this.animMove(i, j, k, ANIM_AUTOPLAY)) {
                  this.calcDone();
                  moved = true;
                  break scan;
                }
              }
            }
          }
        }
      }
      // "fill" attribute (cannot be disabled)
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.fill) {
          const destType = this.chooseDest(i);
          let moved1 = false;
          for (let j = 0; j < cells.length && c.Ncards > 0; j++) {
            const f = Math.max(0, c.Ncards - c.fill);
            const t = cells[j];
            if (t.Ncards === 0 && (destType & (1 << t.type)) &&
              (t.type !== CELL_FOUNDATION || (colorTest(t.inRule, c.cards[f]) && this.rankTest(t.inRule, c.cards[f])))) {
              if (!moved1) {
                if (this.moves > 0) this.moves--; // the moves counter is not incremented
                moved1 = true;
              }
              this.animMove1(j, i, f, ANIM_STOCK);
            }
          }
          if (moved1) { moved = true; this.moves++; }
        }
      }
    } while (moved);
    this.finished = !!this.checkFinish.call(this);
    this.calcDone();
  }

  // ---- dealing --------------------------------------------------------------------
  testStart(c, d, ind) {
    const r1 = (d % 13) + 1;
    const s1 = Math.floor(d / 13) % 4;
    const card1 = makeCard(r1, s1);
    if (ind === 0) {
      for (let k = (c.type !== CELL_FOUNDATION || c.startRule) ? 1 : 0; k < 2; k++) {
        const rule = k ? c.startRule : c.inRule;
        if (!this.rankTest(rule, card1)) return 0;
        if (!colorTest(rule, card1)) return 0;
      }
    } else {
      const card = c.cards[ind - 1];
      if (!suitTest(c.startRule, card, card1)) return 0;
      if (!seqTest(c.startRule, card, card1, null)) return 0;
    }
    return 1;
  }

  deal(c, bitmask, total) {
    const k = c.Ncards;
    if (k === c.startCount) return false;
    let cnt = 0;
    let d0 = -1;
    for (let d = 0; d < total; d++) {
      if (!bitmask[d] && this.testStart(c, d, k)) {
        cnt++;
        if (!this.rand(cnt)) d0 = d;
      }
    }
    if (d0 < 0) return false;
    bitmask[d0] = 1;
    c.cards[k] = makeCardStart(d0);
    c.Ncards++;
    c.hidden[k] = testHide(c, k, c.startCount) ? 1 : 0;
    return true;
  }

  /** Start a new game. `seed` is the game number (any 32-bit unsigned integer). */
  newGame(game, seed) {
    this.game = game;
    this.seed = seed >>> 0;
    this.number = this.seed;
    for (let i = 0; i < 100; i++) this.rand(0);
    this.randomRank = this.rand(13) + 1;
    this.waste = -1;
    this.cells = [];
    const total = game.decks * 13 * 4;
    let n = total;
    const bitmask = new Uint8Array(total);
    for (let i = 0; i < 4; i++) {
      if ((game.suit & (1 << i)) === 0) {
        for (let j = 0; j < game.decks; j++) for (let k = 0; k < 13; k++) { bitmask[(j * 4 + i) * 13 + k] = 1; n--; }
      }
    }
    for (let k = 0; k < 13; k++) {
      if ((game.rank & (1 << k)) === 0) {
        for (let j = 0; j < 4 * game.decks; j++) {
          if (!bitmask[j * 13 + k]) { bitmask[j * 13 + k] = 1; n--; }
        }
      }
    }
    const cells = this.cells;
    for (const c1 of game.cells) {
      let Ncolumn = Math.floor((c1.repeat - 1) / c1.lines) + 1;
      if (c1.shape === SHAPE_PYRAMID) Ncolumn += Math.floor((c1.lines + 1) / 2) - 1;
      let sc = c1.startCount;
      if (sc === 0x7fff) sc = n;
      let row = 1;
      let col = 0;
      for (let j = 0; j < c1.repeat; j++) {
        const c = Object.assign({}, c1, {
          blockedBy: c1.blockedBy.slice(),
          Ncards: 0, prevInd: -1, tmp: 0, redealCount: 0,
          cards: new Uint8Array(MCARDS), hidden: new Uint8Array(MCARDS),
        });
        cells.push(c);
        for (let k = 0; k < indHDCS.length; k++) {
          if ((c.inRule & CLR_MASK) === indHDCS[k]) c.inRule = (c1.inRule & ~CLR_MASK) | HDCS[k][j % 4];
          if ((c.startRule & CLR_MASK) === indHDCS[k]) c.startRule = (c1.startRule & ~CLR_MASK) | HDCS[k][j % 4];
        }
        for (let k = 0; k < 2; k++) {
          if (c.blockedBy[k] === UNDER_NEXT) c.blockedBy[k] = c1.repeat - j;
          if (c.blockedBy[k] === UNDER_NEXT1) c.blockedBy[k] = c1.repeat - j + 1;
        }
        if (c.type === CELL_WASTE) {
          if (this.waste === -1) this.waste = cells.length - 1; else this.waste = -2;
        }
        // x position
        let k;
        if (c1.shape === SHAPE_BIND) {
          const m = Math.trunc((2 * c1.w) / (2 * Ncolumn - 1));
          c.x += col * m;
          k = row & 1;
          if (!k) c.x += Math.trunc(m / 2);
          if (row < c1.lines) {
            if (!k || col > 0) c.blockedBy[0] = Ncolumn - k;
            if (k || col < Ncolumn - 1) c.blockedBy[1] = Ncolumn - k + 1;
          }
        } else if (Ncolumn > 1) {
          c.x += Math.trunc((col * c1.w) / (Ncolumn - 1));
          if (c1.shape === SHAPE_PYRAMID) {
            c.x += Math.trunc(Math.trunc(((c1.lines - row) * c1.w) / (Ncolumn - 1)) / 2);
            if (row < c1.lines) { c.blockedBy[0] = row; c.blockedBy[1] = row + 1; }
          }
          if (c1.shape === SHAPE_BRAID) {
            k = row & 1;
            if (k) c.x += Math.trunc(Math.trunc(c1.w / (Ncolumn - 1)) / 2);
            if (row < c1.lines) {
              if (k || col > 0) c.blockedBy[0] = Ncolumn - 1;
              if (k || col < Ncolumn - 1) c.blockedBy[1] = Ncolumn;
            }
          }
        }
        col++;
        // y position
        if (c1.lines > 1) {
          c.y += Math.trunc(((row - 1) * c1.h) / (c1.lines - 1));
          k = Ncolumn;
          if (c1.shape === SHAPE_PYRAMID) k = row;
          if (c1.shape === SHAPE_BRAID && (row & 1)) k--;
          if (col === k) { col = 0; row++; }
        }
        // count of cards
        k = Math.trunc(sc / c1.repeat);
        if (c1.repeat > 1) {
          let m = sc % c1.repeat;
          switch (c1.shape) {
            case SHAPE_INCR: case SHAPE_DECR: case SHAPE_INCR2: case SHAPE_DECR2: {
              k = j;
              if (c1.shape === SHAPE_DECR || c1.shape === SHAPE_DECR2) k = c1.repeat - j - 1;
              m = c1.repeat * (c1.repeat - 1);
              if (c1.shape === SHAPE_INCR2 || c1.shape === SHAPE_DECR2) k *= 2; else m = Math.trunc(m / 2);
              m = sc - m;
              if (m > 0) {
                const d = Math.trunc((m - 1) / c1.repeat) + 1;
                if (k === 0) k = m - d * c1.repeat;
                k += d;
              }
              break;
            }
            case SHAPE_RIGHT: if (j >= c1.repeat - m) k++; break;
            case SHAPE_CENTER: { const d = (c1.repeat - m) >> 1; if (j >= d && j < d + m) k++; break; }
            case SHAPE_SIDE: { const d = m >> 1; if (j < d || j >= c1.repeat - m + d) k++; break; }
            case SHAPE_FIRST: case SHAPE_LAST:
              k = Math.trunc((sc - 1) / c1.repeat) + 1;
              if (j === (c1.shape === SHAPE_FIRST ? 0 : c1.repeat - 1)) k += sc - k * c1.repeat;
              break;
            default: if (j < m) k++; break; // LEFT, PYRAMID, BRAID, BIND
          }
        }
        c.startCount = k;
        n -= c.startCount;
        // deal the first card
        let dealtFirst = false;
        if (c.type === CELL_FOUNDATION && c.startCount > 0 && c1.repeat % 4 === 0) {
          const r = (c.inRule & RANK_MASK) >> RANK_ROT;
          if (r >= 1 && r <= 13) {
            let d = (j % 4) * 13 + (r - 1);
            if (this.testStart(c, d, 0)) {
              for (let q = 0; q < game.decks; q++) {
                if (!bitmask[d]) {
                  bitmask[d] = 1;
                  c.cards[0] = makeCard(r, j);
                  c.hidden[0] = 0;
                  c.Ncards++;
                  dealtFirst = true;
                  break;
                }
                d += 52;
              }
            }
          }
        }
        if (!dealtFirst) this.deal(c, bitmask, total);
      }
    }

    let f = 0;
    n = 0;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      for (let k = 0; k < 2; k++) {
        if (c.blockedBy[k] === UNDER_WASTE && this.waste) c.blockedBy[k] = this.waste - i;
      }
      if (c.type === CELL_FOUNDATION) {
        f++;
        if ((c.inRule & SEQ_MASK) === (SEQ_RANK << SEQ_ROT)) c.maxCount = Math.min(c.maxCount, game.nsuit * game.decks);
        if ((c.inRule & SUIT_MASK) === (SUIT_SAME << SUIT_ROT)) c.maxCount = Math.min(c.maxCount, game.nrank * game.decks);
        n += c.maxCount;
      }
      for (let k = 1; k < c.startCount; k++) {
        if (!this.deal(c, bitmask, total)) break;
      }
      // previous cell offsets
      c.prevInd = -1;
      const d = c.prevDir;
      if (d < cells.length) {
        if (d >= 0) c.prevInd = d;
        else if (i + d >= 0) c.prevInd = i + d;
      } else {
        let m = -1;
        for (let j = 0; j < cells.length; j++) {
          const c0 = cells[j];
          switch (d) {
            case PREV_LEFT: if (c0.y === c.y && c0.x < c.x && c0.x > m) { m = c0.x; c.prevInd = j; } break;
            case PREV_RIGHT: if (c0.y === c.y && c0.x > c.x && (c0.x < m || m < 0)) { m = c0.x; c.prevInd = j; } break;
            case PREV_UP: if (c0.x === c.x && c0.y < c.y && c0.y > m) { m = c0.y; c.prevInd = j; } break;
            case PREV_DOWN: if (c0.x === c.x && c0.y > c.y && (c0.y < m || m < 0)) { m = c0.y; c.prevInd = j; } break;
          }
        }
      }
    }
    // how do we know the game is won?
    this.checkFinish = this.finishFoundation;
    const i = game.cardCount - n;
    if (i > 0) {
      this.checkFinish = this.finishFullFoundation;
      if (n === 0 || i > 8) this.checkFinish = this.finishFan;
    }
    // move cards to foundations during deal, if such moves are legal
    for (let i2 = 0; i2 < cells.length; i2++) {
      const c = cells[i2];
      if (c.deal === DEAL_START || c.deal === DEAL_START_COL || c.deal === DEAL_START1) {
        for (let j = 0; j < cells.length; j++) {
          const c0 = cells[j];
          if (c0.deal === c.deal || c0.shape === SHAPE_BRAID || (c.deal === DEAL_START_COL && c0.x !== c.x)) continue;
          for (let k = 0; k < c0.Ncards; k++) {
            const card = c0.cards[k];
            const m = c.Ncards;
            if (m) {
              if (m >= c.maxCount || c.deal === DEAL_START1) break;
              const card1 = c.cards[m - 1];
              if (!seqTest(c.inRule, card1, card, null) || !suitTest(c.inRule, card1, card)) continue;
            } else if (!this.rankTest(c.inRule, card) || !colorTest(c.inRule, card)) continue;
            c.cards[m] = card;
            c.hidden[m] = 0;
            c.Ncards++;
            for (let d = k + 1; d < c0.Ncards; d++) { c0.cards[d - 1] = c0.cards[d]; c0.hidden[d - 1] = c0.hidden[d]; }
            c0.Ncards--;
            k--;
          }
        }
      }
    }
    this.undoRec = [];
    this.undoPos = 0;
    this.redoPos = 0;
    this.finished = false;
    this.playtime = 0;
    this.moves = 0;
    this.undoing = 0;
    this.calcDone();
  }

  // ---- undo / redo ----------------------------------------------------------------
  undo1() {
    if (this.undoPos <= 0) return false;
    if (!this.redoPos) this.redoPos = this.undoPos;
    this.undoing++;
    let g;
    do {
      const r = this.undoRec[--this.undoPos];
      g = r.group;
      this.animMove1(r.src, r.dest, r.destInd, ANIM_UNDO);
      if (r.unhide) this.cells[r.src].hidden[r.ind - 1] = 1;
    } while (this.undoPos > 0 && this.undoRec[this.undoPos - 1].group === g);
    this.moves = g;
    this.undoing--;
    return true;
  }

  redo1() {
    if (!this.redoPos || this.redoPos === this.undoPos) return false;
    let g;
    do {
      const r = this.undoRec[this.undoPos];
      g = r.group;
      this.animMove1(r.dest, r.src, r.ind, ANIM_UNDO);
    } while (this.undoPos < this.redoPos && this.undoRec[this.undoPos].group === g);
    this.moves = g + 1;
    return true;
  }

  undo() { if (this.undo1()) this.calcDone(); }
  redo() { if (this.redo1()) this.calcDone(); }
  get canUndo() { return this.undoPos > 0; }
  get canRedo() { return !!this.redoPos && this.redoPos !== this.undoPos; }

  // ---- saving ---------------------------------------------------------------------
  serialize() {
    return {
      name: this.game.name,
      number: this.number,
      seed: this.seed,
      randomRank: this.randomRank,
      moves: this.moves,
      finished: this.finished,
      playtime: this.playtime,
      undoPos: this.undoPos,
      redoPos: this.redoPos,
      undoRec: this.undoRec.map((r) => [r.src, r.dest, r.ind, r.destInd, r.group, r.unhide ? 1 : 0]),
      cells: this.cells.map((c) => [c.redealCount, Array.from(c.cards.subarray(0, c.Ncards)), Array.from(c.hidden.subarray(0, c.Ncards))]),
    };
  }

  /** Restore a state produced by serialize(). `game` must be the definition with the saved name. */
  restore(game, s) {
    this.newGame(game, s.number);
    if (s.cells.length !== this.cells.length) throw new Error('Saved game does not match rules');
    s.cells.forEach(([redeal, cards, hidden], i) => {
      const c = this.cells[i];
      c.redealCount = redeal;
      c.Ncards = cards.length;
      c.cards.fill(0);
      c.hidden.fill(0);
      cards.forEach((v, k) => { c.cards[k] = v; c.hidden[k] = hidden[k]; });
    });
    this.seed = s.seed >>> 0;
    this.randomRank = s.randomRank;
    this.moves = s.moves;
    this.finished = s.finished;
    this.playtime = s.playtime;
    this.undoPos = s.undoPos;
    this.redoPos = s.redoPos;
    this.undoRec = s.undoRec.map(([src, dest, ind, destInd, group, unhide]) => ({ src, dest, ind, destInd, group, unhide: !!unhide }));
    this.calcDone();
  }
}

export { MOVE_UNHIDE, HIDE_ALL };

/** Merge game lists; a later game with the same name (case-insensitive) replaces the earlier one. */
export function mergeGames(...lists) {
  const byName = new Map();
  for (const list of lists) for (const g of list) byName.set(g.name.toLowerCase(), g);
  return [...byName.values()];
}
