# Changelog

All notable changes to this package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] — 2026-10-08

### Changed
- **`EdgeSink` transport hardening** (Journeeze direct-mode contract C0b):
  - `contentType: "text/plain"` sends CORS-simple requests with no preflight;
    custom headers are refused in that mode.
  - Failed sends are retried instead of lost: exponential backoff (1 s base, 60 s
    cap, ±50% jitter), at least `Retry-After`, at most 5 retries (3 for network
    failures), paused while offline.
  - A bounded in-memory queue (`maxQueueEvents`, `maxQueueBytes`) drops the oldest
    events first and reports drops through `onDrop` and `stats()`.
  - Every event carries an `event_id` (UUIDv7) and `seq` that stay the same across
    retries.
  - Page end sends one beacon and **never falls back to a keepalive `fetch`** when
    the beacon is refused; the queue is sent when the page is shown again.
- Published as the unscoped `tflo-browser-events` (the planned `@tflo` scope was
  not available), built from source by the tag workflow.

### Added
- `profile: "journeeze"` (text/plain only, 50 events, 5 s, 16 KiB page-end beacon),
  a shared `pageEndBudget`, and `encode` / `transform` hooks for collectors that
  wrap batches in their own request message.

### Removed
- The deprecated alias package planned for the scoped name.

## [0.1.0] — 2026-07-12

### Added
- First release: tracking plans, capture helpers (sections, clicks, pointer,
  errors, scroll depth, visibility, lifecycle), presets, CEL derivation rules,
  the WASM `tflo-cep` pattern engine, and GA4, Edge and Console sinks.
- Identity stamping and a stable SPA session id.

[0.2.0]: https://github.com/matt-cochran/tflo-browser-events/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/tflo-browser-events/v/0.1.0
