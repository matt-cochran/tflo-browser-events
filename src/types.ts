/**
 * Core types shared across the package. No DOM dependencies — these
 * compile cleanly for any JS environment (browser, node, worker).
 */

/**
 * A captured browser event in normalized shape. The capture layer
 * produces these; patterns consume them; emit closures may copy fields
 * into the outgoing signal.
 */
export interface EventRecord {
    /** Monotonic timestamp (milliseconds). Caller chooses the time
     * source — typically `performance.now()` in the browser. */
    ts: number;
    /** What happened — `"pointerdown"`, `"add_to_cart"`, etc. */
    kind: string;
    /** Arbitrary key/value payload. Keep these small and stable. */
    fields: Record<string, unknown>;
    /** Page context — set by the tracking plan when events are ingested
     * through `tflo()`. Optional; absent when events are pushed
     * directly via `tfloBrowser.ingest()`. */
    page?: { id: string; attrs?: Record<string, string> };
    /** Target context — set by the tracking plan for section/click/error
     * events. Identifies the DOM element or source that produced the event. */
    target?: { id: string; type: string; selector?: string };
}

/**
 * A signal emitted by a pattern's `emit` closure. This is the
 * SDK-level unit of meaning that gets routed to sinks.
 */
export interface DerivedSignal {
    /** Pattern name (or any user-chosen identifier). */
    name: string;
    /** Emission timestamp (milliseconds). The SDK fills this in on
     * the way out if the emit closure doesn't set it. */
    ts: number;
    /** User-defined payload from the emit closure. */
    payload: Record<string, unknown>;
    /** Optional sink hints. When set, only sinks whose name appears
     * here receive the signal. When unset/empty, every registered
     * sink receives it. */
    sinks?: string[];
}

/**
 * A sink consumes derived signals and ships them somewhere.
 * Implementations live in `./sinks/`; users can add their own by
 * implementing this interface.
 */
export interface Sink {
    /** Unique identifier — referenced by `DerivedSignal.sinks` hints. */
    readonly name: string;
    /** Deliver one signal. May be sync or async. Errors should be
     * thrown so the router can record them. */
    send(signal: DerivedSignal): void | Promise<void>;
    /** Optional buffered-flush. Called by the SDK on shutdown and on
     * page-visibility transitions. */
    flush?(): void | Promise<void>;
}

// ─── Tracking Plan types ───────────────────────────────────────────
// The declarative "capture plan" schema — specifies what DOM elements
// to observe, and what rules to apply to derive domain signals.
// This schema is designed to be codegen-friendly: LLMs and tooling
// should be able to generate complete TrackingPlan objects from
// component trees, static pages, or SPA route definitions.

/** Page context attached to every captured event. */
export interface PageInfo {
    /** Stable page identifier — e.g. `"product-detail"`, `"checkout"`.
     * This is the only required field. All others are auto-populated
     * from `document` / `window` / `navigator` at init time unless
     * explicitly overridden. */
    id: string;
    /** Optional page-level attributes (sku, category, experiment, etc.).
     * These are static per-page; GA-style dimensions live here. */
    attrs?: Record<string, string>;

    // ─── Auto-populated (GA4-inspired) ──────────────────────────
    /** Page title — defaults to `document.title`. */
    title?: string;
    /** Full URL — defaults to `location.href`. */
    url?: string;
    /** Referring URL — defaults to `document.referrer`. */
    referrer?: string;
    /** Locale — defaults to `navigator.language`. */
    locale?: string;
    /** Traffic source classification. Optional; set by your own
     * attribution logic. GA values: organic, cpc, referral, (none). */
    trafficSource?: string;
    /** Traffic medium. Optional. GA values: organic, cpc, referral, email. */
    trafficMedium?: string;
    /** Campaign name (from UTM or equivalent). */
    campaign?: string;

    // ─── Session ────────────────────────────────────────────────
    /** Session identifier — auto-generated if not provided
     * (random ID per page load). For SPA sessions, pass the same
     * session_id across route changes. */
    sessionId?: string;
    /** Page load timestamp (epoch ms) — defaults to
     * `performance.timeOrigin` at init time. */
    pageLoadTs?: number;
}

/** A section to track via IntersectionObserver. */
export interface SectionTrack {
    /** Stable analytics identifier — becomes `target.id` in the event. */
    id: string;
    /** CSS selector for the section element. */
    selector: string;
    /** IntersectionObserver threshold. Defaults to 0.5. */
    threshold?: number | number[];
    /** Which viewport lifecycle events to emit. Default: all. */
    emit?: ViewportLifecycleEvent[];
}

/** Viewport lifecycle events the tracking plan auto-emits. */
export type ViewportLifecycleEvent =
    | "entered"
    | "visibility_changed"
    | "dwelled"
    | "left"
    | "completed";

/** A click target to track. */
export interface ClickTrack {
    /** Stable analytics identifier — becomes `target.id` in the event.
     * Also used to look up `[data-tflow-id]` elements. Always prefer
     * `data-tflow-id` over CSS selectors — IDs are the durable
     * analytics contract. */
    id: string;
    /** CSS selector fallback when the element doesn't use
     * `[data-tflow-id]`. Optional; when omitted, only elements with
     * `data-tflow-id` matching `id` are tracked. */
    selector?: string;
}

/** Pointer sampling configuration. */
export interface PointerTrack {
    /** Sampling mode. `"sampled"` is the only mode in v0.2.
     * `"off"` disables pointer tracking entirely. */
    moves: "sampled" | "off";
    /** Sample interval in milliseconds. Defaults to 250. */
    sampleMs?: number;
}

// ─── NEW: Error tracking ───────────────────────────────────────────

/** Configuration for global error capture. */
export interface ErrorTrack {
    /** Catch `window.onerror`. Default: true. */
    jsErrors?: boolean;
    /** Catch `window.onunhandledrejection`. Default: true. */
    promiseRejections?: boolean;
    /** Catch resource load failures (`<img>`, `<script>`, `<link>`).
     * Uses a `window`-level `error` event listener. Default: true. */
    resourceErrors?: boolean;
    /** Skip errors from these origins (regex or string). */
    ignorePatterns?: string[];
    /** Max error events to capture (rate limit). Default: 50. */
    maxEvents?: number;
}

// ─── NEW: Scroll depth tracking ────────────────────────────────────

/** Scroll depth milestones. */
export interface ScrollTrack {
    /** Depth milestones to fire on (fraction 0..1). E.g. [0.25, 0.5, 0.75, 1].
     * Default: [0.25, 0.5, 0.75, 1]. */
    milestones?: number[];
    /** Throttle interval for scroll events (ms). Default: 250. */
    throttleMs?: number;
    /** Whether to track scroll *direction* changes. Default: false. */
    directionChanges?: boolean;
}

// ─── NEW: Form interaction tracking ────────────────────────────────

/** A form to track. */
export interface FormTrack {
    /** Stable analytics identifier — becomes `target.id`. */
    id: string;
    /** CSS selector for the `<form>` element. */
    selector: string;
    /** Track focus/blur on fields within this form. Default: true. */
    fieldFocus?: boolean;
    /** Track validation errors (elements matching `[data-error]` or
     * `:invalid` becoming visible). Default: false (uses MutationObserver). */
    validationErrors?: boolean;
    /** Track form submission timing. Default: true. */
    submit?: boolean;
    /** Track form abandonment (> thresholdMs without activity after
     * first interaction). Default: false. */
    abandonThresholdMs?: number;
}

// ─── NEW: Element visibility tracking (MutationObserver) ───────────

/** Track DOM elements becoming visible or hidden. */
export interface VisibilityTrack {
    /** Track these selectors for shown/hidden transitions.
     * Useful for modals, toast notifications, error banners,
     * loading spinners, confirmation dialogs. */
    selectors: VisibilitySelector[];
    /** Default: true. Uses MutationObserver + IntersectionObserver. */
    mutationObserver?: boolean;
    /** Track `display` toggles via CSS changes. Default: true. */
    styleChanges?: boolean;
    /** Track DOM insertion/removal. Default: true. */
    domChanges?: boolean;
}

/** An element to watch for show/hide transitions. */
export interface VisibilitySelector {
    /** Stable analytics id — becomes `target.id`. */
    id: string;
    /** CSS selector. */
    selector: string;
}

// ─── NEW: Page lifecycle tracking ──────────────────────────────────

/** Page lifecycle monitoring. */
export interface LifecycleTrack {
    /** Track initial page load (fires when DOMContentLoaded + all captures
     * are wired). Default: true. */
    pageLoad?: boolean;
    /** Track `visibilitychange` (tab switch, minimize). Default: true. */
    visibilityChange?: boolean;
    /** Track `beforeunload` / `pagehide` timing. Default: true. */
    pageUnload?: boolean;
    /** Track SPA route changes via `popstate` + `hashchange`.
     * Default: false (SPAs should wire their router explicitly). */
    routeChanges?: boolean;
    /** Emit an "idle" event after N ms of no tracked events.
     * Default: 0 (disabled). Use 30_000 for 30s idle detection. */
    idleThresholdMs?: number;
    /** Emit a "bounce" signal if the user leaves within N ms of page
     * load without any tracked interaction. Default: 0 (disabled).
     * Use 10_000 for 10s bounce detection. */
    bounceThresholdMs?: number;
}

// ─── NEW: Performance tracking (Core Web Vitals) ───────────────────

/** Core Web Vitals and navigation timing. */
export interface PerformanceTrack {
    /** Track LCP (Largest Contentful Paint). Default: true. */
    lcp?: boolean;
    /** Track INP (Interaction to Next Paint). Default: true. */
    inp?: boolean;
    /** Track CLS (Cumulative Layout Shift). Default: true. */
    cls?: boolean;
    /** Track FCP (First Contentful Paint). Default: false. */
    fcp?: boolean;
    /** Track TTFB (Time to First Byte). Default: false. */
    ttfb?: boolean;
    /** Track Long Tasks (> 50ms). Default: false. */
    longTasks?: boolean;
}

// ─── TrackConfig — the complete observation set ────────────────────

/** What DOM interactions to observe. */
export interface TrackConfig {
    /** Sections to observe via IntersectionObserver. */
    sections?: SectionTrack[];
    /** Click targets to listen on (delegated click handler on document). */
    clicks?: ClickTrack[];
    /** Pointer sampling config. */
    pointer?: PointerTrack;

    // ─── v0.2+ ──────────────────────────────────────────────────
    /** Global error capture (JS errors, promise rejections, resource
     * failures). */
    errors?: ErrorTrack;
    /** Scroll depth milestones. */
    scroll?: ScrollTrack;
    /** Form interactions (focus, submit, abandonment). */
    forms?: FormTrack[];
    /** Element visibility transitions (modals, toasts, banners). */
    visibility?: VisibilityTrack;
    /** Page lifecycle events (load, visibility, unload, idle, bounce). */
    lifecycle?: LifecycleTrack;
    /** Core Web Vitals and performance timing. */
    performance?: PerformanceTrack;

    /** Auto-discovery hints for codegen/LLM tooling. The runtime does
     * not scan automatically — these flags are for tooling that generates
     * the TrackingPlan object. */
    auto?: AutoDiscovery;
}

// ─── Auto-discovery (codegen tooling) ──────────────────────────────

/** Hints for automated plan generation. The runtime itself does not
 * scan the DOM; these are consumed by codegen tools (CLI, LLM prompts,
 * framework plugins) that produce the TrackingPlan object. */
export interface AutoDiscovery {
    /** Scan for sections using this CSS selector.
     * Default for codegen: `"[data-section-id], section[id], [data-track-section]"`. */
    scanSections?: boolean | string;
    /** Scan for click targets using `[data-tflow-id]`.
     * Default for codegen: true when not explicitly set. */
    scanClicks?: boolean;
    /** Scan for forms using this CSS selector.
     * Default for codegen: `"form[data-track-form], form[id]"`. */
    scanForms?: boolean | string;
    /** Scan for visibility targets (modals, toasts) using these selectors.
     * Default for codegen: `"[data-track-visibility]"`. */
    scanVisibility?: boolean | string;
}

// ─── Preset rule sets ──────────────────────────────────────────────

/** Named preset that expands to a set of TrackingRules.
 * These make it easy to add common meta-signals without writing CEL. */
export type TrackingPreset =
    | "section_engagement"
    | "full_engagement"
    | "error_hunting"
    | "scroll_tracking"
    | "form_validation"
    | "page_value"
    | "cta_performance"
    | "bounce_detection"
    | "diagnostics";

// ─── Derivation rules ──────────────────────────────────────────────

/**
 * A derivation rule — CEL predicate + emit mapping.
 *
 * `when` accepts either a CEL string expression or a JS closure.
 * CEL strings are parsed by the JS CEL evaluator; full WASM CEL
 * parsing is on the roadmap (v0.2+).
 */
export interface TrackingRule {
    /** Rule identifier — used as the derived signal name by default. */
    id: string;
    /** CEL expression or predicate closure. The expression receives
     * `event` (the captured `EventRecord`) in scope. */
    when: string | ((event: EventRecord) => boolean);
    /** Output signal configuration. */
    emit: TrackingEmit;
}

/** Output mapping for a tracking rule. */
export interface TrackingEmit {
    /** Derived signal name. Defaults to the rule's `id`. */
    name?: string;
    /** Parameter mapping — `"event.sectionId"` extracts from the
     * captured event's fields. Supports dotted-path access. */
    params?: Record<string, string>;
    /** Which sinks to route to. Unset = all registered sinks. */
    sinks?: string[];
}

// ─── Sink configuration ────────────────────────────────────────────

/** Sink configuration at init time — one-line GA4, edge, etc. */
export interface SinkConfig {
    /** Google Analytics 4: supply measurement ID to auto-configure. */
    ga4?: {
        measurementId: string;
        /** Optional override for the gtag function (useful for tests). */
        gtag?: (
            command: "event",
            name: string,
            params: Record<string, unknown>,
        ) => void;
    };
    /** First-party edge collector. */
    edge?: {
        endpoint: string;
        batchSize?: number;
        batchIntervalMs?: number;
        headers?: Record<string, string>;
    };
    /** Debug sink — logs to console. Enabled by default in development. */
    console?: boolean | { level?: "log" | "info" | "debug" };
}

// ─── Top-level plan ────────────────────────────────────────────────

/**
 * The full tracking plan — what to observe, how to derive signals,
 * and where to send them.
 *
 * This is the top-level entry point for `tflo(plan)`.
 * Designed to be codegen-friendly: LLMs and framework plugins can
 * generate complete plans from component trees, static HTML, or
 * SPA route definitions.
 */
export interface TrackingPlan {
    /** Page identity — attached to every captured event. */
    page: PageInfo;
    /** What DOM interactions to observe. */
    track: TrackConfig;
    /** Preset rule sets to include. Expands to TrackingRule objects. */
    presets?: TrackingPreset[];
    /** Derivation rules — CEL patterns that produce domain signals.
     * Combined with expanded presets at init time. */
    rules?: TrackingRule[];
    /** Where to send derived signals. */
    sinks?: SinkConfig;
    /** Optional consent gate. */
    consent?: () => boolean;
    /** Path to the WASM file (relative to the JS bundle or absolute URL). */
    wasmUrl?: string | URL;
    /** Error callback — receives delivery errors from individual sinks. */
    onSinkError?: (sinkName: string, err: unknown) => void;
}
