# Acceptance criteria — status

The 22 criteria from the product brief (§16), verified honestly.
Legend: ✅ done & verified · 🟡 done with a noted caveat · 🔜 pending.
Re-audited 2026-07-28 after the external review (see DECISIONS): cold-start
loading, image-failure semantics and catalog composition were materially
reworked; production is now smoke-tested after every deploy.

| # | Criterion | Status | Evidence / caveat |
|---|---|---|---|
| 1 | Opens from a stable URL | ✅ | https://smatallana.github.io/art/ (Pages deploy green) |
| 2 | Add to home screen on mobile | ✅ | Manifest + icons + standalone display; iOS share-sheet flow |
| 3 | Works on mobile and desktop | ✅ | E2E on iPhone-WebKit + desktop-Chromium in CI |
| 4 | Interact without typing | ✅ | Whole session loop is taps; typing only for search/notes (allowed) |
| 5 | Images load reliably | 🟡 | Build-time validation + SW cache + per-work fallback; an image failure is an infrastructure event that never touches the taste model; production smoke test decodes real images after every deploy. Still hotlinked until R2 mirroring (BACKLOG #1) |
| 6 | Responses saved automatically | ✅ | Every event written to IndexedDB before UI advances |
| 7 | Close and return without losing progress | ✅ | Session snapshot + resume; E2E-covered |
| 8 | Next selection adapts to answers | ✅ | Calibration → info-gain active learning (synthetic-user tests) |
| 9 | Not always the same comparisons | ✅ | Pair-novelty + cooldowns + exploration slots; E2E non-repetition test |
| 10 | Large, extensible catalog | ✅ | Reproducible pipeline; curated canon source (Wikidata/Commons, ~175 artists all periods) beyond the two founding museums; per-build coverage & concentration report with thresholds |
| 11 | Save works | ✅ | Save/unsave + Saved page |
| 12 | Discover artists | ✅ | Unmet-artist suggestions + artist records in profile |
| 13 | Understand why a work is recommended | ✅ | Per-rec contributions + related liked works; work page "why" |
| 14 | Consult a taste profile | ✅ | "Your eye": NL reading, affinities/aversions, artists, timeline |
| 15 | Profile distinguishes strong/weak/uncertain evidence | ✅ | Evidence tiers from posterior z; conflicts & provisional flags |
| 16 | Export my data | ✅ | Local JSON export + server /export |
| 17 | Code in my GitHub | ✅ | smatallana/art, full history |
| 18 | Reproducible deploy | ✅ | Pages/Worker/pipeline all from Actions; DEPLOY.md |
| 19 | Promised features actually implemented | ✅ | This table + RISKS.md name every caveat explicitly |
| 20 | No decorative dead buttons | ✅ | Every control records/navigates; verified per route |
| 21 | No fake data / invented percentages | ✅ | Tiers + relative bars only; catalog is real museum data |
| 22 | No hidden dependencies on local files/chat | ✅ | App+pipeline self-contained. Google OAuth secrets applied (sign-in live, `/health` reports `auth:google`); owner declined the optional prior import — the feature remains available with a documented schema |

Session-loop items also verified by 44 unit tests (model convergence,
selector fairness, memory scheduling, discovery, pipeline normalization)
and 7×2 Playwright E2E specs in CI.
