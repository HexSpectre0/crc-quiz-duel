// lib/store.js
// -----------------------------------------------------------------------------
// Persistent store with two backends, selected automatically:
//   • If UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set →
//     Upstash Redis over REST (works on Vercel serverless: state survives
//     across requests and instances). This is what you use in production.
//   • Otherwise → in-memory Map (fine for `npm run dev` on one machine).
//
// All functions are ASYNC (Redis is async). The API routes await them.
// Interface kept stable: saveMatch, getMatch, getRep, recordResult,
// markSettled, leaderboard.
// -----------------------------------------------------------------------------

const REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(REST_URL && TOKEN);

const MATCH_PREFIX = 'match:';
const REP_PREFIX = 'rep:';
const REP_INDEX = 'rep:index'; // a set of all addresses with a reputation

// ─── Upstash REST helper ────────────────────────────────────
// Upstash exposes a simple REST API: POST a command array, get { result }.
async function redis(command) {
  const res = await fetch(REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  const data = await res.json();
  return data.result;
}

// ─── In-memory fallback ─────────────────────────────────────
const memMatches = new Map();
const memRep = new Map();
const memPlayerMatches = new Map(); // address -> Set<matchId>

// ─── Matches ────────────────────────────────────────────────
const PLAYER_MATCHES_PREFIX = 'player_matches:'; // set of match ids per address

export async function saveMatch(match) {
  if (useRedis) {
    await redis(['SET', MATCH_PREFIX + match.id, JSON.stringify(match)]);
    // index this match under each human player so we can list a player's duels
    for (const addr of Object.keys(match.players || {})) {
      if (match.players[addr]?.isBot) continue;
      await redis(['SADD', PLAYER_MATCHES_PREFIX + addr, match.id]);
    }
  } else {
    memMatches.set(match.id, match);
    for (const addr of Object.keys(match.players || {})) {
      if (match.players[addr]?.isBot) continue;
      if (!memPlayerMatches.has(addr)) memPlayerMatches.set(addr, new Set());
      memPlayerMatches.get(addr).add(match.id);
    }
  }
  return match;
}

export async function getMatch(id) {
  if (useRedis) {
    const raw = await redis(['GET', MATCH_PREFIX + id]);
    return raw ? JSON.parse(raw) : null;
  }
  return memMatches.get(id) || null;
}

// All matches a player is part of (newest first). Powers the "your duels" list
// and the unsettled-debt banner.
export async function getMatchesForPlayer(address) {
  const a = address.toLowerCase();
  let ids = [];
  if (useRedis) {
    ids = (await redis(['SMEMBERS', PLAYER_MATCHES_PREFIX + a])) || [];
  } else {
    ids = Array.from(memPlayerMatches.get(a) || []);
  }
  const matches = [];
  for (const id of ids) {
    const m = await getMatch(id);
    if (m) matches.push(m);
  }
  matches.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
  return matches;
}

// ─── Reputation ─────────────────────────────────────────────
function emptyRep(address) {
  return { address: address.toLowerCase(), wins: 0, losses: 0, unsettled: 0, totalCrcWon: 0 };
}

export async function getRep(address) {
  const a = address.toLowerCase();
  if (useRedis) {
    const raw = await redis(['GET', REP_PREFIX + a]);
    return raw ? JSON.parse(raw) : emptyRep(a);
  }
  if (!memRep.has(a)) memRep.set(a, emptyRep(a));
  return memRep.get(a);
}

async function saveRep(rep) {
  const a = rep.address.toLowerCase();
  if (useRedis) {
    await redis(['SET', REP_PREFIX + a, JSON.stringify(rep)]);
    await redis(['SADD', REP_INDEX, a]);
  } else {
    memRep.set(a, rep);
  }
}

export async function recordResult({ winner, loser, stake }) {
  const w = await getRep(winner);
  const l = await getRep(loser);
  w.wins += 1;
  w.totalCrcWon += stake;
  l.losses += 1;
  l.unsettled += 1; // loser still has to sign the transfer
  await saveRep(w);
  await saveRep(l);
}

export async function markSettled(loser) {
  const l = await getRep(loser);
  if (l.unsettled > 0) l.unsettled -= 1;
  await saveRep(l);
}

export async function leaderboard(limit = 20) {
  let reps = [];
  if (useRedis) {
    const addrs = (await redis(['SMEMBERS', REP_INDEX])) || [];
    for (const a of addrs) {
      const raw = await redis(['GET', REP_PREFIX + a]);
      if (raw) reps.push(JSON.parse(raw));
    }
  } else {
    reps = Array.from(memRep.values());
  }
  return reps
    .sort((a, b) => b.totalCrcWon - a.totalCrcWon || b.wins - a.wins)
    .slice(0, limit);
}
