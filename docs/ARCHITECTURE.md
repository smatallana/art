# Architecture

## Shape

```
GitHub Pages (static)                      Cloudflare (free tier)
┌──────────────────────────────┐           ┌─────────────────────────────┐
│ SvelteKit PWA  /art/         │  HTTPS    │ Worker  beholder-api        │
│  • catalog JSON shards       │──────────▶│  • Google OAuth (cookieless)│
│  • CLIP embeddings (bin)     │   CORS    │  • /sync push/pull          │
│  • service worker + caches   │           │  • /export /account         │
│  • taste model (client-side) │           │ D1 (SQLite): users/sessions/│
└──────────────────────────────┘           │              events         │
        ▲                                  └─────────────────────────────┘
        │ images (hotlink v1, R2 mirror planned)
┌──────────────────────────────┐
│ Museum CDNs: AIC IIIF        │   Catalog + embeddings are produced by
│ (explicitly sanctioned),     │   GitHub Actions (pipeline.yml) and
│ Cleveland openaccess-cdn     │   committed to the repo → redeployed.
└──────────────────────────────┘
```

## Why this shape (alternatives considered)

- **Fully static/local-first** — rejected: multiuser accounts + cross-device
  sync were a launch requirement.
- **BaaS (Supabase / Firebase / Appwrite)** — rejected on free-tier behavior
  verified against official docs (July 2026): Supabase Free pauses projects
  after 1 idle week (manual restore); Appwrite Free pauses at 7 days and
  deletes at 90; Firebase Spark never pauses but has no free functions and a
  paid-only managed export. Cloudflare's free tier has **no pause behavior of
  any kind**, needs no credit card, and exits cleanly
  (`wrangler d1 export` → standard SQL; R2 → plain files).
- **Model on the server** — rejected: the taste model is a pure function of
  the event log, so it runs client-side. The backend stays a thin, cheap,
  privacy-friendly event store; model upgrades replay history.

## Key decisions

- **Event sourcing.** Every interaction is an immutable event (UUID id) in
  IndexedDB, synced append-only to D1 with server-side dedupe. The model,
  collections, memory schedule and profile are all folds over this log.
- **Cookie-free auth.** Safari blocks third-party cookies between
  `github.io` and `workers.dev`, so sign-in uses: worker-origin OAuth dance →
  one-time code in a URL fragment → CORS exchange for an opaque bearer token.
  Only SHA-256 hashes of tokens/codes are stored.
- **Same embedding space everywhere.** The pipeline and the Snap feature use
  the identical CLIP checkpoint (Xenova/clip-vit-base-patch32, quantized) so
  photo vectors and catalog vectors are directly comparable.
- **Images.** v1 hotlinks only the two sources whose delivery is designed for
  it (AIC IIIF — explicitly permitted in their docs; Cleveland's open-access
  CDN), validated live by the pipeline, cached by the service worker, with
  in-app fallback and skip-on-error. Self-hosted WebP derivatives on R2 are
  the planned end-state (see BACKLOG).

## Repository layout

```
app/       SvelteKit PWA. src/lib/engine = pure, tested model/selector code.
worker/    Cloudflare Worker + D1 migrations + FakeD1 test suite.
pipeline/  Catalog ingestion + embedding stages (runs in GitHub Actions).
data/      Taste ontology (versioned), curated overrides, prior examples.
docs/      This documentation set.
.github/   ci.yml, deploy-pages.yml, deploy-worker.yml, pipeline.yml
```

## Deploys

- **Pages**: every push to the main branch builds the app (BASE_PATH=/art)
  and publishes via `actions/deploy-pages`.
- **Worker**: pushes touching `worker/**` provision D1 idempotently, apply
  migrations, register the workers.dev subdomain if needed, deploy, and
  smoke-test `/health` (with DNS-propagation retries).
- **Pipeline**: manual dispatch — `build` (fetch → normalize → tag → dedupe →
  probe → publish → commit) and `embed` (CLIP vectors → commit).

## Cost & scale envelope (free tiers, July 2026)

Workers 100k req/day · D1 5M reads/day, 5 GB · R2 10 GB + free egress ·
Pages ~100 GB/month soft. A painting-app session is a handful of requests;
hundreds of daily users fit comfortably. Past that: Workers Paid ($5/mo)
is the first upgrade. Migration paths are documented in DEPLOY.md.
