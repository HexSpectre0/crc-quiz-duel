// src/main.js
// CRC Quiz Duel — miniapp frontend (Vite + vanilla JS), modeled on the Jukebox.
// Wallet via @aboutcircles/miniapp-sdk. Game state/scoring lives in the backend
// (Next.js API). Settlement = loser pays winner in personal CRC.

// @ts-nocheck
import {
  onWalletChange,
  isMiniappMode,
  getProfile,
  getFriends,
  getRandomOpponent,
  settleLoss,
  debugTrust,
} from './circles.js';
import { API_BASE, SECONDS_PER_QUESTION } from './constants.js';

// ─── State ──────────────────────────────────────────────────
let me = null; // connected address
const view = document.getElementById('view');
const badge = document.getElementById('badge');

// ─── Routing (hash-based: #/  or  #/duel/<id>) ──────────────
function route() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/duel/')) {
    const id = hash.slice('#/duel/'.length);
    renderDuel(id);
  } else {
    renderHome();
  }
}
window.addEventListener('hashchange', route);

// ─── API helpers ────────────────────────────────────────────
async function api(path, opts) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Wallet connection ──────────────────────────────────────
onWalletChange((address) => {
  if (!address) {
    me = null;
    badge.textContent = 'Not connected';
    badge.className = 'badge badge-disconnected';
  } else {
    me = address;
    badge.textContent = `${address.slice(0, 6)}…${address.slice(-4)}`;
    badge.className = 'badge badge-connected';
  }
  route(); // re-render current screen with new wallet state
});

// ─── HOME ───────────────────────────────────────────────────
async function renderHome() {
  view.innerHTML = `
    <p class="tagline">Challenge a friend, stake your CRC, the best quiz takes the pot.</p>
    ${!me ? `<p class="hint">Open this inside the Circles wallet to connect and play.</p>` : `
      <section class="card">
        <label>Stake (CRC)</label>
        <input id="stake" type="number" min="1" value="10" />
      </section>
      <section class="card">
        <h2>Pick an opponent</h2>
        <button id="random" class="btn btn-green">🎲 Random opponent (similar trust)</button>
        <div class="divider">…or challenge a friend:</div>
        <div id="friends"><p class="hint">Loading your trust graph…</p></div>
        <button id="debug-trust" class="btn" style="background:#444;margin-top:14px;font-size:13px">🔍 Debug trust (temp)</button>
        <pre id="debug-out" style="white-space:pre-wrap;font-size:11px;color:#9b8cff;background:#0f1020;border-radius:8px;padding:10px;margin-top:8px;display:none;overflow-x:auto"></pre>
      </section>
    `}
    <section class="card">
      <h2>🏆 Leaderboard</h2>
      <div id="board"><p class="hint">Loading…</p></div>
    </section>
  `;

  // leaderboard
  api('/api/leaderboard').then(({ leaderboard }) => {
    const el = document.getElementById('board');
    if (!el) return;
    el.innerHTML = (leaderboard && leaderboard.length)
      ? leaderboard.map((r, i) =>
          `<div class="row"><span>${i + 1}. ${short(r.address)}</span>
           <span>${r.totalCrcWon} CRC · ${r.wins}W/${r.losses}L${r.unsettled ? ` · ⚠️${r.unsettled}` : ''}</span></div>`
        ).join('')
      : '<p class="hint">No duels yet.</p>';
  }).catch(() => {});

  if (!me) return;

  // friends list
  getFriends(me).then((friends) => {
    const el = document.getElementById('friends');
    if (!el) return;
    if (!friends.length) {
      el.innerHTML = '<p class="hint">No friends in your trust graph yet. Invite someone on Circles to play!</p>';
      return;
    }
    el.innerHTML = friends.map((f) =>
      `<button class="friend-row" data-addr="${f.address}">
         <span>${short(f.address)}</span>
         <span class="trust">${f.mutual ? '🤝 mutual' : 'trusted'}</span>
       </button>`
    ).join('');
    el.querySelectorAll('.friend-row').forEach((b) =>
      b.addEventListener('click', () => createDuel(b.dataset.addr))
    );
  }).catch((e) => {
    const el = document.getElementById('friends');
    if (el) el.innerHTML = `<p class="hint">Couldn't load trust graph: ${esc(e.message)}</p>`;
  });

  document.getElementById('random')?.addEventListener('click', async () => {
    try {
      const opp = await getRandomOpponent(me);
      if (!opp) return toast('No one in your trust graph yet. Invite a friend!');
      createDuel(opp.address);
    } catch (e) { toast('Error: ' + e.message); }
  });

  // Temporary debug button: shows what the trust read actually returns.
  document.getElementById('debug-trust')?.addEventListener('click', async () => {
    const out = document.getElementById('debug-out');
    out.style.display = 'block';
    out.textContent = 'Reading trust graph…';
    try {
      const report = await debugTrust(me);
      out.textContent = JSON.stringify(report, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    } catch (e) {
      out.textContent = 'debug error: ' + (e?.message || String(e));
    }
  });
}

async function createDuel(opponent) {
  const stake = Number(document.getElementById('stake')?.value || 10);
  try {
    const data = await api('/api/match/create', {
      method: 'POST',
      body: JSON.stringify({ creator: me, stake, opponent, mode: 'friend' }),
    });
    location.hash = `#/duel/${data.matchId}`;
  } catch (e) { toast('Error: ' + e.message); }
}

// ─── DUEL ───────────────────────────────────────────────────
async function renderDuel(matchId) {
  if (!me) {
    view.innerHTML = `<div class="card"><h2>Duel #${esc(matchId)}</h2>
      <p class="hint">Open this inside the Circles wallet to join the duel.</p></div>`;
    return;
  }

  view.innerHTML = `<div class="card"><p class="hint">Joining duel…</p></div>`;
  let match;
  try {
    // join is idempotent server-side; returns questions (without answers)
    match = await api('/api/match/join', {
      method: 'POST',
      body: JSON.stringify({ matchId, opponent: me }),
    });
  } catch (e) {
    view.innerHTML = `<div class="card"><p class="hint">Couldn't join: ${esc(e.message)}</p></div>`;
    return;
  }

  await playQuestions(matchId, match.questions, match.secondsPerQuestion || SECONDS_PER_QUESTION);
}

async function playQuestions(matchId, questions, secs) {
  let qIndex = 0;

  const showQuestion = () => {
    if (qIndex >= questions.length) return waitForOpponent(matchId);
    const q = questions[qIndex];
    let timeLeft = secs;
    let answered = false;
    const qStart = Date.now();

    view.innerHTML = `
      <div class="card duel">
        <div class="duel-top">
          <span class="hint">Question ${qIndex + 1}/${questions.length}</span>
          <span id="timer" class="timer">${timeLeft}s</span>
        </div>
        <h2 class="question">${esc(q.q)}</h2>
        <div class="cat">${esc(q.category)}</div>
        <div class="choices">
          ${q.choices.map((c, i) => `<button class="choice" data-i="${i}">${esc(c)}</button>`).join('')}
        </div>
      </div>
    `;

    const timerEl = document.getElementById('timer');
    const tick = setInterval(() => {
      timeLeft -= 1;
      if (timerEl) {
        timerEl.textContent = `${timeLeft}s`;
        if (timeLeft <= 5) timerEl.classList.add('low');
      }
      if (timeLeft <= 0) { clearInterval(tick); if (!answered) submit(-1); }
    }, 1000);

    const submit = async (choiceIndex) => {
      if (answered) return;
      answered = true;
      clearInterval(tick);
      const ms = Date.now() - qStart;
      try {
        const r = await api('/api/match/answer', {
          method: 'POST',
          body: JSON.stringify({ matchId, address: me, qIndex, choiceIndex, ms }),
        });
        if (r.finished) return waitForOpponent(matchId);
        qIndex += 1;
        showQuestion();
      } catch (e) { toast('Error: ' + e.message); }
    };

    view.querySelectorAll('.choice').forEach((b) =>
      b.addEventListener('click', () => submit(Number(b.dataset.i)))
    );
  };

  showQuestion();
}

// ─── WAIT + RESULT ──────────────────────────────────────────
function waitForOpponent(matchId) {
  view.innerHTML = `<div class="card"><h2>Done!</h2>
    <p class="hint">Waiting for your opponent… ⏳<br/>You can close and come back.</p></div>`;

  const poll = setInterval(async () => {
    try {
      const s = await api(`/api/match/state?matchId=${matchId}`);
      if (s.status === 'finished') {
        clearInterval(poll);
        renderResult(matchId, s);
      }
    } catch { /* keep polling */ }
  }, 2500);
}

function renderResult(matchId, state) {
  const iWon = state.result.winner.toLowerCase() === me.toLowerCase();
  const stake = state.stake;

  view.innerHTML = `
    <div class="card result">
      <h1>${iWon ? '🎉 You won!' : '😤 You lost'}</h1>
      <p>Pot: <b>${stake} CRC</b></p>
      ${iWon
        ? `<p class="hint">Your opponent will send you the stake. It'll show up in your wallet.</p>`
        : `<button id="settle" class="btn">Pay ${stake} CRC to the winner</button>`}
      <p id="settle-status" class="hint"></p>
      <a href="#/" class="link">← New duel</a>
    </div>
  `;

  if (!iWon) {
    document.getElementById('settle').addEventListener('click', async () => {
      const status = document.getElementById('settle-status');
      const btn = document.getElementById('settle');
      btn.disabled = true;
      status.textContent = 'Confirm the transaction in your wallet…';
      try {
        const hash = await settleLoss(me, state.result.winner, stake);
        // tell backend it's settled (clears the "unsettled" flag)
        try {
          await api('/api/match/settle', {
            method: 'POST',
            body: JSON.stringify({ matchId, loser: me, txHash: hash }),
          });
        } catch { /* non-blocking */ }
        status.textContent = '✅ Stake sent to the winner. GG!';
      } catch (e) {
        status.textContent = 'Transfer failed: ' + e.message;
        btn.disabled = false;
      }
    });
  }
}

// ─── utils ──────────────────────────────────────────────────
function short(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : ''; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ─── init ───────────────────────────────────────────────────
route();
if (!isMiniappMode()) {
  document.body.insertAdjacentHTML('afterbegin',
    '<div class="standalone-warn">⚠️ Standalone mode — connect inside the Circles wallet to play with CRC.</div>');
}
