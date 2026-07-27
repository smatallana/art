# Taste ontology

Source of truth: `data/ontology.json` (version 1, domain `painting`),
bundled into the app at build time and consumed by the pipeline tagger.

## Design

- **Six groups**: form & handling · color & light · composition & space ·
  subject & setting · atmosphere & emotion · narrative. Historical context
  (era, movement, museum) rides on the work record as categorical metadata —
  deliberately *not* a scored taste dimension, so the model can conclude
  things like "your thread is implied narrative across very different
  movements" instead of defaulting to period labels.
- **Three kinds**: `scale` (0–1 between named poles, e.g. *polished,
  invisible ↔ visible, gestural*), `binary` (presence), `intensity` (0–1).
  75 dimensions at v1 — the full list with poles lives in the JSON.
- **Every tag on a work** is `{v, c, src}` — value, confidence, and source:
  - `meta` — mapped from museum taxonomies (high trust) or keyword scans
    (low trust); style names add weak formal hints.
  - `clip` — zero-shot visual tagging (BACKLOG #2; the embedding
    infrastructure already exists).
  - `curated` — human corrections in `data/curated/overrides.json`; always
    win over automatic sources.
- **Versioned & extensible**: adding dimensions is backward-compatible
  (absent tags contribute 0 to the model); other art domains would add a
  sibling `domain` file without touching painting data. The model replays
  the event log, so ontology upgrades apply retroactively.

## How the app uses it

- φ(x) features for the taste model (`engine/model.ts`).
- Direction-aware human labels in the profile ("Restrained" vs "Exuberant"
  from the same dim, by weight sign — `engine/profile.ts`).
- Explore filters and recommendation explanations (`engine/discover.ts`).
- Calibration strata (era × subject family — `engine/strata.ts`).
