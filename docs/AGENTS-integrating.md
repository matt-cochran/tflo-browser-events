# Integrating tflo-browser-events: notes for agents in host apps

For agents adding `tflo-browser-events` to an app. Contributors to this package read the
repo's `AGENTS.md` instead.

## Install
`npm install tflo-browser-events`. ESM only; the WebAssembly engine ships in the package. If the
app sends a Content Security Policy, add `'wasm-unsafe-eval'` to `script-src`.

## Write a TrackingPlan
Describe tracking as one `TrackingPlan` object (page, track, presets, rules, sinks) instead of
wiring listeners by hand. [LLM_PROMPT.md](LLM_PROMPT.md), shipped next to this file, is the
step-by-step guide for generating one: page type, sections, clicks, presets, CEL rules, sinks.

## Stable selectors
- Mark clickable elements with `data-tflow-id="<stable-id>"`. Only clicks on configured ids
  are recorded.
- Mark sections with `data-track-section` (or `data-section-id`, or a `section` with an `id`).
- Never key tracking on generated class names, text or position.

## Privacy
- Capture listens only to: `click` (on configured `data-tflow-id` elements), `pointermove`
  (only when pointer sampling is on), `scroll`, `error`, `unhandledrejection`, `load`,
  `pagehide`, `popstate`, `hashchange`, `visibilitychange`, and IntersectionObserver for
  sections. It never listens to `input`, `keydown` or `change`, and never reads form values.
- **A click record includes the clicked element's text (first 80 characters).** Don't put a
  `data-tflow-id` on an element whose text is customer content, or drop that field in your
  sink (EdgeSink `transform`).
- Ship derived signals, not raw events, to third parties. Raw records stay in the page.

## One runtime per page
Create one `TFloBrowser` / `tflo(plan)` per page. When a library also uses tflo, inject your
module instead of letting it load a second copy. For example, Journeeze's SDK takes it as
`signals.tflo`. Two copies mean two WASM instances and double counting.

## Sending to your own collector (EdgeSink)
- Build `new EdgeSink({...})` yourself for anything beyond `endpoint`, `batchSize`,
  `batchIntervalMs` and `headers`. The tracking plan passes only those four.
- Use `contentType: "text/plain"` for a cross-origin collector: no CORS preflight, but no
  custom headers either.
- For a Journeeze collector use `profile: "journeeze"`. Pass the SDK's `pageEndBudget` so every
  sender on the page shares one page-end beacon budget.
- Watch `stats()` and `onDrop` for drops. The queue is memory-only and drops the oldest first.

## Page end and negative patterns
`TFloBrowser.flush()` drains pending negative matches (`notThen(...).within(...)`): every
armed pattern such as an abandoned step fires at once. **Never call `flush()` on `pagehide` or
`visibilitychange`.** To end a page without firing them, remove the patterns
(`removePattern`) and `destroy()` the instance. Hiding the page already flushes the sinks on
its own and fires no patterns.
