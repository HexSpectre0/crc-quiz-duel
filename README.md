# ⚔️ CRC Quiz Duel

**Challenge a friend, stake your CRC, the best quiz takes the pot.**
A 1v1 quiz duel built as a Circles Mini App — matched through your trust graph
and settled natively in CRC, with no escrow and no middleman.

🎮 **Play now (Circles Playground):**
https://circles.gnosis.io/playground?url=https%3A%2F%2Fcrc-quiz-duel-mjo5.vercel.app%2F

🤖 **No second player? Tap "Practice vs bot"** to see the whole flow solo
(quiz → scoring → result → settlement).

---

## Why it fits Circles

Circles is money issued by people, backed by trust. CRC Quiz Duel turns that
trust into the core game mechanic:

- **Trust as matchmaking.** You only duel people in your trust graph. The app
  reads your aggregated trust relations and ranks **mutual trust** highest — a
  two-way link is what makes a stake safe to settle.
- **Trust as settlement.** No escrow contract. When a duel ends, the **loser
  sends their personal CRC directly to the winner** via a native Hub V2
  transfer — the social link is the guarantee. "Money issued by people," played.
- **Debts are honoured socially.** Lose and you owe: a blocking banner stops you
  starting new duels until you've paid your opponent. The trust graph keeps the
  game honest.
- **Built-in invite loop.** "Challenge a friend" pulls people into Circles — to
  play, a friend needs a wallet, i.e. a new wallet in the ecosystem.

A non-crypto person understands a quiz instantly; the challenge → result →
rematch loop brings them back, and every duel exercises real Circles primitives.

## How it works

1. Open inside the Circles wallet — your address connects automatically.
2. Set a stake (CRC) and pick an opponent: a friend from your trust graph, a
   random opponent of similar trust, or the practice bot.
3. For a friend duel you get a short **code** to share; they join with it. Both
   answer the **same 5 questions** (4-choice, 15s each), frozen at creation so
   it's fair.
4. Higher score wins (ties broken by speed). The **loser signs a CRC transfer**
   to the winner in their wallet. Until they pay, they can't start a new duel.
5. Reconnect any time: your active duels and any unsettled debt are shown on the
   home screen.

---

## Technical overview

**Vite + vanilla JS** mini app (front) + a small **Next.js API** (match state,
server-side scoring), modeled on the official Circles Jukebox example.

```
├── index.html / src/
│   ├── main.js        UI, routing, wallet, duels list, debt banner, settlement
│   ├── circles.js     miniapp-sdk: onWalletChange, sendTransactions,
│   │                  trust reads (getAggregatedTrustRelations), settleLoss()
│   ├── game.js        client-side scoring helpers
│   ├── constants.js   Hub V2 address, RPCs, config
│   ├── questions.json 100+ international MCQ questions
│   └── style.css
└── backend/           Next.js — API only
    ├── app/api/match/{create,join,answer,state,settle}/route.js
    ├── app/api/player/duels/route.js     active duels + unsettled debts
    ├── app/api/leaderboard/route.js
    ├── lib/{game.js,store.js}            store: Upstash Redis + mem fallback
    └── middleware.js                     CORS
```

### Circles integration

- **Wallet** via `@aboutcircles/miniapp-sdk`: `onWalletChange` (connect),
  `sendTransactions` (atomic Safe bundle) — embedded host bridge.
- **Reads** via `@aboutcircles/sdk`: aggregated trust relations, profiles.
- **Settlement**: native Hub V2 ERC-1155
  `safeTransferFrom(loser, winner, tokenId, amount, "0x")`, encoded with
  `hubV2Abi`. Personal CRC → `tokenId = uint256(loser address)`, 1 CRC = 1e18 wei.
- Gnosis Chain (100), `viem`, lazy SDK construction, hex tx fields. Conforms to
  the Garage transaction policy (no `execTransaction`, never targets the user's
  own Safe — settlement is always loser → winner, two distinct addresses).

### Anti-cheat

Questions are frozen per match (seed) and served **without** the answer key.
Scoring is **server-side**; the client never receives correct answers. One
answer per question (replay protection); scores hidden until both finish.

## Run locally

```bash
cd backend && npm install && npm run dev   # port 4000, set UPSTASH_REDIS_REST_URL/TOKEN
npm install && npm run dev                  # port 3000, set VITE_API_BASE to the backend
```

Deployed on Vercel (frontend at repo root, backend in `backend/`). The mini app
connects a wallet only inside the Circles host; in a plain browser it shows a
"standalone mode" notice — expected.

## Roadmap

- **Flappy duel** — same match + settlement engine, swap the quiz for a
  high-score arcade game.
- One-tap rematch, streaks, and a weekly ladder aligned with Garage cycles.
