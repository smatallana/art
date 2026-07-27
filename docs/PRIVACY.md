# Privacy

Your taste profile belongs to you.

- **No analytics, no tracking, no third-party scripts.** The app loads its
  own code, its own catalog, and (only when you use Snap) an open vision
  model. Nothing else.
- **Guest by default.** Everything lives in your browser's IndexedDB until
  you sign in. You can use Beholder forever without an account.
- **Sign-in is minimal.** Google OAuth yields your name/email/subject id —
  nothing more. Session tokens are random values; only their SHA-256 hashes
  are stored server-side.
- **What syncs**: your event log (choices, reactions, saves, notes, memory
  reviews, imported priors). What never leaves your device: Snap photos
  (IndexedDB only, EXIF-free by re-encoding, no geolocation is ever read)
  and your local caches.
- **Signals are visible and optional.** The profile page lists exactly what
  the model uses. Decision-time is recorded as a documented weak signal and
  is not currently weighted; delete/export applies to it like everything.
- **Export**: Settings → "Export my data (JSON)" (full local log), or
  `GET /export` with your token for the server copy.
- **Delete**: Settings → "Delete account & data" removes the server account
  and every synced event (SQL cascade); "Erase local data" wipes the device.
  The two are independent and both are immediate.
- **Public repo, private data.** The repository contains code and the
  public-domain catalog only. User data lives exclusively in D1 (private)
  and on devices. The owner's starting-profile hypotheses are *not* in the
  repo — priors are imported client-side from a local file.
