# Backlog

Ordered by leverage.

1. **R2 image mirroring** — pipeline stage: polite originals download →
   WebP derivatives (320/1280, frame-crop detection) → R2 upload → catalog
   URLs rewritten with museum fallback; weekly `image-audit.yml`. Unlocks
   The Met and removes all hotlink risk. **Caveat learned 2026-07-27:** AIC's
   Cloudflare challenge blocks image GETs from datacenter IPs (Actions), so
   the AIC leg needs one of: an allowlist from engineering@artic.edu, a
   residential-IP fetch step, or the Commons mirror below.
1b. **AIC images via Wikimedia Commons** — ✅ implemented for embeddings
   (2026-07-27): `commons-map` stage joins works to Commons files via
   Wikidata P4610 + insource fallback (1,231/1,557 mapped), embed fetches
   from Commons with per-vector provenance. Remaining uses: feed the same
   map to the R2 mirror stage (above), and re-run `commons-map`
   periodically — Commons coverage grows over time, shrinking the 326
   unmapped works.
2. **CLIP zero-shot ontology tagging** — *shipped in tramo 8* (`tag-clip`
   stage: calibrated thresholds, precision proxies in the report artifact,
   zero-tag works 55% → 2.1%). Remaining upgrades: a human spot-check pass
   over generous dims (nocturne, family, nature) feeding per-dim floor
   raises; recalibrate percentile-fallback dims as meta coverage grows;
   composition dims (comp.*) still unprompted — they need visual probes
   CLIP text can't phrase reliably.
3. **Embedding features in the taste model** — PCA→64d block appended to
   φ(x): lets the model learn taste that escapes the ontology, while the
   interpretable dims keep explaining what can be explained.
4. **Catalog expansion** — *tramo 7 shipped rijks + met via the Wikidata
   collection join (P195 + Commons imageinfo).* Remaining upgrades: native
   Rijksmuseum Linked Art/IIIF adapter and native Met API adapter with
   their own image hosts (probed viable 2026-07-29; the Met API lacks
   pixel dims, so a native adapter needs a dimension probe step); then
   SMK/Yale.
5. **Museum mode** — pick a museum → affinity-ranked works + essentials + a
   prioritized route with time estimate (museum field already on every work).
6. **Spanish localization** — *shipped in tramo 9* (es.ts + reactive
   facade + EN/ES first-run choice). Remaining: translate catalog
   micro-stories in the pipeline; localize frozen session_end labels.
   Original note: strings are already centralized in
   `lib/i18n/en.ts`; add `es.ts` + a language toggle.
7. **Contextual taste** — hour-of-day is already recorded on every event;
   surface "evening eye vs. morning eye" once per-bucket evidence suffices.
8. **Recognition quiz variants** — multiple-choice artist/title cards with
   era-matched distractors, alongside the current self-graded reveal.
9. **Update-available toast** — switch the service worker from autoUpdate to
   prompt-based refresh with an in-app notice.
10. **Snap server assist** — optional Workers AI embedding endpoint (same
    checkpoint) to skip the client model download; R2 private photo backup
    for signed-in users.
11. **Social (deferred by decision)** — share a work/collection by link;
    compare profiles by mutual consent.
12. **Lighthouse CI budgets** in ci.yml (LCP < 2.5s on 4G, initial JS
    < 200 KB gz, CLS < 0.1) — measured once images are first-party (R2).
13. **Curated micro-stories** — *shipped for the onboarding set in tramo
    10* (all 294 curated works carry a story; 124 first editions in
    `data/curated/overrides.json`, factual-only). Remaining: extend to
    the most-shown works OUTSIDE the curated set, and owner-edit the
    first editions.
13. **Session-insight history in events** — ✅ *shipped in tramo 9*
    (session_end.insights + the profile's Past sessions view with
    strengthened/weakened/changed/holds/unresolved).
14. **Synced session objective** — carry "Test this pattern" across devices
    via an event instead of device-local kv (see RISKS #12).
15. **Exposure-corrected artist affinity** (review §17) — *partially
    shipped in tramo 9* (exposure labels; low exposure never reads as low
    affinity). Remaining: exposure-corrected RANKING.
16. **Profile shows catalog limits** (review §18) — exposure caveats next to
    conclusions ("not enough East Asian landscape seen for a reliable
    read"), sourced from data/coverage.json.
17. **My Eye as a portrait, not a dashboard** (review §19) — ✅ *shipped
    in tramo 9* (portrait lead: synthesis line, representative works,
    contradiction, per-hypothesis test buttons; dashboard below).
18. **Specialist formats in context** (review §11) — scrolls/albums/screens
    return via a dedicated discovery mode with viewing controls and
    like-with-like comparisons, not fast pairwise calibration.
19. **Calibrated wording tiers across sessions** (review §15) — an
    "established preference" tier requires repeated evidence across
    sessions/contexts/artists; session-level copy stays early/emerging.
20. **COVERAGE.md rendering** — a human-readable digest generated from
    data/coverage.json.
21. **Curiosity vs. attraction vs. memorability** (review 5, P1) — the
    event log already separates picks, saves, remembers and reactions;
    model and profile currently collapse them into one utility. Split
    the read: what pulls the eye, what the user wants to keep, what
    stays with them.
22. **Conditional preference modeling** (review 5, P1) — beyond
    hour-of-day (#7): "X but only when Y" interactions between dims
    (e.g. drama only in small formats), gated on per-condition evidence.
23. **Complete the human audit** — the owner runs
    `pipeline audit-kit`'s HTML over the 294 curated works and commits
    `data/curated/audit.json`; validation then enforces his rejections.
    Metadata oddities already spotted for it: works dated after the
    artist's recorded death and one artist/date contradiction (see
    DECISIONS tramo 10).
