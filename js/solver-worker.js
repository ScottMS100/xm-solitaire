// Runs the deal solver off the main thread. Messages in:  {cmd:'start', name, state, userRules}  {cmd:'more'}
// Messages out: {type:'progress'|'done'|'error', ...info}
import { Board, parseRules, mergeGames } from './engine.js';
import { Solver, unsupportedReason } from './solver.js';

let solver = null;
const SLICE = 400; // ms of searching between progress reports
let budget = 0;

async function loadGames(userRules) {
  const dir = new URL('../rules/', import.meta.url);
  let files = ['standard.xml', 'popular.xml'];
  try {
    const r = await fetch(new URL('manifest.json', dir));
    if (r.ok) files = (await r.json()).files || files;
  } catch { /* defaults */ }
  const lists = [];
  for (const f of files) {
    const r = await fetch(new URL(f, dir));
    if (r.ok) lists.push(parseRules(await r.text()).games);
  }
  for (const xml of userRules || []) lists.push(parseRules(xml).games);
  return mergeGames(...lists);
}

function run() {
  const t0 = Date.now();
  const slice = () => {
    if (!solver) return;
    const st = solver.step(SLICE);
    const info = solver.info();
    if (st === 'running' && Date.now() - t0 < budget) {
      postMessage({ type: 'progress', ...info });
      setTimeout(slice, 0);
    } else {
      postMessage({ type: 'done', ...info, timedOut: st === 'running' });
    }
  };
  slice();
}

onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.cmd === 'start') {
      const games = await loadGames(m.userRules);
      const game = games.find((g) => g.name.toLowerCase() === m.name.toLowerCase());
      if (!game) throw new Error('Unknown game');
      const board = new Board();
      board.restore(game, m.state);
      const why = unsupportedReason(board);
      if (why) { postMessage({ type: 'unsupported', reason: why }); return; }
      solver = new Solver(board);
      budget = m.budget;
      run();
    } else if (m.cmd === 'more' && solver) {
      budget = m.budget;
      run();
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
