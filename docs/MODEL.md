# The taste model

## Idea

A work `x` has features `φ(x)`: its ontology tags (value − 0.5, scaled by tag
confidence) plus era one-hots. The user's taste is a weight vector `w` with a
**diagonal Gaussian posterior** — a mean and a variance per dimension —
updated online (assumed-density filtering with a Laplace-style precision
step) from every event:

| Signal | Likelihood / treatment | Weight |
|---|---|---|
| Pair choice A vs B | Bradley–Terry: `σ(w·(φA−φB))` | 1.0 (×0.6/1.0/1.5 by stated strength) |
| Both / Neither | weak absolute obs. on each work — **masked entirely** when the pair's last feedback flags image-quality/hard-to-judge (content problems are not taste, in either direction) | 0.3 |
| Save / Remember | weak positive absolute obs. | 0.55 / 0.4 |
| Skip ('pass' only) | very weak negative | 0.12 |
| Reaction (emotions) | weak positive (negative if only "Unmoved") | 0.3 |
| Rating (Snap uses 5) | absolute obs. | 0.8 |
| Pair feedback | evidence for insights only — **never weighted**; content flags retroactively mask their pair (above) | — |
| Decision time | recorded, not currently weighted (documented weak signal, can be disabled) | — |

Implementation: `app/src/lib/engine/model.ts`.

**Retroactive events and the live path** (tramo 7): `strength` and
`pair_feedback` change how an already-folded pair counts, and the
incremental update cannot look ahead — so recording one triggers an
in-place rebuild from the log (the undo pattern; milliseconds at
personal-log scale). The same-session selector therefore sees the
intensity the user just gave. The model is never persisted: every startup
replays the log, so semantic changes to the fold self-heal without
version machinery.

## Honesty layer

- **Evidence tiers**, never percentages: per-dim `z = |μ|/σ` with a minimum
  observation count → strong (≥2.2) / moderate (≥1.4) / weak (≥0.7) /
  insufficient. The profile UI shows the tier next to every claim.
- **Consistency probes**: the selector occasionally re-shows an old pair with
  sides swapped. Disagreement raises a per-user *temperature* that softens
  all predictions — inconsistency informs, it never penalizes.
- **Contradictions**: an EMA of gradient signs per dimension; a dim with real
  exposure whose evidence keeps flipping is surfaced as "pulls in both
  directions — possibly context-dependent" instead of being averaged away.
- **Imported priors** (owner's earlier manual comparisons) enter as shifted
  means with wide variance, flagged `provisional`; the flag only clears after
  enough real observations, and the selector actively schedules
  **refutation probes** targeting them.

## Active selection (daily mode)

After a ~40-answer stratified calibration, each turn draws a slot:

- **Information** (default): among ~48 constraint-respecting candidate pairs,
  maximize `p(1−p) · Σ_d σ²_d Δφ_d²` — uncertain comparisons along uncertain
  dimensions.
- **Exploration** (~15%): stratified random — keeps the map open.
- **Challenge** (~10%): low predicted appeal + high uncertainty — the
  anti-bubble slot; aversions get tested, not assumed.
- **Refutation** (up to 20% while provisional dims exist): pairs that differ
  mainly along one imported hypothesis (max `|Δφ_target| / (1+Σ|Δφ_other|)`).
- **Consistency** (every ~15th): swapped repeat of an old pair.

Constraints throughout: no pair repeats, artist/work cooldowns (scaled to
pool size), aspect-ratio compatibility, stratum coverage pressure.
Implementation: `engine/selector.ts`, `engine/active.ts`.

## Validation

`engine/model.test.ts` runs synthetic users through the real selector:

- plants preferences → model recovers sign and reaches strong/moderate tiers;
- ranks unseen works consistently with the planted taste;
- a coin-flipping user produces **no** strong claims;
- a planted era-dependent reversal is flagged conflicted / kept non-strong;
- inconsistent probe answers raise temperature; saves alone can't reach
  "strong".

## Recommendations (discover layer)

`engine/discover.ts`: close-to-your-eye ranks unseen works by `μ − 0.25σ`
(confidence-aware), diversified per artist, each with its top positive
contributions (`μ_d·φ_d`) as the "why" and up to three liked works sharing
those dimensions; challenges rank by `σ − μ` and show the *negative* side
honestly; surprises are era-stratified random. Artist suggestions average
predicted utility over an unmet artist's body of work.

## Extending

The ontology (`data/ontology.json`) is versioned; adding dimensions is
backward-compatible (missing tags contribute 0). Because the model replays
the event log, swapping the learner (e.g., low-rank covariance, embedding
features, contextual mixtures) upgrades every user retroactively. Catalog
CLIP embeddings (already computed for Snap) are the natural next feature
block — see BACKLOG.
