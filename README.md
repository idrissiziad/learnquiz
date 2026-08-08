# LearnQuiz

A self-hostable Next.js quiz platform. Fork it, deploy on Vercel (or any Node host), and create your own quiz modules from the dashboard. Modules and progress are persisted server-side, so it works out of the box on read-only hosts like Vercel.

## Quick start (local)

```bash
npm install
npm run dev
```

Open http://localhost:3000. In **local dev**, data is stored on the filesystem under `data/` (auto-created, gitignored). Drop a `<name>.json` of questions into `src/data/modules/` and add a module from the dashboard, or create one entirely from the UI.

## Deploy

### Vercel (recommended)

1. Fork / import this repository on [Vercel](https://vercel.com/new).
2. Create a free **Upstash Redis** database at https://console.upstash.com (Redis tab → *+ Create Database*). Vercel's own "KV" storage has been deprecated — Upstash speaks the same REST API and is the supported path.
3. From the Upstash database page, copy the **REST URL** and **REST Token**.
4. In your Vercel project → **Settings → Environment Variables**, add:
   - `UPSTASH_REDIS_REST_URL` = the REST URL
   - `UPSTASH_REDIS_REST_TOKEN` = the REST token
5. Deploy from the dashboard, or from your machine:

   ```bash
   npm i -g vercel
   npm run deploy
   ```

That's it — modules you create from the dashboard persist in the Redis store.

### Other platforms (Netlify, Cloudflare Pages, Render, fly.io, …)

This is a standard Next.js app with Node API routes. Any host with Node 18+ that runs `next build` / `next start` works. Configure a Redis REST store and set:

```
KV_REST_API_URL=https://<your-upstash-or-vercel-kv-endpoint>
KV_REST_API_TOKEN=<your-token>
```

(Upstash REST URLs and Vercel KV URLs are interchangeable — both speak the same REST API.)

```bash
DEPLOY_PLATFORM=netlify    npm run deploy   # or: cloudflare | render
```

Or build and run manually:

```bash
npm run build && npm start
```

## How storage works

`src/lib/storage.ts` auto-selects a backend at runtime:

- **Server / prod** — if `KV_REST_API_URL` + `KV_REST_API_TOKEN` are present, modules, content, and progress are stored as JSON values in Redis (via REST HTTP — no driver dependency).
- **Local dev** — otherwise, data is stored as JSON files under `data/` (gitignored). No setup required.

Uploaded question images are stored inline as base64 `data:` URLs inside the question JSON, so no separate object storage is needed. The upload limit is ~1.5 MB per image to keep question files reasonable.

## Project layout

- `src/app/api/modules/*` — list/add/edit/manage/stats endpoints (all persist via `src/lib/storage.ts`)
- `src/app/api/progress`, `src/app/api/answer` — per-user answer progress
- `src/lib/storage.ts` — env-agnostic storage abstraction (Redis REST / local filesystem)
- `src/data/modules/index.ts` — type definitions and pure helpers only; the live module list is loaded at runtime from `/api/modules`
- `src/data/modules/client.ts` — `useLiveModules()` hook + question fetchers for the client

## Notes

- The repository ships with **no modules**. Create your own from the dashboard (Tableau de bord → Ajouter des questions).
-_quiz content you authored is meant to live in your own deployment, not in the repo_ — keep the publicly-shared repo free of personal content.