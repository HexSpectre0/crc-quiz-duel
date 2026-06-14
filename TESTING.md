# Testing CRC Quiz Duel in the Circles wallet

The mini app only connects a wallet when loaded inside the Circles host
(the iframe + postMessage bridge). Outside it, you see "Standalone mode" — normal.
The fastest way to test with a real wallet, no deployment needed:

## Option A — Circles Playground + ngrok (fastest)

The official tester: https://circles.gnosis.io/playground

1. Run backend + frontend locally:
   ```
   cd backend && npm install && npm run dev      # port 4000
   npm install && npm run dev                     # port 3000 (root)
   ```
2. Expose the FRONTEND over HTTPS (the host requires HTTPS, no http://):
   ```
   npx ngrok http 3000
   ```
   Copy the `https://xxxx.ngrok.app` URL.
3. Because the frontend calls the backend, also expose the backend and point
   the frontend at it. Two options:
   - Simplest: deploy the backend to Vercel once and set `VITE_API_BASE` to it,
     then only ngrok the frontend; OR
   - ngrok the backend too (second tunnel) and set `VITE_API_BASE` to that URL
     before `npm run dev`.
4. Open the Playground, load your ngrok frontend URL. The wallet bridge connects
   and `onWalletChange` fires with your real Circles address.
5. Play a duel; on loss, tap "Pay X CRC" — the host shows the approval popup.

> ngrok free URLs change each run; update VITE_API_BASE / Playground each time.
> For a stable test, deploy to Vercel (see DEPLOY.md).

## Option B — Deploy then test

Deploy per DEPLOY.md, then load your Vercel URL in the Playground (or submit to
Garage so it appears in the marketplace). Remember: **disable Vercel Deployment
Protection** or the iframe silently 401s.

## Submitting to Circles Garage

Garage = the marketplace section for hackathon/community apps. Submission is just
a manifest entry — your app stays on your own deployment.

1. Deploy your frontend (HTTPS, must be iframe-embeddable — no X-Frame-Options:
   DENY, no restrictive frame-ancestors).
2. Fork `aboutcircles/CirclesMiniapps`, add the entry from
   `garage-manifest-entry.json` (this folder) to `static/miniapps.json` with your
   real deployed `url`, and commit a square logo to `static/app-logos/`.
3. PR against `master`, title: `feat: add CRC Quiz Duel (garage)`.

Note: `strongDisclaimer: true` is set because the app moves user CRC (stake/pot);
the host will show the "use at your own risk" notice. Adjust if not wanted.
