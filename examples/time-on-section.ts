/**
 * Example: measure how long visitors spend reading each section of a
 * page. Uses `captureViewport()` (IntersectionObserver under the hood)
 * to emit per-section dwell events. The dwell event arrives on exit
 * with `durationMs` already computed — no pattern needed.
 *
 * Markup expected:
 *
 *   <section data-section-id="intro">  ... </section>
 *   <section data-section-id="features"> ... </section>
 *   <section data-section-id="pricing"> ... </section>
 *
 * Each section becomes one observed element. Default sectionIdFrom
 * reads `data-section-id`; pass your own if you key sections differently.
 */

import { TFloBrowser, ConsoleSink, EdgeSink } from "../src/index.js";

const tflo = new TFloBrowser({
  sinks: [
    new ConsoleSink({ name: "dev" }),
    new EdgeSink({ name: "edge", endpoint: "/collect/signals" }),
  ],
});

await tflo.init();

// Observe every section element. Emits viewport:enter on entry,
// viewport:exit on exit, and viewport:dwell on exit with durationMs.
tflo.captureViewport({
  target: document,
  selector: "section[data-section-id]",
  threshold: 0.5, // section is "in view" when at least half visible
});

// If you want to filter to dwell-only (skip the enter/exit chatter):
//
// tflo.captureViewport({
//   target: document,
//   selector: "section[data-section-id]",
//   emit: ["dwell"],
// });

// Optional: forward dwells to GA4 / your warehouse. The captured records
// flow through every registered sink (`ConsoleSink` will log them in
// development; `EdgeSink` ships them to your collector for ClickHouse,
// GA4 Measurement Protocol, etc).

// Flush on page hide so the last section's trailing dwell ships reliably.
window.addEventListener("pagehide", () => {
  void tflo.flush();
});
