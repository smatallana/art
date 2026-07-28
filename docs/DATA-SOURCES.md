# Data sources, licensing & attribution

Beholder is a personal, non-commercial project. The catalog's rights
stance (owner's decision, 2026-07-28 — see DECISIONS): most works are
**public domain with CC0/open metadata**; a small set of in-copyright
landmark paintings is included because the product's purpose — mapping a
person's taste across painting — requires them. Those works are **linked,
never copied**: the catalog stores URLs to Wikipedia's fair-use-sized
file pages, nothing is redistributed from this repo or any mirror, and
the app always displays an explicit © attribution.

## Active sources (v1)

### Wikidata / Wikimedia Commons (canon source, `wd`)
- The curatorial spine (`data/canon/canon.json`, ~175 artists across all
  periods and many traditions) resolved via the Wikidata SPARQL endpoint:
  exact English label + painter occupation, most-sitelinked item on ties;
  paintings (P31 Q3305213) with images (P18), ranked by each work's own
  sitelink count so canonical anchors surface first.
- Images: Wikimedia Commons pre-rendered thumbs (400/1024px) via the
  imageinfo API; PD works labeled *"Public domain — image via Wikimedia
  Commons"*.
- `data/canon/manual-works.json`: in-copyright landmarks resolved on
  English Wikipedia's file pages (fair-use size), rights labeled
  `in-copyright`, © attribution always shown, excluded from any mirror.
- Etiquette: batched SPARQL, ≤1 req/s to Wikimedia APIs, descriptive
  User-Agent, thumbnail renders fetched serially honoring Retry-After.

### Art Institute of Chicago
- API: `https://api.artic.edu/api/v1/artworks/search` (no key). Anonymous
  limit 60 req/min; the pipeline pages politely and partitions queries by
  `date_start` ranges (the search window exposes only the first 1,000 hits).
- License: **CC0** metadata; works flagged `is_public_domain` have CC0
  images. Their docs explicitly permit pulling from the IIIF Image API at
  ~1 request/second — the only source we hotlink by their own invitation.
- Images: IIIF — thumb `/full/400,/`, display `/full/843,/`, large
  `/full/1686,/`.
- Attribution shown in-app: *"Art Institute of Chicago — CC0 Public Domain
  Designation"*.

### The Cleveland Museum of Art
- API: `https://openaccess-api.clevelandart.org/api/artworks/` (no key,
  no published rate limit; we stay polite). Filter
  `type=Painting&cc0=1&has_image=1`.
- License: **CC0** dataset and CC0 images for open-access works.
  `did_you_know` / `fun_fact` fields feed the micro-stories.
- Images: direct CDN URLs (`web` ~900px, `print` large master).
- Attribution shown in-app: *"The Cleveland Museum of Art — CC0"*.

## Evaluated and deferred / rejected

- **The Met** (CC0, ~5k PD paintings): deferred — no IIIF, anti-bot image
  host; requires the R2 mirroring stage before inclusion. Backlog.
- **Rijksmuseum** (CC0, full IIIF, keyless Search/OAI-PMH): deferred to the
  next catalog expansion. (Their old keyed API is deprecated.)
- **NGA Washington / Wikidata**: enrichment + cross-source dedupe layer
  (Q-ids). Backlog.
- **SMK Denmark / Yale LUX**: good CC0 candidates; backlog.
- **Harvard Art Museums**: **rejected** — images restricted to
  non-commercial use, mandatory hotlinking, 2-week cache cap, 2.5k calls/day.
- **WikiArt**: **rejected** — aggregated images without open licensing.

## Pipeline guarantees

Every published record carries: canonical id, source id, rights status and
an attribution string (always rendered in the UI), the official museum page
URL, image dimensions/aspect, per-dimension tags with `{value, confidence,
source: meta|clip|curated}`, and quality flags. Cross-museum artist+title
collisions are **flagged** (`possible-duplicate`), never silently dropped —
versions and copies of a composition are art-historically legitimate.

Live image validation runs at build time: full sweep on fast hosts,
serial ~1 rps sampled sweep on AIC (their etiquette; their IIIF URL scheme
is uniform). Works whose display image fails are excluded from publication.

## Adding a source

Implement `SourceAdapter` (`pipeline/src/types.ts`): `fetchSample`,
`fetchRaw` (polite paging), `normalize` (→ canonical `Work` with rights +
attribution) and a tag-fields extractor; register it in `run.ts`; verify
with `pipeline.yml` sample mode (it normalizes live records into the job
log); then run a `build`. Document license terms here first.
