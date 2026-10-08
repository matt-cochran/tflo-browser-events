# Changelog

All notable changes to this package. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses
[Semantic Versioning](https://semver.org/).

## [0.3.0] — unreleased

### Breaking
- **Element text is no longer captured by default.** Click records carried the first 80
  characters of the clicked element's text, which could ship customer content (names, ticket
  titles) to a sink. They now carry only `tflowId` and `tag` (#10).
- **Migration:** to keep text for a click, set `captureText: true` on that entry in
  `track.clicks`. Only do this where the element's text is never customer content.

### Added
- `track.clicks[].captureText` opt-in. Even when it's on, text is never taken from inputs
  (including passwords), textareas, selects, editable regions, or anything inside
  `[data-tflo-mask]` or `[data-jz-mask]`; those parts are skipped and the rest kept.
- `data-tflo-mask` attribute marking a subtree whose text never leaves the page.
- `capturableText`, `MASK_SELECTOR` and `MAX_CAPTURED_TEXT` exports for hosts that apply the
  same rule in their own sinks.

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

[0.3.0]: https://github.com/matt-cochran/tflo-browser-events/compare/v0.2.0...dev
[0.2.0]: https://github.com/matt-cochran/tflo-browser-events/releases/tag/v0.2.0
[0.1.0]: https://www.npmjs.com/package/tflo-browser-events/v/0.1.0
