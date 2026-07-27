# Beholder

*Learn your own eye.*

Beholder is a personal art-taste discovery app: short, beautiful sessions where you choose
between paintings (artist and title hidden to reduce bias), a Bayesian preference model builds
an explainable profile of your aesthetic sensibility — with honest evidence levels, never fake
percentages — and a discovery layer surfaces artists and works you'll probably love, plus some
that will challenge you. A lightweight memory system helps you actually remember what you've
seen.

**Live app:** https://smatallana.github.io/art/

## Status

| Milestone | Scope | Status |
|---|---|---|
| M0 | Foundation: monorepo, CI, installable PWA shell on GitHub Pages | ✅ |
| M1 | Catalog v1: reproducible pipeline (AIC, Cleveland, Met, Rijksmuseum), ~2–3k public-domain paintings | 🔜 |
| M2 | Core session loop, local-first persistence, offline queue | ⏳ |
| M3 | Adaptive engine (Bayesian Bradley–Terry + active learning) and taste profile | ⏳ |
| M4 | Accounts (Google sign-in), multi-device sync (Cloudflare Workers + D1) | ⏳ |
| M5 | Discovery layer + Snap (photograph a painting in the wild) | ⏳ |
| M6 | Memory: spaced repetition and recognition | ⏳ |
| M7 | Polish, accessibility, performance budgets, full docs | ⏳ |

## Repository layout

```
app/       SvelteKit PWA (static build → GitHub Pages)
worker/    Cloudflare Worker: auth, event sync, backups (M4)
pipeline/  Catalog ingestion: fetch → normalize → dedupe → tag → validate → publish (M1)
data/      Versioned ontology, curatorial corrections, prior seeds
docs/      Architecture, model, ontology, data sources, deploy, privacy, decisions
```

## Local development

```bash
npm ci            # install all workspaces
npm run dev       # app dev server (http://localhost:5173)
npm run check     # svelte-check (typecheck)
npm test          # unit tests (vitest)
npm run e2e       # Playwright E2E (build + preview server)
npm run build     # production build (BASE_PATH=/art for Pages)
```

Node ≥ 20 required. No environment variables are needed for local frontend development;
see `.env.example` for the deployment credentials used by CI (never committed).

## Architecture (summary)

- **Frontend + catalog:** static PWA on GitHub Pages; sharded catalog JSON built by the pipeline.
- **Images:** self-hosted WebP derivatives on Cloudflare R2 (free tier, free egress), generated
  from public-domain source images; per-work fallback to the museum's official image service.
- **User data:** Cloudflare Workers + D1. Append-only event log; the preference model is computed
  client-side and is always recomputable from events. Guest mode is fully local.
- **Deploys:** GitHub Actions → Pages (app + catalog) and Wrangler (worker). All credentials live
  in GitHub Secrets; nothing sensitive in the repo.

Full details: `docs/ARCHITECTURE.md` (with the official-source research the decisions rest on).

## Privacy

Your taste profile belongs to you. No analytics, no tracking. Export and deletion are built in.
User data never enters this public repository. See `docs/PRIVACY.md`.

## License

Code: MIT. Catalog: public-domain works with CC0 metadata from source museums — see
`docs/DATA-SOURCES.md` for licensing and attribution per source.
