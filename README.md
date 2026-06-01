# @tflo/browser-events

Capture browser interactions, derive typed domain signals from declarative
CEL patterns, and route them to **any** sink — Google Analytics 4, your own
edge collector, ClickHouse via relay, the console, or whatever you write.

> **declarative browser interaction tracking with CEP-derived domain signals**

The pattern matching engine is
[`tflo-cep`](https://github.com/matt-cochran/tflo/tree/main/tflo-cep),
a closure-based event-pattern engine in Rust compiled to ~40 KB
of WebAssembly.

---

- [Quickstart — tracking plan](#quickstart--tracking-plan)
- [Three-layer model](#three-layer-model)
- [Sections (IntersectionObserver)](#sections-intersectionobserver)
- [Clicks (durable IDs)](#clicks-durable-ids)
- [Pointer sampling](#pointer-sampling)
- [Error tracking](#error-tracking)
- [Scroll depth](#scroll-depth)
- [Element visibility](#element-visibility)
- [Page lifecycle](#page-lifecycle)
- [Presets](#presets)
- [Derivation rules (CEL)](#derivation-rules-cel)
- [Sinks — GA4, Edge, Console](#sinks--ga4-edge-console)
- [Codegen / auto-discovery](#codegen--auto-discovery)
- [Build from source](#build-from-source)

---

## Quickstart — tracking plan

```ts
import { tflo, type TrackingPlan } from "@tflo/browser-events";

const plan: TrackingPlan = {
  page: {
    id: "product-detail",
    attrs: { productId: "sku-123", category: "electronics" },
  },

  track: {
    sections: [
      { id: "hero", selector: "#hero" },
      { id: "features", selector: "#features" },
      { id: "pricing", selector: "#pricing" },
    ],
    clicks: [
      { id: "buy_now" },
      { id: "pricing_cta" },
    ],
    pointer: {
      moves: "sampled",
      sampleMs: 250,
    },
  },

  rules: [
    {
      id: "section_read",
      when: `
        event.kind == "section.dwelled" &&
        event.durationMs >= 3000
      `,
      emit: {
        name: "section_read",
        params: {
          section_id: "event.target.id",
          duration_ms: "event.durationMs",
        },
        sinks: ["ga4", "edge"],
      },
    },
    {
      id: "hero_seen",
      when: `event.kind == "section.entered" && event.target.id == "hero"`,
      emit: { name: "hero_seen" },
    },
  ],

  sinks: {
    ga4: { measurementId: "G-XXXXXXXX" },
    edge: { endpoint: "/collect/signals" },
    console: true,
  },
};

const { ready } = await tflo(plan);
await ready;
```

Your markup needs a `data-tflow-id` attribute on clickable elements for
the durable click contract:

```html
<button data-tflow-id="buy_now">Buy now</button>
<a data-tflow-id="pricing_cta" href="/pricing">See pricing</a>
```

Sections are matched by CSS selector (stable — use `id` attributes).

## Three-layer model

```text
Plan Layer     what DOM things to observe (sections, clicks, pointer)
              + what rules to apply
              tflo(plan) auto-wires everything

Raw Events     section.entered       section leaves viewport
               section.dwelled       dwell duration computed on exit
               section.left          element exits viewport
               click                 element.clicked with [data-tflow-id]
               pointer.sampled       sampled pointermove, 250ms default

Derived        your CEL rules transform raw events into domain signals
Signals        hero_seen, pricing_read, buy_now_clicked, etc.
```

The tracking plan automatically generates raw events from the `track`
config. CEL rules handle **derivation** — turning raw events into
meaningful business events that flow to your sinks.

Every raw event carries a rich envelope:

```ts
{
  kind: "section.dwelled",
  ts: 12345.67,
  page: { id: "product-detail", attrs: { productId: "sku-123" } },
  target: { id: "pricing", type: "section", selector: "#pricing" },
  fields: {
    durationMs: 8421,
    entryTs: 3924,
    exitTs: 12345,
    sectionId: "pricing"
  }
}
```

## Sections (IntersectionObserver)

Sections are tracked with `IntersectionObserver` — not scroll listeners.
The lifecycle events emitted:

| Plan Event | Fires When |
|---|---|
| `section.entered` | Element crosses the visibility threshold |
| `section.dwelled` | On exit, with `durationMs` pre-computed |
| `section.left` | Element exits the viewport |

Per-section threshold and lifecycle filtering:

```ts
sections: [
  { id: "hero",    selector: "#hero",    threshold: 0.3 },
  { id: "pricing", selector: "#pricing", threshold: [0, 0.5, 1] },
]
```

## Clicks (durable IDs)

Use `data-tflow-id` attributes — they are the durable analytics contract.
CSS selectors are implementation details and will drift.

```html
<button data-tflow-id="buy_now">Buy now</button>
```

```ts
clicks: [
  { id: "buy_now" },
  // Optional fallback selector if the element lacks data-tflow-id:
  { id: "legacy_button", selector: ".old-cta-class" },
]
```

## Pointer sampling

Mouse moves are opt-in and sampled. Raw paths are not sent by default.

```ts
pointer: { moves: "sampled", sampleMs: 250 }
```

Emits `pointer.sampled` events with `x`, `y`, and `pointerType`.
Designed for deriving higher-level signals (hovered_cta, rage_click,
cursor_engaged_section) in CEL rules rather than shipping raw streams.

## Error tracking

Catches JS errors, unhandled promise rejections, and resource load
failures. Each produces an `error` event with a `source` field
(`onerror`, `unhandledrejection`, `resource`). Rate-limited to avoid
flooding (default: 50 events).

```ts
errors: {
  jsErrors: true,
  promiseRejections: true,
  resourceErrors: true,
  ignorePatterns: ["chrome-extension://"],
}
```

Combine with the `error_hunting` preset for immediate derived signals:

```ts
presets: ["error_hunting"],
```

Derived signals: `js_error`, `promise_error`, `resource_error`.

## Scroll depth

Fires milestones at configurable depth thresholds (25%, 50%, 75%, 100%
by default). Each milestone fires once per page lifecycle.

```ts
scroll: {
  milestones: [0.25, 0.5, 0.75, 1],
  throttleMs: 250,
  directionChanges: true,  // emit scroll.inverted on direction reversal
}
```

Combine with `scroll_tracking` preset for derived signals:
`scrolled_50`, `scrolled_75`, `scrolled_100`.

## Element visibility

Tracks DOM elements appearing or disappearing — modals, toasts, error
banners, loading spinners. Uses MutationObserver for DOM insertions
and periodic polling for CSS class toggles.

```ts
visibility: {
  selectors: [
    { id: "toast_error", selector: "[data-track-visibility='toast_error']" },
    { id: "modal_confirm", selector: ".confirm-modal" },
  ],
}
```

Emits `element.shown` and `element.hidden` events with `reason`
(`dom-added`, `dom-removed`, `style-changed`). Works with form
error banners tagged `[data-error]` — track validation visibility.

## Page lifecycle

Emits events for page load, tab visibility, unload, SPA route changes,
idle detection, and bounce detection.

```ts
lifecycle: {
  pageLoad: true,
  visibilityChange: true,
  pageUnload: true,
  bounceThresholdMs: 10_000,   // bounce if user leaves <10s, no interaction
  idleThresholdMs: 30_000,     // idle after 30s of no activity
}
```

Events: `lifecycle.loaded`, `lifecycle.hidden` / `lifecycle.visible`,
`lifecycle.unloaded` (with `bounced` and `interactionCount` fields).

## Presets

Named rule sets for common meta-signal categories. Use them instead of
writing CEL by hand.

| Preset | Derived Signals |
|---|---|
| `section_engagement` | `section_read`, `section_skimmed`, `content_engaged` |
| `error_hunting` | `js_error`, `promise_error`, `resource_error` |
| `scroll_tracking` | `scrolled_50`, `scrolled_75`, `scrolled_100` |
| `bounce_detection` | `bounced` (duration + interaction count) |
| `cta_performance` | `cta_clicked` |
| `form_validation` | `form_submitted`, `form_validation_error` |
| `page_value` | `page_value_reached` |
| `full_engagement` | section_engagement + rage_click heuristic |

```ts
import { tflo } from "@tflo/browser-events";

tflo({
  page: { id: "landing" },
  track: {
    sections: [ ... ],
    errors: {},
    scroll: {},
    lifecycle: { bounceThresholdMs: 10_000 },
  },
  presets: ["section_engagement", "error_hunting", "scroll_tracking", "bounce_detection"],
  sinks: { ga4: { measurementId: "G-XXX" } },
});
```

## Derivation rules (CEL)

Rules transform raw events into domain signals. Each rule is a CEL
predicate + emit mapping:

```ts
rules: [
  {
    id: "section_read",
    when: `event.kind == "section.dwelled" && event.durationMs >= 3000`,
    emit: {
      name: "section_read",
      params: {
        section_id: "event.target.id",
        duration_ms: "event.durationMs",
      },
    },
  },
]
```

The `when` field accepts either:
- A **CEL string** — compiled by the JS evaluator (WASM CEL parser from
the `tflo-cel-parser` crate coming in v0.2+)
- A **JS closure** — `(event: EventRecord) => boolean`

The `emit.params` map resolves dotted paths against the event:

| Path | Resolves To |
|---|---|
| `event.kind` | `record.kind` |
| `event.durationMs` | `record.fields.durationMs` |
| `event.target.id` | `record.target?.id` |
| `event.page.id` | `record.page?.id` |

A tracked `when` CEL expression supports:

- `event.kind == "value"`
- `event.field >= 3000` `>` `<` `<=`
- Compound: `expr1 && expr2`

## Sinks — GA4, Edge, Console

Configure sinks with a single object in the tracking plan:

```ts
sinks: {
  ga4: { measurementId: "G-XXXXXXXX" },
  edge: {
    endpoint: "/collect/signals",
    batchSize: 10,
    batchIntervalMs: 1000,
    headers: { "x-api-key": "abc" },
  },
  console: true,
}
```

This auto-creates the underlying sink implementations:

| Sink | Description |
|---|---|
| `console` | `ConsoleSink` — logs to the browser console |
| `ga4` | `GA4Sink` — forwards via `gtag.js` to Google Analytics 4 |
| `edge` | `EdgeSink` — POSTs to your own edge collector |

## Advanced: lower-level `TFloBrowser` API

The underlying `TFloBrowser` class, pattern builder, capture helpers,
and sink router are still fully available for custom wiring:

```ts
import { TFloBrowser, Pattern, ConsoleSink, type EventRecord } from "@tflo/browser-events";

const tflo = new TFloBrowser({ sinks: [new ConsoleSink()] });
await tflo.init();

const pattern = new Pattern<EventRecord>("abandoned_cart")
  .timestamp(e => e.ts)
  .when(e => e.kind === "add_to_cart")
  .notThen(e => e.kind === "purchase")
  .within(5 * 60 * 1000)
  .emit(m => ({
    name: "abandoned_cart",
    payload: { cartId: m.first().fields.cartId },
  }));

tflo.addPattern(pattern);
tflo.capture({ target: document, type: "click", kind: "add_to_cart", fields: /* ... */ });
```

## Codegen / auto-discovery

The tracking plan schema includes `auto` hints for LLMs and codegen tooling.
These are not read by the runtime — they are consumed by:

- **LLM prompts** — generate a `TrackingPlan` from a component tree
- **CLI tools** — scan a project and produce the JSON/YAML plan
- **Framework plugins** — React, Astro, Next.js adapters

```ts
auto: {
  scanSections: "[data-section-id], section[id], [data-track-section]",
  scanClicks: true,     // scan for [data-tflow-id]
  scanForms: "form[data-track-form], form[id]",
  scanVisibility: "[data-track-visibility]",
}
```

A codegen prompt can be as simple as:

> "Given this React component tree, generate a `TrackingPlan` for
> `@tflo/browser-events` that tracks section visibility, CTA clicks,
> JS errors, scroll depth, and lifecycle transitions. Use `data-tflow-id`
> attributes for buttons and `data-track-section` for sections."

The output is a single JSON object — no imperative wiring code needed.

## What's tested

```
tests/sinks.test.ts          10 tests   sink routing, error isolation, GA4, EdgeSink batching + sendBeacon
tests/capture.test.ts         4 tests   custom fields, throttling, unbind
tests/viewport.test.ts        6 tests   enter/exit/dwell, threshold-stepping, trailing-flush, multi-section
tests/pattern-runtime.test.ts 6 tests   abandoned_cart, engaged_with_product, flush, builder validation
tests/plan.test.ts           10 tests   CEL evaluator, path resolver, sink factory, rule compiling
tests/presets.test.ts         6 tests   preset expansion, deduplication, rule structure validation
                              ─────────
                              42 passed
```

All pattern-runtime tests drive the real WASM (loaded via the
`tflo_cep_wasm` nodejs-target build), so the matching engine is
end-to-end verified through the TypeScript surface.

## Roadmap to v0.2

- **WASM CEL parser** — compile from the `tflo-cel-parser` crate for full
  CEL support (string ops, `has()`, `startsWith()`, `in`, arithmetic)
- **`repeated(n..=m, predicate)`** — quantifier sugar for "N+ clicks within T"
- **IndexedDB retry queue** — for offline / unstable network
- **Service-worker replay** — backfill on the next page load
- **`PerformanceObserver` adapter** — Long Tasks, LCP, INP, navigation timing
- **Worker mode** — run the matching engine in a dedicated Worker
- **Derived signals** — hovered_cta, hesitated_on_form, rage_click, dead_click

## Build from source

```bash
git clone https://github.com/matt-cochran/tflo-browser-events
git clone https://github.com/matt-cochran/tflo  # next to this repo
cd tflo-browser-events
npm install
npm run build:wasm       # invokes wasm-pack against ../tflo/tflo-cep-wasm
npm run build:ts         # invokes tsc
npm test                 # 36 tests
```

`TFLO_PATH` overrides the default `../tflo` location.

## License

MIT OR Apache-2.0.
