'use strict';

/* ---------- Rules ---------- */

const CATS = [
  { id: 'ones',    label: 'Ones',            hint: 'Sum of 1s', face: 1 },
  { id: 'twos',    label: 'Twos',            hint: 'Sum of 2s', face: 2 },
  { id: 'threes',  label: 'Threes',          hint: 'Sum of 3s', face: 3 },
  { id: 'fours',   label: 'Fours',           hint: 'Sum of 4s', face: 4 },
  { id: 'fives',   label: 'Fives',           hint: 'Sum of 5s', face: 5 },
  { id: 'sixes',   label: 'Sixes',           hint: 'Sum of 6s', face: 6 },
  { id: 'three',   label: 'Three of a kind', hint: 'Sum of all dice' },
  { id: 'four',    label: 'Four of a kind',  hint: 'Sum of all dice' },
  { id: 'full',    label: 'Full House',      hint: '25 points' },
  { id: 'small',   label: 'Small Straight',  hint: '30 points' },
  { id: 'large',   label: 'Large Straight',  hint: '40 points' },
  { id: 'kniffel', label: 'Kniffel',         hint: '50 points' },
  { id: 'chance',  label: 'Chance',          hint: 'Sum of all dice' },
];
const UPPER = CATS.slice(0, 6);
const LOWER = CATS.slice(6);
const BONUS_AT = 63, BONUS = 35;
const MAX_PLAYERS = 8, MAX_GAMES = 20;
const COLORS = ['#e0614a', '#3b82c4', '#d9a21b', '#8a5cc7', '#2fa37a', '#d65a9a', '#5a6b78', '#e08a2e'];

const sumDice = (d) => d.reduce((a, b) => a + b, 0);
function counts(d) { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach((v) => c[v]++); return c; }
const isKniffel = (d) => d.length === 5 && d.every((v) => v && v === d[0]);

function scoreFor(cat, dice) {
  const c = counts(dice), s = sumDice(dice), max = Math.max(...c);
  const has = (...vals) => vals.every((v) => c[v] > 0);
  const def = CATS.find((x) => x.id === cat);
  if (def.face) return def.face * c[def.face];
  switch (cat) {
    case 'three': return max >= 3 ? s : 0;
    case 'four': return max >= 4 ? s : 0;
    case 'full': { const nz = c.filter(Boolean).sort(); return nz.length === 2 && nz[0] === 2 ? 25 : 0; }
    case 'small': return has(1, 2, 3, 4) || has(2, 3, 4, 5) || has(3, 4, 5, 6) ? 30 : 0;
    case 'large': return has(1, 2, 3, 4, 5) || has(2, 3, 4, 5, 6) ? 40 : 0;
    case 'kniffel': return max === 5 ? 50 : 0;
    case 'chance': return s;
  }
  return 0;
}

const filled = (sc, id) => sc[id] !== undefined && sc[id] !== null;

function totals(sc) {
  const up = UPPER.reduce((a, c) => a + (sc[c.id] || 0), 0);
  const bonus = up >= BONUS_AT ? BONUS : 0;
  const low = LOWER.reduce((a, c) => a + (sc[c.id] || 0), 0);
  // "par" = three of each face for the upper fields already filled; >= 0 means on track for the bonus
  const par = UPPER.reduce((a, c) => a + (filled(sc, c.id) ? (sc[c.id] - 3 * c.face) : 0), 0);
  const count = CATS.filter((c) => filled(sc, c.id)).length;
  return { up, bonus, upTotal: up + bonus, low, total: up + bonus + low, par, count, done: count === CATS.length };
}

/* ---------- State ---------- */

const STORE = 'kniffle.state.v1';
const HIST = 'kniffle.history.v1';

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(S));
    localStorage.setItem(HIST, JSON.stringify(H));
  } catch { /* storage full or disabled: keep playing in memory */ }
}

let H = load(HIST, []); // finished match summaries
let S = load(STORE, null) || {
  view: 'setup',
  back: null,
  setup: { players: lastPlayers() || ['Player 1', 'Player 2'], games: 3, realDice: false },
  match: null,
  result: null,
};
let ui = { sel: null, rolling: [], dialog: null }; // transient, not persisted

function lastPlayers() { return H.length ? H[H.length - 1].players.slice() : null; }

const curGame = () => S.match.games[S.match.games.length - 1];

function freshTurn(m) {
  m.dice = m.realDice ? [0, 0, 0, 0, 0] : [1, 1, 1, 1, 1];
  m.held = [false, false, false, false, false];
  m.rolls = 0;
}

function newGame(m) {
  const n = m.players.length;
  m.games.push({ scores: m.players.map(() => ({})), kniffels: m.players.map(() => 0), result: null });
  m.cur = (m.games.length - 1) % n; // starting player rotates each game
  freshTurn(m);
}

function startMatch() {
  const players = S.setup.players.map((p, i) => p.trim() || `Player ${i + 1}`);
  const m = {
    id: Date.now().toString(36),
    started: Date.now(),
    players,
    totalGames: S.setup.games,
    realDice: S.setup.realDice,
    games: [],
    undo: null,
  };
  newGame(m);
  S.match = m;
  S.view = 'game';
  ui.sel = null;
  keepAwake();
}

/* ---------- Stats ---------- */

function gameWinners(totalsArr) {
  const best = Math.max(...totalsArr);
  return totalsArr.map((t) => t === best);
}

function summarize(m) {
  const games = m.games.filter((g) => g.result).map((g) => g.result);
  return { id: m.id, date: m.started, players: m.players.slice(), totalGames: m.totalGames, games };
}

function matchStats(sum) {
  const n = sum.players.length;
  const stats = sum.players.map((name, i) => {
    const pts = sum.games.map((g) => g.totals[i]);
    return {
      name, i,
      wins: sum.games.filter((g) => gameWinners(g.totals)[i]).length,
      total: pts.reduce((a, b) => a + b, 0),
      avg: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0,
      best: pts.length ? Math.max(...pts) : 0,
      worst: pts.length ? Math.min(...pts) : 0,
      kniffels: sum.games.reduce((a, g) => a + (g.kniffels[i] || 0), 0),
      bonuses: sum.games.filter((g) => g.bonus[i]).length,
      upAvg: pts.length ? sum.games.reduce((a, g) => a + g.up[i], 0) / pts.length : 0,
    };
  });
  const ranking = stats.slice().sort((a, b) => b.wins - a.wins || b.total - a.total);
  const top = ranking[0];
  const winners = n ? ranking.filter((s) => s.wins === top.wins && s.total === top.total).map((s) => s.i) : [];
  return { stats, ranking, winners };
}

function allTimeStats() {
  const by = new Map();
  const get = (name) => {
    const k = name.trim().toLowerCase();
    if (!by.has(k)) by.set(k, { name, matches: 0, matchWins: 0, games: 0, gameWins: 0, points: 0, best: 0, kniffels: 0, bonuses: 0 });
    return by.get(k);
  };
  for (const sum of H) {
    if (!sum.games.length) continue;
    const ms = matchStats(sum);
    ms.stats.forEach((s) => {
      const p = get(s.name);
      p.matches++;
      if (sum.players.length > 1 && ms.winners.includes(s.i)) p.matchWins++;
      p.games += sum.games.length;
      p.gameWins += sum.players.length > 1 ? s.wins : 0;
      p.points += s.total;
      p.best = Math.max(p.best, s.best);
      p.kniffels += s.kniffels;
      p.bonuses += s.bonuses;
    });
  }
  return [...by.values()].sort((a, b) => b.matchWins - a.matchWins || b.gameWins - a.gameWins || b.points / b.games - a.points / a.games);
}

/* ---------- Actions ---------- */

const actions = {
  // setup
  addPlayer() { if (S.setup.players.length < MAX_PLAYERS) S.setup.players.push(`Player ${S.setup.players.length + 1}`); },
  removePlayer({ i }) { if (S.setup.players.length > 1) S.setup.players.splice(+i, 1); },
  games({ d }) { S.setup.games = Math.min(MAX_GAMES, Math.max(1, S.setup.games + +d)); },
  diceMode({ v }) { S.setup.realDice = v === 'real'; },
  start() {
    if (S.match) return ask('Discard the match in progress and start a new one?', 'Discard & start', startMatch, true);
    startMatch();
  },
  resume() { S.view = 'game'; keepAwake(); },

  // navigation
  stats() { if (S.view !== 'stats') { S.back = S.view; S.view = 'stats'; } },
  back() { S.view = S.back && (S.back !== 'game' || S.match) ? S.back : 'setup'; S.back = null; },
  home() { S.view = 'setup'; },
  quit() {
    const done = S.match.games.filter((g) => g.result).length;
    const msg = done
      ? `End the match now? The ${done} finished game${done > 1 ? 's' : ''} will be saved to your stats.`
      : 'End the match now? Nothing has been finished yet, so it will be discarded.';
    ask(msg, 'End match', () => finishMatch(done > 0), !done);
  },

  // turn
  roll() {
    const m = S.match;
    if (m.realDice || m.rolls >= 3) return false;
    ui.rolling = [];
    m.dice = m.dice.map((v, i) => {
      if (m.rolls > 0 && m.held[i]) return v;
      ui.rolling.push(i);
      return 1 + Math.floor(Math.random() * 6);
    });
    m.rolls++;
    ui.sel = null;
    buzz(15);
    if (isKniffel(m.dice)) toast('KNIFFEL! 🎉');
  },
  die({ i }) {
    const m = S.match;
    if (m.realDice) { m.dice[+i] = 0; ui.sel = null; return; }
    if (m.rolls === 0 || m.rolls >= 3) return false;
    m.held[+i] = !m.held[+i];
  },
  face({ v }) {
    const m = S.match;
    const slot = m.dice.indexOf(0);
    if (slot < 0) return false;
    m.dice[slot] = +v;
    ui.sel = null;
  },
  clearDice() { S.match.dice = [0, 0, 0, 0, 0]; ui.sel = null; },
  pick({ cat }) { ui.sel = ui.sel === cat ? null : cat; },
  score() {
    const m = S.match;
    if (!ui.sel || !diceReady(m)) return false;
    const g = curGame();
    const sc = g.scores[m.cur];
    if (filled(sc, ui.sel)) return false;
    m.undo = JSON.stringify({ ...m, undo: null });
    const pts = scoreFor(ui.sel, m.dice);
    sc[ui.sel] = pts;
    if (isKniffel(m.dice)) g.kniffels[m.cur]++;
    ui.sel = null;
    buzz(10);
    if (g.scores.every((s) => totals(s).done)) {
      const ts = g.scores.map(totals);
      g.result = {
        totals: ts.map((t) => t.total),
        up: ts.map((t) => t.up),
        bonus: ts.map((t) => t.bonus > 0),
        kniffels: g.kniffels.slice(),
      };
      S.view = 'gameover';
    } else {
      m.cur = (m.cur + 1) % m.players.length;
      freshTurn(m);
    }
  },
  undo() {
    const m = S.match;
    if (!m || !m.undo) return false;
    S.match = JSON.parse(m.undo);
    S.view = 'game';
    ui.sel = null;
  },
  nextGame() {
    const m = S.match;
    m.undo = null;
    if (m.games.length >= m.totalGames) return finishMatch(true);
    newGame(m);
    S.view = 'game';
  },

  // results
  rematch() {
    const r = S.result;
    S.setup.players = r.players.slice();
    S.setup.games = r.totalGames;
    startMatch();
  },
  clearHistory() {
    ask('Delete all saved matches and stats? This cannot be undone.', 'Delete stats', () => { H = []; }, true);
  },

  // confirmation dialog
  dialogYes() { const d = ui.dialog; ui.dialog = null; if (d) d.fn(); },
  dialogNo() { ui.dialog = null; },
};

// In-page confirmation (native confirm() is unavailable in some embedded views).
function ask(text, yes, fn, danger = false) { ui.dialog = { text, yes, fn, danger }; }

function finishMatch(keep) {
  const m = S.match;
  S.setup.players = m.players.slice();
  S.setup.games = m.totalGames;
  S.setup.realDice = m.realDice;
  if (keep) {
    const sum = summarize(m);
    H.push(sum);
    S.result = sum;
    S.view = 'result';
  } else {
    S.view = 'setup';
  }
  S.match = null;
  releaseAwake();
}

const diceReady = (m) => (m.realDice ? m.dice.every((v) => v > 0) : m.rolls > 0);

/* ---------- Rendering ---------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 0) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const color = (i) => COLORS[i % COLORS.length];

const ICON = {
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/></svg>',
};

function header(title, sub, left = '', right = '') {
  return `<header class="top">${left}<h1>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h1>${right}</header>`;
}

function die(v, attrs = '', cls = '') {
  return `<button class="die ${cls}${v ? '' : ' empty'}" data-v="${v}" ${attrs}>${'<i></i>'.repeat(9)}</button>`;
}

function viewSetup() {
  const s = S.setup;
  const resume = S.match ? `
    <div class="card">
      <h2>Match in progress</h2>
      <p class="muted small" style="margin:0 0 12px">${esc(S.match.players.join(', '))} · game ${S.match.games.length} of ${S.match.totalGames}</p>
      <button class="btn primary block" data-a="resume">Resume match</button>
    </div>` : '';
  return `
  ${header('Kniffle', '', '', `<button class="icon-btn" data-a="stats" aria-label="Stats">${ICON.stats}</button>`)}
  <main>
    ${resume}
    <div class="card">
      <h2>Players</h2>
      <div class="stack">
        ${s.players.map((p, i) => `
          <div class="player-row">
            <span class="dot" style="background:${color(i)}"></span>
            <input data-in="player" data-i="${i}" value="${esc(p)}" maxlength="16" autocomplete="off" enterkeyhint="done" aria-label="Player ${i + 1} name">
            <button class="icon-btn" data-a="removePlayer" data-i="${i}" aria-label="Remove player" ${s.players.length <= 1 ? 'disabled' : ''}>${ICON.close}</button>
          </div>`).join('')}
        ${s.players.length < MAX_PLAYERS ? '<button class="btn ghost" data-a="addPlayer">+ Add player</button>' : ''}
      </div>
    </div>
    <div class="card">
      <h2>Match</h2>
      <div class="setting">
        <div><div>Games</div><div class="muted small">Most game wins takes the match</div></div>
        <div class="stepper">
          <button class="icon-btn" data-a="games" data-d="-1" aria-label="Fewer games">−</button>
          <output>${s.games}</output>
          <button class="icon-btn" data-a="games" data-d="1" aria-label="More games">+</button>
        </div>
      </div>
      <div class="setting" style="display:block">
        <div style="margin-bottom:8px">Dice</div>
        <div class="seg">
          <button class="${s.realDice ? '' : 'on'}" data-a="diceMode" data-v="virtual">Roll in app</button>
          <button class="${s.realDice ? 'on' : ''}" data-a="diceMode" data-v="real">Real dice</button>
        </div>
        <p class="muted small" style="margin:8px 0 0">${s.realDice ? 'Roll your own dice and tap in what you got — the app scores it.' : 'Roll up to 3 times per turn, tap dice to hold them.'}</p>
      </div>
    </div>
    <button class="btn primary block" data-a="start">Start ${s.games} game${s.games > 1 ? 's' : ''}</button>
  </main>`;
}

function winsChips(m) {
  const wins = m.players.map(() => 0);
  m.games.forEach((g) => g.result && gameWinners(g.result.totals).forEach((w, i) => w && wins[i]++));
  if (m.players.length < 2) return '';
  return `<div class="chips">${m.players.map((p, i) => `<span class="chip" style="box-shadow: inset 3px 0 0 ${color(i)}">${esc(p)} ${wins[i]}</span>`).join('')}</div>`;
}

function viewGame() {
  const m = S.match, g = curGame();
  const ready = diceReady(m);
  const ts = g.scores.map(totals);
  const cell = (cat, p) => {
    const sc = g.scores[p];
    if (filled(sc, cat.id)) return `<td class="${p === m.cur ? 'cur' : ''}${sc[cat.id] === 0 ? ' scratched' : ''}">${sc[cat.id] === 0 ? '–' : sc[cat.id]}</td>`;
    if (p !== m.cur) return '<td></td>';
    if (!ready) return `<td class="cur"></td>`;
    const v = scoreFor(cat.id, m.dice);
    const cls = ui.sel === cat.id ? 'sel' : v === 0 ? 'zero' : (cat.face ? v >= 3 * cat.face : true) ? 'good' : '';
    return `<td class="cur"><button class="cell-btn ${cls}" data-a="pick" data-cat="${cat.id}">${v}</button></td>`;
  };
  const row = (cat) => `<tr><th class="cat">${cat.label}<span class="hint">${cat.hint}</span></th>${m.players.map((_, p) => cell(cat, p)).join('')}</tr>`;
  const sumRow = (label, fn, cls = 'sum') => `<tr class="${cls}"><th class="cat">${label}</th>${ts.map((t, p) => `<td class="${p === m.cur ? 'cur' : ''}">${fn(t)}</td>`).join('')}</tr>`;
  const parTxt = (t) => {
    if (t.bonus) return '<span class="par pos">bonus ✓</span>';
    if (!UPPER.some((c) => filled(g.scores[ts.indexOf(t)], c.id))) return '';
    return `<span class="par ${t.par >= 0 ? 'pos' : 'neg'}">${t.par > 0 ? '+' : ''}${t.par}</span>`;
  };

  const selCat = ui.sel && CATS.find((c) => c.id === ui.sel);
  const selPts = selCat && ready ? scoreFor(selCat.id, m.dice) : 0;
  const scoreLabel = selCat ? `Score ${selPts} · ${selCat.label}` : 'Pick a field';

  let tray;
  if (m.realDice) {
    tray = `
      <div class="dice">${m.dice.map((v, i) => die(v, `data-a="die" data-i="${i}" aria-label="${v ? `Die showing ${v}, tap to clear` : 'Empty'}"`)).join('')}</div>
      <div class="faces">${[1, 2, 3, 4, 5, 6].map((v) => die(v, `data-a="face" data-v="${v}" aria-label="Add ${v}" ${ready ? 'disabled' : ''}`)).join('')}</div>
      <div class="actions">
        <button class="btn" data-a="clearDice">Clear</button>
        <button class="btn primary" data-a="score" ${selCat && ready ? '' : 'disabled'}>${ready ? scoreLabel : 'Enter 5 dice'}</button>
      </div>`;
  } else {
    const left = 3 - m.rolls;
    const hint = m.rolls === 0 ? 'Roll to start your turn' : left > 0 ? 'Tap dice to hold · pick a field to score' : 'No rolls left · pick a field to score';
    tray = `
      <div class="hint-line">${hint}</div>
      <div class="dice">${m.dice.map((v, i) => die(m.rolls ? v : 0, `data-a="die" data-i="${i}" aria-label="Die ${i + 1}${m.held[i] ? ', held' : ''}"`,
        `${m.held[i] && m.rolls ? 'held' : ''} ${ui.rolling.includes(i) ? 'rolling' : ''}`)).join('')}</div>
      <div class="actions">
        <button class="btn" data-a="roll" ${left > 0 ? '' : 'disabled'}>${m.rolls === 0 ? 'Roll' : `Roll again (${left})`}</button>
        <button class="btn primary" data-a="score" ${selCat && ready ? '' : 'disabled'}>${esc(scoreLabel)}</button>
      </div>`;
  }

  return `
  ${header(`Game ${m.games.length}`, `of ${m.totalGames}`,
    `<button class="icon-btn" data-a="home" aria-label="Menu">${ICON.back}</button>`,
    `${m.undo ? `<button class="icon-btn" data-a="undo" aria-label="Undo last score">${ICON.undo}</button>` : ''}
     <button class="icon-btn" data-a="stats" aria-label="Stats">${ICON.stats}</button>
     <button class="icon-btn" data-a="quit" aria-label="End match">End</button>`)}
  <main>
    <div class="status">
      <div class="turn"><span style="color:${color(m.cur)}">●</span> ${esc(m.players[m.cur])}'s turn</div>
      ${winsChips(m)}
    </div>
    <div class="sheet-wrap">
      <table class="sheet">
        <thead><tr><th class="cat"></th>${m.players.map((p, i) => `<th class="${i === m.cur ? 'cur' : ''}">${esc(p)}<span class="bar" style="background:${color(i)}"></span></th>`).join('')}</tr></thead>
        <tbody>
          ${UPPER.map(row).join('')}
          ${sumRow(`Upper <span class="hint">Bonus ${BONUS} at ${BONUS_AT}+</span>`, (t) => `${t.up}${parTxt(t)}`)}
          ${sumRow('Bonus', (t) => (t.bonus ? `+${t.bonus}` : '–'))}
          ${LOWER.map(row).join('')}
          ${sumRow('Total', (t) => t.total, 'sum total')}
        </tbody>
      </table>
    </div>
  </main>
  <div class="tray">${tray}</div>`;
}

function viewGameOver() {
  const m = S.match, g = curGame(), r = g.result;
  const order = m.players.map((p, i) => ({ p, i, t: r.totals[i] })).sort((a, b) => b.t - a.t);
  const w = gameWinners(r.totals);
  const winNames = m.players.filter((_, i) => w[i]);
  const last = m.games.length >= m.totalGames;
  const max = Math.max(...r.totals, 1);
  return `
  ${header(`Game ${m.games.length} finished`, `of ${m.totalGames}`, '', `<button class="icon-btn" data-a="undo" aria-label="Undo last score">${ICON.undo}</button>`)}
  <main>
    <div class="card winner">
      <div class="trophy">${m.players.length > 1 ? '🏆' : '🎲'}</div>
      <div class="name">${m.players.length > 1 ? `${esc(winNames.join(' & '))} ${winNames.length > 1 ? 'tie' : 'wins'}` : `${r.totals[0]} points`}</div>
      <div class="muted">${m.players.length > 1 ? `with ${order[0].t} points` : ''}</div>
    </div>
    <div class="card">
      <h2>This game</h2>
      <div class="bars">
        ${order.map((o) => `<div class="bar-row"><span class="name">${esc(o.p)}</span><div class="bar-track"><div class="bar-fill" style="width:${(o.t / max) * 100}%;background:${color(o.i)}"></div></div><span class="num">${o.t}</span></div>`).join('')}
      </div>
      ${m.players.length > 1 ? `<h3>Match standings</h3>${winsChips(m)}` : ''}
    </div>
    <button class="btn primary block" data-a="nextGame">${last ? 'See match results' : `Start game ${m.games.length + 1}`}</button>
  </main>`;
}

function statsTable(sum, ms) {
  const n = sum.players.length;
  const best = (key, low = false) => {
    const vals = ms.stats.map((s) => s[key]);
    const b = low ? Math.min(...vals) : Math.max(...vals);
    const allSame = vals.every((v) => v === vals[0]);
    return (v) => (n > 1 && !allSame && v === b ? 'best' : '');
  };
  const rows = [
    ['Game wins', 'wins', (v) => v],
    ['Total points', 'total', (v) => v],
    ['Average', 'avg', (v) => fmt(v, 1)],
    ['Best game', 'best', (v) => v],
    ['Worst game', 'worst', (v) => v],
    ['Upper avg', 'upAvg', (v) => fmt(v, 1)],
    ['Bonus hit', 'bonuses', (v) => `${v}/${sum.games.length}`],
    ['Kniffels', 'kniffels', (v) => v],
  ].filter(([, k]) => n > 1 || k !== 'wins');
  return `
    <div class="table-wrap"><table class="grid">
      <thead><tr><th></th>${ms.stats.map((s) => `<th style="color:${color(s.i)}">${esc(s.name)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, key, f]) => { const b = best(key); return `<tr><td>${label}</td>${ms.stats.map((s) => `<td class="${b(s[key])}">${f(s[key])}</td>`).join('')}</tr>`; }).join('')}</tbody>
    </table></div>`;
}

function gamesTable(sum) {
  return `
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>Game</th>${sum.players.map((p, i) => `<th style="color:${color(i)}">${esc(p)}</th>`).join('')}</tr></thead>
      <tbody>${sum.games.map((g, gi) => {
        const w = gameWinners(g.totals);
        return `<tr><td>${gi + 1}</td>${g.totals.map((t, i) => `<td class="${w[i] && sum.players.length > 1 ? 'best' : ''}">${t}${g.kniffels[i] ? ' ★' : ''}</td>`).join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>
    <p class="muted small" style="margin:8px 0 0">★ rolled a Kniffel that game</p>`;
}

function trendChart(sum) {
  // cumulative points per game as a small SVG line chart
  if (sum.games.length < 2) return '';
  const W = 320, Hh = 140, pad = 24;
  const cum = sum.players.map((_, i) => { let a = 0; return sum.games.map((g) => (a += g.totals[i])); });
  const max = Math.max(...cum.flat(), 1);
  const x = (k) => pad + (k * (W - 2 * pad)) / (sum.games.length - 1);
  const y = (v) => Hh - pad - (v / max) * (Hh - 2 * pad);
  const lines = cum.map((pts, i) => `<polyline fill="none" stroke="${color(i)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((v, k) => `${x(k)},${y(v)}`).join(' ')}"/>${pts.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="3" fill="${color(i)}"/>`).join('')}`).join('');
  const labels = sum.games.map((_, k) => `<text x="${x(k)}" y="${Hh - 6}" text-anchor="middle" font-size="10" fill="currentColor" opacity=".6">${k + 1}</text>`).join('');
  return `<h3>Cumulative points</h3><svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Cumulative points per game">
    <line x1="${pad}" x2="${W - pad}" y1="${Hh - pad}" y2="${Hh - pad}" stroke="currentColor" opacity=".15"/>${lines}${labels}</svg>`;
}

function viewResult() {
  const sum = S.result;
  const ms = matchStats(sum);
  const solo = sum.players.length === 1;
  const names = ms.winners.map((i) => sum.players[i]);
  const top = ms.stats[ms.winners[0]];
  return `
  ${header('Match results', `${sum.games.length} game${sum.games.length > 1 ? 's' : ''}`, '', `<button class="icon-btn" data-a="stats" aria-label="All-time stats">${ICON.stats}</button>`)}
  <main>
    <div class="card winner">
      <div class="trophy">${solo ? '🎲' : '🏆'}</div>
      <div class="name">${solo ? `${top.total} points` : `${esc(names.join(' & '))} ${names.length > 1 ? 'share the match' : 'wins the match'}`}</div>
      <div class="muted">${solo ? `Average ${fmt(top.avg, 1)} · best ${top.best}` : `${top.wins} game win${top.wins === 1 ? '' : 's'} · ${top.total} points`}</div>
    </div>
    <div class="card">
      <h2>Stats</h2>
      ${statsTable(sum, ms)}
      ${trendChart(sum)}
    </div>
    <div class="card">
      <h2>Games</h2>
      ${gamesTable(sum)}
    </div>
    <div class="stack">
      <button class="btn primary block" data-a="rematch">Rematch</button>
      <button class="btn block" data-a="home">New match</button>
    </div>
  </main>`;
}

function viewStats() {
  const rows = allTimeStats();
  const games = H.reduce((a, s) => a + s.games.length, 0);
  const allPts = H.flatMap((s) => s.games.flatMap((g) => g.totals.map((t, i) => ({ t, name: s.players[i], date: s.date }))));
  const high = allPts.reduce((a, b) => (b.t > (a?.t ?? -1) ? b : a), null);
  const kn = H.reduce((a, s) => a + s.games.reduce((b, g) => b + g.kniffels.reduce((c, k) => c + k, 0), 0), 0);
  const recent = H.slice().reverse().slice(0, 15);
  const backBtn = `<button class="icon-btn" data-a="back" aria-label="Back">${ICON.back}</button>`;
  if (!H.length) {
    return `${header('Stats', '', backBtn)}<main><div class="card empty-state">No finished matches yet.<br>Play a match and your stats show up here.</div></main>`;
  }
  return `
  ${header('Stats', 'all time', backBtn)}
  <main>
    <div class="tiles">
      <div class="tile"><div class="label">Matches</div><div class="val">${H.length}</div><div class="sub">${games} games</div></div>
      <div class="tile"><div class="label">High score</div><div class="val">${high ? high.t : '–'}</div><div class="sub">${high ? esc(high.name) : ''}</div></div>
      <div class="tile"><div class="label">Kniffels</div><div class="val">${kn}</div><div class="sub">${games ? fmt((kn / (games * 1)) , 2) : 0} per game</div></div>
    </div>
    <div class="card">
      <h2>Players</h2>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Player</th><th>Matches won</th><th>Games won</th><th>Avg</th><th>Best</th><th>Bonus</th><th>Kniffels</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.matchWins}/${r.matches}</td><td>${r.gameWins}/${r.games}</td><td>${fmt(r.points / r.games, 1)}</td><td>${r.best}</td><td>${fmt((100 * r.bonuses) / r.games)}%</td><td>${r.kniffels}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h2>Recent matches</h2>
      ${recent.map((s) => {
        const ms = matchStats(s);
        const solo = s.players.length === 1;
        return `<div class="history-item">
          <div class="row"><strong class="grow">${solo ? esc(s.players[0]) + ' (solo)' : esc(ms.winners.map((i) => s.players[i]).join(' & ')) + ' won'}</strong><span class="muted small">${new Date(s.date).toLocaleDateString()}</span></div>
          <div class="muted small">${ms.stats.map((x) => `${esc(x.name)} ${solo ? '' : x.wins + 'W · '}${x.total}`).join('  ·  ')} — ${s.games.length} game${s.games.length > 1 ? 's' : ''}</div>
        </div>`;
      }).join('')}
    </div>
    <button class="btn danger block" data-a="clearHistory">Clear all stats</button>
  </main>`;
}

const VIEWS = { setup: viewSetup, game: viewGame, gameover: viewGameOver, result: viewResult, stats: viewStats };

function render() {
  if ((S.view === 'game' || S.view === 'gameover') && !S.match) S.view = 'setup';
  if (S.view === 'result' && !S.result) S.view = 'setup';
  const app = document.getElementById('app');
  const prevView = app.dataset.view;
  const d = ui.dialog;
  app.innerHTML = VIEWS[S.view]() + (d ? `
    <div class="scrim" data-a="dialogNo"></div>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-text">
      <p id="dlg-text">${esc(d.text)}</p>
      <div class="actions">
        <button class="btn" data-a="dialogNo">Cancel</button>
        <button class="btn ${d.danger ? 'danger-solid' : 'primary'}" data-a="dialogYes">${esc(d.yes)}</button>
      </div>
    </div>` : '');
  app.dataset.view = S.view;
  if (prevView !== S.view) window.scrollTo(0, 0);
  ui.rolling = [];
}

/* ---------- Helpers ---------- */

function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ } }

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1900);
}

let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* not allowed */ }
}
function releaseAwake() { try { wakeLock && wakeLock.release(); } catch { /* ignore */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.match && S.view === 'game') keepAwake(); });

/* ---------- Wiring ---------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  if (fn(el.dataset) === false) return;
  save();
  render();
});

document.addEventListener('input', (e) => {
  if (e.target.dataset.in === 'player') {
    S.setup.players[+e.target.dataset.i] = e.target.value;
    save();
  }
});

render();
if (S.match && S.view === 'game') keepAwake();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
