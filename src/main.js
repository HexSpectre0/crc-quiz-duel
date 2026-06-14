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
        <button id="practice" class="btn" style="background:#e1a33b">🤖 Practice vs bot (try it solo)</button>
        <button id="random" class="btn btn-green" style="margin-top:8px">🎲 Random opponent (similar trust)</button>
        <div class="divider">…or challenge a friend:</div>
        <div id="friends"><p class="hint">Loading your trust graph…</p></div>
      </section>
      <section class="card">
        <h2>Join a duel</h2>
        <p class="hint">Got a code from a friend? Enter it to join their duel.</p>
        <input id="join-code" placeholder="Duel code" />
        <button id="join-btn" class="btn">Join duel</button>
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

  document.getElementById('practice')?.addEventListener('click', () => createDuel(null, true));

  document.getElementById('random')?.addEventListener('click', async () => {
    try {
      const opp = await getRandomOpponent(me);
      if (!opp) return toast('No one in your trust graph yet. Invite a friend!');
      createDuel(opp.address);
    } catch (e) { toast('Error: ' + e.message); }
  });

  // Join an existing duel by code (the opponent's path).
  document.getElementById('join-btn')?.addEventListener('click', () => {
    const code = document.getElementById('join-code')?.value.trim();
    if (!code) return toast('Enter a duel code first.');
    location.hash = `#/duel/${code}`;
  });
}

async function createDuel(opponent, practice = false) {
  const stake = Number(document.getElementById('stake')?.value || 10);
  try {
    const data = await api('/api/match/create', {
      method: 'POST',
      body: JSON.stringify({ creator: me, stake, opponent, practice, mode: practice ? 'practice' : 'friend' }),
    });
    if (practice) sessionStorage.setItem(`practice:${data.matchId}`, '1');
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

  view.innerHTML = `<div class="card"><p class="hint">Loading duel…</p></div>`;
  let match;
  try {
    match = await api('/api/match/join', {
      method: 'POST',
      body: JSON.stringify({ matchId, opponent: me }),
    });
  } catch (e) {
    view.innerHTML = `<div class="card"><p class="hint">Couldn't join: ${esc(e.message)}</p></div>`;
    return;
  }

  const isPractice = sessionStorage.getItem(`practice:${matchId}`) === '1' || match.mode === 'practice';

  // The creator first sees a share screen with the duel code, so the opponent
  // can join with it. The opponent goes straight to the questions.
  // In practice mode there's no human to invite → skip straight to the quiz.
  if (match.role === 'creator' && !isPractice) {
    const startedKey = `started:${matchId}`;
    if (!sessionStorage.getItem(startedKey)) {
      view.innerHTML = `
        <div class="card">
          <h2>Duel created 🎮</h2>
          <p class="hint">Share this code with your opponent. They enter it on the
          home screen to join. You both answer the same 5 questions; the higher
          score wins the pot.</p>
          <div class="code-box" id="code">${esc(matchId)}</div>
          <button id="copy" class="btn" style="background:#444">Copy code</button>
          <button id="start" class="btn">Start playing →</button>
        </div>`;
      document.getElementById('copy').addEventListener('click', () => {
        navigator.clipboard?.writeText(matchId).then(() => toast('Code copied!'), () => {});
      });
      document.getElementById('start').addEventListener('click', () => {
        sessionStorage.setItem(startedKey, '1');
        playQuestions(matchId, match.questions, match.secondsPerQuestion || SECONDS_PER_QUESTION);
      });
      return;
    }
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
  const isPractice = sessionStorage.getItem(`practice:${matchId}`) === '1' || state.mode === 'practice';

  view.innerHTML = `
    <div class="card result">
      ${isPractice ? `<div class="practice-banner">🤖 Practice mode — no real CRC moved</div>` : ''}
      <h1>${iWon ? '🎉 You won!' : '😤 You lost'}</h1>
      <p>Pot: <b>${stake} CRC</b></p>
      ${iWon
        ? `<p class="hint">${isPractice
              ? 'In a real duel, your opponent would send you the stake here.'
              : "Your opponent will send you the stake. It'll show up in your wallet."}</p>`
        : `<button id="settle" class="btn">${isPractice ? `Simulate paying ${stake} CRC` : `Pay ${stake} CRC to the winner`}</button>`}
      <p id="settle-status" class="hint"></p>
      <a href="#/" class="link">← New duel</a>
    </div>
  `;

  if (!iWon) {
    document.getElementById('settle').addEventListener('click', async () => {
      const status = document.getElementById('settle-status');
      const btn = document.getElementById('settle');
      btn.disabled = true;

      // Practice: simulate the settlement (you can't send CRC to a bot, and
      // never to yourself). Clearly labelled so it's not misleading.
      if (isPractice) {
        status.textContent = 'Simulating transfer…';
        setTimeout(() => { status.textContent = '✅ (Simulated) Stake would be sent to the winner. In a real duel this is an on-chain CRC transfer.'; }, 800);
        return;
      }

      status.textContent = 'Confirm the transaction in your wallet…';
      try {
        const hash = await settleLoss(me, state.result.winner, stake);
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
