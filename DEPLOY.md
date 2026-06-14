# Deploying CRC Quiz Duel

Two separate Vercel projects: the **backend** (Next.js API) and the
**frontend** (Vite mini app). Plus a free Upstash Redis for shared state.

## 1. Upstash Redis (2 min, required)

1. Sign up at https://upstash.com (free tier is plenty).
2. Create a Redis database (any region; pick one near your users).
3. Open the database → **REST API** section → copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## 2. Deploy the backend (API)

1. Push the repo to GitHub (or use `vercel` CLI from the `backend/` folder).
2. On Vercel: **New Project** → import the repo → set **Root Directory** to
   `backend`.
3. Add Environment Variables (from step 1):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Deploy. Note the URL, e.g. `https://crc-quiz-duel-backend.vercel.app`.
5. **Disable Deployment Protection** (Project Settings → Deployment Protection
   → off). The Jukebox example warns the mini app silently 401s inside the
   wallet iframe otherwise.

## 3. Deploy the frontend (mini app)

1. On Vercel: **New Project** → same repo → **Root Directory** = project root
   (where `index.html` / `vite.config.js` live).
2. Framework preset: **Vite**. Build command `npm run build`, output `dist`.
3. Add Environment Variable:
   - `VITE_API_BASE` = your backend URL from step 2.
4. Deploy. Note the URL, e.g. `https://crc-quiz-duel.vercel.app`.
5. **Disable Deployment Protection** here too.

## 4. Register as a Circles mini app

Submit your frontend URL via Circles Garage / the mini apps registry so Metri
can load it in its embedded host. (See the repo's `AGENTS.md` / mini apps
registry for the exact submission format — that's the step that lets Metri open
your app and connect the wallet.)

## Local dev recap

- Backend: `cd backend && npm install && npm run dev` (port 4000). Without
  Upstash vars it uses in-memory store — fine on one machine.
- Frontend: `npm install && npm run dev` (port 3000, `--host` for LAN).
- Outside the Circles wallet host you'll see "Standalone mode" — expected; the
  wallet only connects when Metri loads the app in its iframe.
