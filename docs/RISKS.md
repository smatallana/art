# Risks & limitations (current, honest)

0. **In-copyright landmarks are linked, not licensed.** By owner decision
   (personal/family use — DECISIONS 2026-07-28) a small set of copyrighted
   landmark paintings is included via links to Wikipedia's fair-use-sized
   images: nothing is redistributed, © attribution always shows, and they
   are excluded from any mirror. Residual risk: link rot (weekly audit
   will cover them) and the usual fair-use ambiguity of linking; removing
   any single work is a one-line catalog change.
1. **Hotlinked images (v1).** AIC (sanctioned) and Cleveland (open CDN) are
   the two most hotlink-tolerant sources, validated at build time and cached
   by the service worker with graceful skip-on-error — but they remain
   third-party infrastructure. Mitigation in progress: R2 mirroring stage
   (BACKLOG #1) makes images first-party. Known specifics: AIC's Cloudflare
   challenges non-browser clients on image GETs (browsers/hotlinking are
   fine; server-side fetching from datacenter IPs is not — see DECISIONS
   2026-07-27), and our build-time validation uses HEAD requests, which that
   challenge exempts — so validation attests existence, not scriptability.
   Consequence today: Snap embeddings cover **3,339/3,665 works (91%)** —
   Cleveland directly plus 1,231 AIC works fetched via their Wikimedia
   Commons replicas (exact Wikidata P4610 join). The remaining 326 AIC
   works have no locatable Commons replica and pend a non-datacenter fetch
   (DEPLOY.md) or AIC unblocking scripted GETs.
2. **Metadata-only tags for ~half the catalog.** Cleveland exposes no
   subject taxonomy, so many of its works carry few ontology tags until the
   CLIP zero-shot tagging stage lands (BACKLOG #2). The model degrades
   gracefully (missing tags contribute nothing).
3. **Snap accuracy.** Museum photos (glare, angle, frames) vs. 843px
   reproductions; matching is genuinely probabilistic. The UI never asserts
   a match — confirmation is always human — and unmatched photos are
   archived locally for future retry.
4. **Free tiers can change.** Verified July 2026; exit paths documented in
   DEPLOY.md (standard SQL export, plain-file images, portable static app).
5. **iOS platform limits.** No background sync (sync runs on open/focus),
   no programmatic haptics, storage durability best-effort until installed
   to the home screen (then exempt from Safari's 7-day eviction).
6. **Sync conflicts.** The event log is append-only and idempotent, so
   there are no merge conflicts by construction — but ordering across
   devices is by server sequence, and derived state (e.g., save→unsave
   races across devices) resolves by log order, not wall-clock.
7. **Scheduled Actions auto-disable** after 60 days of repo inactivity
   (GitHub policy for public repos).
8. **Single-owner operations.** Cloudflare + Google credentials are held by
   the repo owner; losing them requires re-provisioning (documented).
9. **Model scope.** The linear model over interpretable dims cannot express
   taste that lives only in visual texture; the embedding feature block
   (BACKLOG #3) addresses this while keeping explanations interpretable.
