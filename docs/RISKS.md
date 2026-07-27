# Risks & limitations (current, honest)

1. **Hotlinked images (v1).** AIC (sanctioned) and Cleveland (open CDN) are
   the two most hotlink-tolerant sources, validated at build time and cached
   by the service worker with graceful skip-on-error — but they remain
   third-party infrastructure. Mitigation in progress: R2 mirroring stage
   (BACKLOG #1) makes images first-party.
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
