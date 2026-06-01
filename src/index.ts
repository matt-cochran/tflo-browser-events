/**
 * @tflo/browser-events
 *
 * Browser SDK for `tflo-cep`: capture events, derive signals from
 * declarative patterns, ship them to any sink — GA4, your own edge
 * collector, ClickHouse via relay, console, custom.
 */

export { TFloBrowser, type TFloBrowserOptions } from "./browser.js";
export {
    Pattern,
    CompiledPattern,
    PatternRuntime,
    type Match,
    type EmitOutput,
} from "./pattern.js";

// ─── Low-level capture ─────────────────────────────────────────────
export {
    capture,
    type CaptureOptions,
    type CaptureHandler,
} from "./capture.js";
export {
    captureViewport,
    type CaptureViewportOptions,
    type ViewportHandler,
    type ViewportEmitKind,
    type ObserverFactory,
} from "./observers/viewport.js";
export {
    captureErrors,
    type ErrorObserverOptions,
} from "./observers/errors.js";
export {
    captureScroll,
    type ScrollObserverOptions,
} from "./observers/scroll.js";
export {
    captureVisibility,
    type VisibilityObserverOptions,
} from "./observers/visibility.js";
export {
    captureLifecycle,
    type LifecycleObserverOptions,
} from "./observers/lifecycle.js";

// ─── Sinks ──────────────────────────────────────────────────────────
export {
    SinkRouter,
    ConsoleSink,
    EdgeSink,
    GA4Sink,
    type EdgeSinkOptions,
    type GA4SinkOptions,
} from "./sinks/index.js";

// ─── Tracking Plan API (declarative init) ──────────────────────────
export { init as tflo, type TFlowInitResult } from "./plan.js";
export { expandPreset, expandPresets } from "./presets.js";
export {
    validatePlan,
    type ValidationIssue,
    type ValidationReport,
    type ValidateOptions,
} from "./validate.js";
export {
    diagnosticEvent,
    checkSelectorHealth,
    checkClickCoverage,
    type DiagnosticKind,
    type DiagnosticPayload,
} from "./diagnostics.js";
export type {
    EventRecord,
    DerivedSignal,
    Sink,
    TrackingPlan,
    PageInfo,
    TrackConfig,
    SectionTrack,
    ClickTrack,
    PointerTrack,
    ErrorTrack,
    ScrollTrack,
    FormTrack,
    VisibilityTrack,
    VisibilitySelector,
    LifecycleTrack,
    PerformanceTrack,
    AutoDiscovery,
    TrackingRule,
    TrackingEmit,
    TrackingPreset,
    SinkConfig,
    ViewportLifecycleEvent,
} from "./types.js";
