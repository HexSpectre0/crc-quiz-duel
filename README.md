# ⚔️ CRC Quiz Duel — Circles Mini App

Asynchronous 1v1 quiz duel where both players stake CRC. Best score takes the
pot. Native Circles settlement: no escrow — the loser sends their personal CRC
directly to the winner via Hub V2.

Built as a **Vite + vanilla JS** mini app (modeled on the official Circles
Jukebox example) + a small **Next.js backend** for match state and server-side
scoring/anti-cheat.

## Architecture

```
crc-quiz-duel-vite/
├── index.html            mini app shell
├── src/
│   ├── main.js           UI + routing (#/ and #/duel/<id>), wallet, settlement
│   ├── circles.js        miniapp-sdk wiring: onWalletChange, sendTransactions,
│   │                     trust/profile reads, settleLoss()
│   ├── game.js           pure scoring helpers (client copy)
│   ├── constants.js      Hub V2 address, RPCs, API base, config
│   ├── questions.json    111 international MCQ questions
│   └── style.css
└── backend/              Next.js — API only (match state + scoring)
    ├── app/api/match/{create,join,answer,state,settle}/route.js
    ├── app/api/leaderboard/route.js
    ├── lib/{game.js,store.js}
    └── middleware.js     CORS so the Vite frontend can call the API
```

**Why two pieces.** The mini app runs inside the Circles wallet (Metri) and
handles wallet + signing via `@aboutcircles/miniapp-sdk`. Match state, the
correct answers, and scoring live in the backend so answers never leak to the
client and a player can't replay or peek (server-side anti-cheat). The frontend
only ever sees questions *without* answers.

## How the wallet + settlement work (confirmed against the Jukebox example)

- Connect: `onWalletChange(cb)` → gives the connected address (or null).
- Settlement: `sendTransactions([{ to, data, value }])` bundles into one atomic
  Safe tx and returns tx hashes.
- The transfer is a native Hub V2 ERC-1155 `safeTransferFrom(from, to, tokenId,
  amount, "0x")`, encoded with `hubV2Abi` from `@aboutcircles/sdk-abis`.
- **Personal CRC**: `tokenId = BigInt(payerAddress)` (a personal-CRC token id is
  just the avatar address as a uint256). 1 CRC = 1e18 wei at par.

So when a duel ends, the **loser** taps "Pay X CRC to the winner" and their
wallet signs a `safeTransferFrom` of their personal CRC to the winner's address.

## Running locally (two servers)

Terminal 1 — backend (port 4000):
```bash
cd backend
npm install
npm run dev
```

Terminal 2 — frontend (port 3000):
```bash
npm install
npm run dev        # vite --host, LAN-accessible
```

The frontend calls the backend at `http://localhost:4000` by default
(`VITE_API_BASE` to override). CORS is handled by `backend/middleware.js`.

### Testing inside the Circles wallet

The mini app needs the wallet host to connect (`onWalletChange`). Outside it,
you'll see a "Standalone mode" banner and can browse the UI but not sign.
For a real test, run it as a mini app inside Metri / Gnosis App (embedded host),
or deploy and submit via Circles Garage (external deployments are supported).

## ⚠️ Must-fix before a public demo

1. **Persistent store.** `backend/lib/store.js` is in-memory. On serverless
   (Vercel) this won't survive between requests, and the duel is async (players
   return at different times) — so you NEED a shared store. Swap to **Upstash
   Redis** (free), keeping the same function names (`saveMatch`, `getMatch`,
   `getRep`, `recordResult`, `markSettled`, `leaderboard`).
2. **Trust read (verified).** `circles.js → getFriends()` uses
   `avatar.trust.getAll()`, reading the `relation` field
   ('trusts' | 'trustedBy' | 'mutuallyTrusts'). Matchmaking ranks
   `mutuallyTrusts` highest (two-way link = guaranteed settlement).
3. **Settlement verification.** `/api/match/settle` currently trusts the
   client's txHash. For production, verify the on-chain TransferSingle (correct
   from/to/amount) before clearing the unsettled flag.
4. **Mini app manifest.** To list in the store, add the entry in the Circles
   mini apps registry (`static/miniapps.json` in their repo) or follow the
   external-deployment path from Circles Garage.

## Anti-cheat (how it's enforced)

- Questions are frozen per match (seed) and served WITHOUT `answerIndex`.
- Answers are scored **server-side** (`/api/match/answer`); the client never
  receives the correct option.
- Replay protection: each question can be answered once; scores stay hidden
  until both players finish (`/api/match/state` masks scores while active).

## Game config

5 questions per duel, 4-choice MCQ, 15s timer (`src/constants.js`).
111 questions across Geography, Science, History, Sports, Math, Tech, Crypto,
Culture, Nature, Food, Human Body.

## Next steps (for progress notes)

- Week 5: **Flappy duel** — same match/settlement engine, swap quiz for a
  high-score mini-game.
- Streaks, one-tap rematch, weekly ladder aligned with Garage cycles.
