# Backlog

Ordered by leverage.

1. **R2 image mirroring** — pipeline stage: polite originals download →
   WebP derivatives (320/1280, frame-crop detection) → R2 upload → catalog
   URLs rewritten with museum fallback; weekly `image-audit.yml`. Unlocks
   The Met and removes all hotlink risk.
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
