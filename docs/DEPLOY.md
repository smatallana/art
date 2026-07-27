# Deployment & operations

Everything deploys from GitHub Actions; no manual server steps. Credentials
live only in GitHub Secrets (never in the repo).

## Frontend — GitHub Pages
- Workflow: `.github/workflows/deploy-pages.yml` (push → build with
  `BASE_PATH=/art` → `actions/deploy-pages`).
- One-time setting (already done): Settings → Pages → Source = GitHub Actions.
- URL: `https://smatallana.github.io/art/`.

## API — Cloudflare Worker + D1
- Workflow: `.github/workflows/deploy-worker.yml` (push touching `worker/**`).
  Steps: credential check → idempotent `d1 create` + id substitution into
  `wrangler.toml` → migrations → optional Google secrets → workers.dev
  subdomain auto-registration → `wrangler deploy` → `/health` smoke test
  with DNS-propagation retries.
- Required repo secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts / D1 / R2:
  Edit), `CLOUDFLARE_ACCOUNT_ID`.
- Live URL: `https://beholder-api.beholder-app.workers.dev` (also set in
  `app/static/api-config.json`; empty value = pure guest mode).

## Google sign-in (one-time, ~10 min)
1. console.cloud.google.com → new project (any name) → *APIs & Services →
   OAuth consent screen*: External, app name "Beholder", add yourself as
   test user (or publish).
2. *Credentials → Create credentials → OAuth client ID → Web application*:
   - Authorized redirect URI:
     `https://beholder-api.beholder-app.workers.dev/auth/google/callback`
3. Add repo secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then
   re-run "Deploy worker". `/health` flips to `"auth":"google"` and the app
   shows the sign-in button automatically.

## Catalog operations
- **Rebuild catalog**: Actions → "Catalog pipeline" → `build`
  (inputs: limit per source, sources). Commits `app/static/catalog/` →
  Pages redeploys.
- **Regenerate embeddings** (after a catalog change): mode `embed`. The
  stage is incremental: it reuses committed vectors and only fetches works
  that don't have one yet, so partial runs always make forward progress.
- **Filling AIC embeddings** — AIC's CDN serves a Cloudflare challenge to
  datacenter IPs (see DECISIONS 2026-07-27), so the Actions runner cannot
  fetch their images; a home connection can (their etiquette: 1 req/s,
  which the stage already enforces). One-off from any machine with Node 20+:

  ```bash
  git clone https://github.com/smatallana/art && cd art
  git checkout claude/arte-painting-discovery-app-nh09q4
  npm ci
  npm run -w pipeline run embed        # ~30 min, fetches only missing works
  git add app/static/catalog && git commit -m "pipeline: embed — AIC coverage"
  git push
  ```

  Then Actions → "Deploy to GitHub Pages" → Run workflow (or wait for the
  next push) so the live app picks it up.
- Reports are uploaded as workflow artifacts; rejects/dedupe/image stats in
  the job log.

## Data recovery & migration
- **User data**: D1 is the source of truth for signed-in users
  (`npx wrangler d1 export beholder-db --remote` → standard SQL). Each user
  can self-export JSON from Settings or `GET /export`.
- **Catalog**: fully reproducible from the pipeline; also versioned in git.
- **Leave Cloudflare**: export D1 to SQL (any SQLite/Postgres host),
  reimplement the 8 worker endpoints anywhere (they are plain fetch
  handlers), point `api-config.json` at the new base URL.
- **Leave Pages**: any static host serves `app/build` unchanged (set
  BASE_PATH accordingly).

## Known operational notes
- Scheduled workflows in public repos auto-disable after 60 days without
  repo activity (GitHub policy) — re-enable from the Actions tab.
- Fresh workers.dev subdomains take a few minutes of DNS propagation.
- Free-tier ceilings and upgrade path: see ARCHITECTURE.md.
