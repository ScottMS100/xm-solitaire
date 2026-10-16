// XM Solitaire PWA: application shell (menus, saving, statistics, rule import).
import { Board, parseRules, mergeGames } from './engine.js';
import { BoardView } from './ui.js';

const $ = (id) => document.getElementById(id);

// <dialog> is missing in Safari before 15.4: fall back to showing/hiding it with the "open" attribute
document.querySelectorAll('dialog').forEach((d) => {
  if (typeof d.showModal !== 'function') {
    d.showModal = function showModal() { this.setAttribute('open', ''); };
    d.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
  }
});
const LS = 'xmsol.v1.';
const VERSION = '1.7';

// Landscape and short (a phone held sideways): put the toolbar in a vertical strip on the left
function updateBarMode() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const side = w > h && h <= 620;
  document.documentElement.classList.toggle('side-bar', side);
  const info = document.getElementById('aboutInfo');
  if (info) info.textContent = `Version ${VERSION} · screen ${w}×${h} px · ${side ? 'side toolbar' : 'top toolbar'}`;
}
window.addEventListener('resize', updateBarMode);
window.addEventListener('orientationchange', () => setTimeout(updateBarMode, 150));
updateBarMode();
new ResizeObserver(updateBarMode).observe(document.documentElement);

// ---- storage helpers (every access is guarded: private mode / blocked storage must not break the game)
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(LS + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(LS + key, JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) { try { localStorage.removeItem(LS + key); } catch { /* ignore */ } },
};

const DEFAULTS = { tapToMove: true, autoplay: true, spread: 1.2, animation: 1, deck: 'classic' };
const settings = { ...DEFAULTS, ...store.get('settings', {}) };

const board = new Board();
board.autoplayEnabled = settings.autoplay;
let games = [];
let featured = [];
let manifest = { files: ['standard.xml', 'popular.xml'], featured: [] };
let stats = store.get('stats', {});
let counted = false; // has the current game been counted as "played"?
let winCounted = false; // has a win of the current deal been counted already?
let tickTimer = null;

const view = new BoardView($('board'), board, settings, { onAction: onAction, onWin: onWin });

const findGame = (name) => games.find((g) => g.name.toLowerCase() === String(name).toLowerCase());
const randomSeed = () => {
  try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch { return (Math.random() * 4294967296) >>> 0; }
};
const fmtTime = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

// ---- loading rules -----------------------------------------------------------------------
async function loadRules() {
  try {
    const r = await fetch('rules/manifest.json');
    if (r.ok) manifest = await r.json();
  } catch { /* use defaults */ }
  const lists = [];
  for (const file of manifest.files) {
    try {
      const r = await fetch('rules/' + file);
      if (!r.ok) throw new Error(r.status);
      const { games: g, warnings } = parseRules(await r.text());
      if (warnings.length) console.warn(file, warnings);
      lists.push(g);
    } catch (e) {
      console.error('Cannot load rules file', file, e);
    }
  }
  for (const u of store.get('userRules', [])) {
    const { games: g } = parseRules(u.xml);
    lists.push(g);
  }
  games = mergeGames(...lists).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  featured = (manifest.featured || []).map((n) => findGame(n)).filter(Boolean);
}

// ---- game flow -----------------------------------------------------------------------------
function startGame(game, seed) {
  board.newGame(game, seed ?? randomSeed());
  counted = false;
  winCounted = false;
  view.reset();
  afterLoad();
}

function afterLoad() {
  $('gameName').textContent = board.game.name;
  document.title = board.game.name + ' – XM Solitaire';
  updateStatus();
  saveGame();
  rememberRecent(board.game.name);
}

function rememberRecent(name) {
  const recent = store.get('recent', []).filter((n) => n !== name);
  recent.unshift(name);
  store.set('recent', recent.slice(0, 6));
}

function saveGame() {
  const s = board.serialize();
  s.counted = counted;
  store.set('save', s);
}

function restoreGame() {
  const s = store.get('save', null);
  if (!s) return false;
  const g = findGame(s.name);
  if (!g) return false;
  try {
    board.restore(g, s);
    counted = !!s.counted;
    winCounted = board.finished;
    return true;
  } catch (e) {
    console.warn('Could not restore saved game', e);
    return false;
  }
}

function statFor(name) {
  return stats[name] || (stats[name] = { played: 0, won: 0, bestTime: 0, bestMoves: 0 });
}

function onAction() {
  if (!counted && board.moves > 0) {
    counted = true;
    statFor(board.game.name).played++;
    store.set('stats', stats);
  }
  updateStatus();
  saveGame();
}

function onWin() {
  const st = statFor(board.game.name);
  if (!winCounted) st.won++;
  winCounted = true;
  if (!st.bestTime || board.playtime < st.bestTime) st.bestTime = board.playtime;
  if (!st.bestMoves || board.moves < st.bestMoves) st.bestMoves = board.moves;
  store.set('stats', stats);
  saveGame();
  $('winText').textContent = `${board.game.name} solved in ${board.moves} moves and ${fmtTime(board.playtime)}.`;
  setTimeout(() => { if (board.finished) $('winDlg').showModal(); }, 900);
}

function updateStatus() {
  $('moves').textContent = board.moves;
  $('time').textContent = fmtTime(board.playtime);
  $('btnUndo').disabled = !board.canUndo;
  $('btnRedo').disabled = !board.canRedo;
}

function tick() {
  const started = board.moves > 0 || board.undoPos > 0;
  const open = document.querySelector('dialog[open]');
  if (board.game && started && !board.finished && !open && document.visibilityState === 'visible') {
    board.playtime++;
    $('time').textContent = fmtTime(board.playtime);
  }
}

function inProgress() { return board.game && !board.finished && board.moves > 0; }

function confirmAbandon() {
  return !inProgress() || confirm('Abandon the game in progress?');
}

function newDeal(game = board.game, seed) {
  if (!confirmAbandon()) return false;
  startGame(game, seed);
  return true;
}

// ---- dialogs -------------------------------------------------------------------------------
const dlg = (id) => $(id);
function openDlg(id) { const d = dlg(id); if (!d.open) d.showModal(); }
function closeAll() { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }

// click on the backdrop closes a dialog
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d && d.id !== 'winDlg') d.close(); });
});

function statLine(name) {
  const s = stats[name];
  return s && s.played ? `won ${s.won} of ${s.played}` : '';
}

function renderGameLists(filter = '') {
  const root = $('gameLists');
  root.textContent = '';
  const q = filter.trim().toLowerCase();
  const add = (title, list, cls) => {
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'group-title';
    h.textContent = title;
    root.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'game-grid';
    for (const g of list) {
      const b = document.createElement('button');
      b.className = 'game-item' + (board.game && g.name === board.game.name ? ' current' : '') + (cls ? ' ' + cls : '');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = g.name;
      b.appendChild(n);
      const sl = statLine(g.name);
      if (sl) { const s = document.createElement('span'); s.className = 's'; s.textContent = sl; b.appendChild(s); }
      b.addEventListener('click', () => {
        if (!confirmAbandon()) return;
        closeAll();
        startGame(g);
      });
      grid.appendChild(b);
    }
    root.appendChild(grid);
  };
  if (q) {
    const hits = games.filter((g) => g.name.toLowerCase().includes(q));
    add(`${hits.length} game${hits.length === 1 ? '' : 's'} found`, hits);
    if (!hits.length) root.innerHTML = '<div class="empty">No game with that name.</div>';
  } else {
    const recent = store.get('recent', []).map(findGame).filter(Boolean);
    if (recent.length > 1) add('Recently played', recent.slice(0, 4));
    add('Favorites', featured);
    add(`All games (${games.length})`, games);
  }
}

function openGames() {
  $('gameSearch').value = '';
  renderGameLists();
  openDlg('gamesDlg');
  dlg('gamesDlg').querySelector('.sheet-body').scrollTop = 0;
}

$('btnGames').addEventListener('click', openGames);
$('gameSearch').addEventListener('input', (e) => renderGameLists(e.target.value));

$('btnNew').addEventListener('click', () => {
  $('newTitle').textContent = board.game.name;
  $('dealNumber').value = board.number;
  openDlg('newDlg');
});
$('optNew').addEventListener('click', () => { closeAll(); newDeal(); });
$('optRestart').addEventListener('click', () => {
  closeAll();
  if (board.moves === 0 && !board.canUndo) return;
  if (confirm('Restart this deal from the beginning?')) startGame(board.game, board.number);
});
$('optPick').addEventListener('click', () => { closeAll(); openGames(); });
$('optNumber').addEventListener('click', () => {
  const n = Number($('dealNumber').value);
  if (!Number.isInteger(n) || n < 0 || n > 4294967295) { alert('Enter a whole number from 0 to 4294967295.'); return; }
  closeAll();
  newDeal(board.game, n);
});

$('btnMenu').addEventListener('click', () => openDlg('menuDlg'));
// full screen (hides the browser's address bar); not available on iPhone, where installing to the home screen does it
const fsEl = document.documentElement;
const canFull = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
const inStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (canFull && !inStandalone) $('mFull').hidden = false;
$('mFull').addEventListener('click', async () => {
  closeAll();
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else await (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
  } catch (e) { console.warn('Full screen failed', e); }
});
$('mSettings').addEventListener('click', () => { closeAll(); openSettings(); });
$('mStats').addEventListener('click', () => { closeAll(); openStats(); });
$('mAdd').addEventListener('click', () => { closeAll(); openAdd(); });
$('mHow').addEventListener('click', () => { closeAll(); openDlg('howDlg'); });
$('mAbout').addEventListener('click', () => {
  closeAll();
  $('aboutCount').textContent = `${games.length} games installed.`;
  updateBarMode();
  openDlg('aboutDlg');
});

$('btnUndo').addEventListener('click', () => { view.perform(() => board.undo(), false); });
$('btnRedo').addEventListener('click', () => { view.perform(() => board.redo(), false); });

$('winNew').addEventListener('click', () => { closeAll(); startGame(board.game); });
$('winPick').addEventListener('click', () => { closeAll(); openGames(); });
$('winClose').addEventListener('click', () => closeAll());

// settings
function openSettings() {
  $('setTap').checked = settings.tapToMove;
  $('setAuto').checked = settings.autoplay;
  $('setAnim').value = String(settings.animation);
  $('setSpread').value = String(settings.spread);
  $('setDeck').value = settings.deck;
  openDlg('settingsDlg');
}
function applySettings() {
  settings.tapToMove = $('setTap').checked;
  settings.autoplay = $('setAuto').checked;
  settings.animation = Number($('setAnim').value);
  settings.spread = Number($('setSpread').value);
  const deckChanged = settings.deck !== $('setDeck').value;
  settings.deck = $('setDeck').value;
  board.autoplayEnabled = settings.autoplay;
  store.set('settings', settings);
  if (deckChanged) view.loadImages(settings.deck).catch((e) => console.error(e)); else view.invalidate();
}
['setTap', 'setAuto', 'setAnim', 'setSpread', 'setDeck'].forEach((id) => $(id).addEventListener('change', applySettings));

// statistics
function openStats() {
  const names = Object.keys(stats).filter((n) => stats[n].played).sort((a, b) => stats[b].played - stats[a].played);
  const body = $('statsBody');
  if (!names.length) {
    body.innerHTML = '<div class="empty">No games played yet.</div>';
  } else {
    let tp = 0; let tw = 0;
    const rows = names.map((n) => {
      const s = stats[n];
      tp += s.played; tw += s.won;
      const esc = n.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
      return `<tr><td>${esc}</td><td>${s.played}</td><td>${s.won}</td><td>${s.bestTime ? fmtTime(s.bestTime) : '–'}</td><td>${s.bestMoves || '–'}</td></tr>`;
    }).join('');
    body.innerHTML = `<table class="stat"><tr><th>Game</th><th>Played</th><th>Won</th><th>Best time</th><th>Fewest moves</th></tr>${rows}<tr><th>Total</th><th>${tp}</th><th>${tw}</th><th></th><th></th></tr></table>`;
  }
  openDlg('statsDlg');
}
$('statsClear').addEventListener('click', () => {
  if (!confirm('Delete all statistics?')) return;
  stats = {};
  store.set('stats', stats);
  openStats();
});

// add games from an XML file
function renderAddList() {
  const root = $('addList');
  root.textContent = '';
  const list = store.get('userRules', []);
  list.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'imported';
    const t = document.createElement('span');
    t.textContent = `${u.file} (${u.count} game${u.count === 1 ? '' : 's'})`;
    const b = document.createElement('button');
    b.textContent = 'Remove';
    b.addEventListener('click', async () => {
      const cur = store.get('userRules', []);
      cur.splice(i, 1);
      store.set('userRules', cur);
      await reloadGames();
      renderAddList();
    });
    row.append(t, b);
    root.appendChild(row);
  });
}
async function reloadGames() {
  const current = board.game ? board.game.name : null;
  await loadRules();
  if (current && !findGame(current)) { startGame(findGame('Klondike') || games[0]); }
}
function openAdd() {
  $('addResult').textContent = '';
  $('addResult').className = 'note';
  $('addFile').value = '';
  renderAddList();
  openDlg('addDlg');
}
$('addFile').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const res = $('addResult');
  try {
    const xml = await f.text();
    const { games: g, warnings } = parseRules(xml);
    if (!g.length) {
      res.className = 'note err';
      res.textContent = 'No games found in that file.' + (warnings.length ? '\n' + warnings.slice(0, 5).join('\n') : '');
      return;
    }
    const list = store.get('userRules', []).filter((u) => u.file !== f.name);
    list.push({ file: f.name, xml, count: g.length });
    if (!store.set('userRules', list)) throw new Error('Not enough storage space');
    await reloadGames();
    res.className = 'note';
    res.textContent = `Added ${g.length} game${g.length === 1 ? '' : 's'}: ${g.slice(0, 8).map((x) => x.name).join(', ')}${g.length > 8 ? '…' : ''}` +
      (warnings.length ? `\n${warnings.length} warning${warnings.length === 1 ? '' : 's'} (first: ${warnings[0]})` : '');
    renderAddList();
  } catch (err) {
    res.className = 'note err';
    res.textContent = 'Could not read that file: ' + err.message;
  }
});

// keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || e.target.matches?.('input, select, textarea')) return;
  const k = e.key.toLowerCase();
  // XM Solitaire's keys: Delete = undo, Insert = redo, Home = undo all, End = redo all
  if (k === 'delete') { e.preventDefault(); if (board.canUndo) view.perform(() => board.undo(), false); return; }
  if (k === 'insert') { e.preventDefault(); if (board.canRedo) view.perform(() => board.redo(), false); return; }
  if (k === 'home') { e.preventDefault(); if (board.canUndo) view.perform(() => { while (board.undo1()); board.calcDone(); }, false); return; }
  if (k === 'end') { e.preventDefault(); if (board.canRedo) view.perform(() => { while (board.redo1()); board.calcDone(); }, false); return; }
  if ((k === 'z' && !e.shiftKey) || (k === 'z' && e.ctrlKey && !e.shiftKey)) { e.preventDefault(); if (board.canUndo) view.perform(() => board.undo(), false); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); if (board.canRedo) view.perform(() => board.redo(), false); }
  else if (k === 'n') { e.preventDefault(); newDeal(); }
  else if (k === 'g') { e.preventDefault(); openGames(); }
});

// save when the app goes to the background
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && board.game) saveGame(); });
window.addEventListener('pagehide', () => { if (board.game) saveGame(); });

// ---- start -----------------------------------------------------------------------------------
async function init() {
  await Promise.all([loadRules(), view.loadImages()]);
  if (!games.length) {
    $('loading').textContent = 'Could not load the game rules. Check your connection and reload.';
    return;
  }
  if (restoreGame()) {
    afterLoad();
  } else {
    startGame(findGame('Klondike') || games[0]);
  }
  view.resize();
  view.invalidate();
  $('loading').classList.add('hidden');
  tickTimer = setInterval(tick, 1000);
  if (board.finished) updateStatus();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
  }
}

init().catch((e) => {
  console.error(e);
  $('loading').textContent = 'Something went wrong while starting: ' + e.message;
});

// handy for debugging in the browser console
window.xmsol = { board, view, get games() { return games; }, startGame, findGame };
