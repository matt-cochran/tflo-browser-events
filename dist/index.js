/**
 * @tflo/browser-events
 *
 * Browser SDK for `tflo-cep`: capture events, derive signals from
 * declarative patterns, ship them to any sink — GA4, your own edge
 * collector, ClickHouse via relay, console, custom.
 */
export { TFloBrowser } from "./browser.js";
export { Pattern, CompiledPattern, PatternRuntime, } from "./pattern.js";
// ─── Low-level capture ─────────────────────────────────────────────
export { capture, } from "./capture.js";
export { captureViewport, } from "./observers/viewport.js";
export { captureErrors, } from "./observers/errors.js";
export { captureScroll, } from "./observers/scroll.js";
export { captureVisibility, } from "./observers/visibility.js";
export { captureLifecycle, } from "./observers/lifecycle.js";
// ─── Sinks ──────────────────────────────────────────────────────────
export { SinkRouter, ConsoleSink, EdgeSink, GA4Sink, } from "./sinks/index.js";
// ─── Tracking Plan API (declarative init) ──────────────────────────
export { init as tflo } from "./plan.js";
export { expandPreset, expandPresets } from "./presets.js";
export { validatePlan, } from "./validate.js";
export { diagnosticEvent, checkSelectorHealth, checkClickCoverage, } from "./diagnostics.js";
//# sourceMappingURL=index.js.map