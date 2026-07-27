# Changelog

All notable changes to Beholder are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-07-27

### Added
- M0 foundation: npm-workspaces monorepo (`app`, `worker`, `pipeline`).
- SvelteKit static PWA shell: manifest, icons (incl. maskable + apple-touch), service worker
  (precache + capped runtime caches), iOS safe-area and theme-color handling, night-gallery
  design tokens with light-scheme derivation and reduced-motion support.
- CI: typecheck, lint, unit tests, build, Playwright E2E on iPhone-WebKit and desktop-Chromium.
- Automated GitHub Pages deployment via `actions/deploy-pages`.
- Project documentation seed: README, decisions log, architecture notes.
