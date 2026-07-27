# Changelog

All notable changes to Beholder are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.2.1] — 2026-07-27

### Added
- Snap catalog embeddings shipped: 3,339/3,665 works (91%). AIC works are
  embedded via their Wikimedia Commons replicas (exact Wikidata P4610
  join, `commons-map` pipeline stage) because AIC's CDN challenges
  datacenter IPs; per-vector provenance recorded in the embeddings meta.
- Incremental embed stage: reuses committed vectors, fetches only missing
  works, per-host circuit breaker, Retry-After-aware polite fetching;
  never regresses committed coverage.
- Google sign-in live (worker secrets applied; `/health` reports google).

## [0.2.0] — 2026-07-27

### Added
- Catalog v1: 3,665 public-domain paintings (AIC + Cleveland) via the
  reproducible pipeline; live image validation; micro-stories; ontology tags.
- Core session loop with reveal, reactions, strength, save/remember,
  "why this pairing"; local-first persistence and session resume.
- Bayesian taste model (Bradley–Terry + weak signals, evidence tiers,
  consistency temperature, conflict detection) with active pair selection
  (information gain, exploration, challenge, refutation, consistency).
- "Your eye" profile: natural-language reading, affinities/aversions with
  evidence badges, contradictions, artist records, evolution timeline.
- Accounts and multi-device sync: Cloudflare Worker + D1, cookie-free
  Google OAuth, idempotent append-only event sync, export, account deletion.
- Discovery: explainable close/challenge recommendations, era-stratified
  surprise, unmet artists, explore filters, search; work detail with notes,
  seen-in-person, fullscreen viewer.
- Snap: photograph a painting → client-side CLIP match against catalog
  embeddings → human-confirmed strong signal, or private field notebook.
- Memory: SM-2-lite spaced repetition with self-graded recognition.
- Starting-profile import (low-confidence provisional priors with
  refutation probes); session keyboard shortcuts; full documentation set.

## [0.1.0] — 2026-07-27

### Added
- M0 foundation: npm-workspaces monorepo (`app`, `worker`, `pipeline`).
- SvelteKit static PWA shell: manifest, icons (incl. maskable + apple-touch), service worker
  (precache + capped runtime caches), iOS safe-area and theme-color handling, night-gallery
  design tokens with light-scheme derivation and reduced-motion support.
- CI: typecheck, lint, unit tests, build, Playwright E2E on iPhone-WebKit and desktop-Chromium.
- Automated GitHub Pages deployment via `actions/deploy-pages`.
- Project documentation seed: README, decisions log, architecture notes.
