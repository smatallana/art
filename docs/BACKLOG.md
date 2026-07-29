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
2. **CLIP zero-shot ontology tagging** — prompt ensembles per dimension over
   the existing embeddings; confidence-thresholded `src:'clip'` tags for
   moods/light/composition (metadata can't see these). Curatorial overrides
   already win by design.
3. **Embedding features in the taste model** — PCA→64d block appended to
   φ(x): lets the model learn taste that escapes the ontology, while the
   interpretable dims keep explaining what can be explained.
4. **Catalog expansion** — Rijksmuseum (IIIF, keyless) and The Met (via R2);
   Wikidata Q-id cross-source dedupe; target ~6–8k works, then SMK/Yale.
5. **Museum mode** — pick a museum → affinity-ranked works + essentials + a
   prioritized route with time estimate (museum field already on every work).
6. **Spanish localization** — strings are already centralized in
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
13. **Curated micro-stories** — grow `data/curated/overrides.json` for the
    most-shown works lacking `did_you_know`-grade stories.
13. **Session-insight history in events** — persist each session's
    SessionInsight (or a digest) on `session_end` so insights become
    reviewable over time and sync across devices.
14. **Synced session objective** — carry "Test this pattern" across devices
    via an event instead of device-local kv (see RISKS #12).
15. **Exposure-corrected artist affinity** (review §17) — rank artist
    affinities by evidence AND exposure: high-affinity-well-tested vs
    high-potential-lightly-tested vs insufficient-exposure.
16. **Profile shows catalog limits** (review §18) — exposure caveats next to
    conclusions ("not enough East Asian landscape seen for a reliable
    read"), sourced from data/coverage.json.
17. **My Eye as a portrait, not a dashboard** (review §19) — eye signature
    sentence, representative works, per-hypothesis test buttons.
18. **Specialist formats in context** (review §11) — scrolls/albums/screens
    return via a dedicated discovery mode with viewing controls and
    like-with-like comparisons, not fast pairwise calibration.
19. **Calibrated wording tiers across sessions** (review §15) — an
    "established preference" tier requires repeated evidence across
    sessions/contexts/artists; session-level copy stays early/emerging.
20. **COVERAGE.md rendering** — a human-readable digest generated from
    data/coverage.json.
