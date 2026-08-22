# Changelog

All notable changes to Beholder are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.4.0] — 2026-08-02

The owner's own field test (installed PWA, iPhone) — six findings, all
addressed:

### Fixed
- **Repetition**: shown-but-unanswered pairs now leave a durable
  pair_shown event, so abandoned/skipped/errored pairs can never return
  (measured before the fix: 100% painting and 64–88% exact-pair
  repetition between early sessions). Resume desync fixed; artist
  cooldown survives sessions; opening cooldown floor restored; undo no
  longer shortens sittings; the editorial opening regenerated with
  global caps (37 distinct works, was 17); the consistency probe is
  labeled on screen and draws from mid-history.
- **Images**: SW cache-poison recovery (evict + fresh refetch on error);
  detail-page failure UI with retry and promoted museum link; 7
  wrong-image works dropped (Miró "Dona", Picasso "Mountains of
  Málaga", a mislabeled Michelangelo fresco, 4 exhibition shots); 566
  URL-artist names fixed; wd rights relabeled conservatively (69 flip
  to linked-image ©); miscalibrated clip "nocturne" stripped from 4,081
  works and its prompt retired; Explore filters require museum-grade
  tag sources.

### Added
- Back navigation (origin-aware BackBar) on work/settings/remember/snap.
- Progress toward value in real numbers: welcome journey line, "N of 40"
  + next-unlock countdowns on summaries and the profile, exact counts in
  every gate copy.
- The seen-works gallery in Saved (chosen marks, "N of 10,760", era
  coverage) and the summary's collector line "Your gallery grew to N".
- Per-work problem reporting on the detail page, collected locally in
  Settings with JSON export.
- Pipeline: `repair` (in-place catalog fixes, safety-gated),
  `photo-probe` (embeddings-based photo-vs-painting suspect ranking for
  the human audit), overrides.json `drop` switch, conservative wdRights
  rule, genid artist mapping, P18 filename triage, flag dedup.

## [0.3.0] — 2026-08-01

Five external review rounds (tramos 5–10), condensed:

### Added
- Catalog grown to 10,767 works across five sources (cma, met, rijks, wd,
  aic) with committed coverage governance (`data/coverage.json`) and CLIP
  zero-shot ontology tagging over the existing embeddings (98% of works
  now carry tags; was 45%).
- Curated onboarding collection (294 works, staged anchor/discovery/
  contrast roles) with a scripted six-pair opening — now committed
  editorial content (`data/curated/opening.json`, hand-editable, CI-
  validated against the real slot filters).
- Every curated work carries a factual micro-story (124 first editions
  written from committed record facts only).
- Human audit kit: `pipeline audit-kit` renders a self-contained review
  gallery exporting `data/curated/audit.json`; validation enforces
  rejections once the owner commits the audit (no gate before — owner
  decision).
- Welcome screen with purpose line, EN/ES first-run language choice and
  full Spanish translation under a typed parity contract.
- Sessions: 6-pair first sitting, 8 after, voluntary 12; early finish
  with ≥3 answers earns the summary; progressive personalization during
  calibration; session-end insights frozen into events; profile portrait
  with Past sessions status tracking; session-close recommendations with
  evidence-gated headings.
- Snap field notebook; blind-phase alt text composed from tags; 44px
  touch targets; per-deploy production smoke tests.

### Fixed
- Model integrity: image failures and reported problems never count as
  taste; strength applies immediately; content-flagged pairs are masked
  symmetrically; skip semantics are deliberate.
- Truthful summaries: era patterns count, no-pattern endings state
  concrete session facts, evidence thumbnails ranked by contribution.

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
