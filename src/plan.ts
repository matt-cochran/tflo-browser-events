/**
 * Tracking plan runtime — `TFlow.init(plan)`.
 *
 * Consumes a declarative `TrackingPlan` and wires:
 * - Section tracking  → IntersectionObserver (extended lifecycle events)
 * - Click tracking    → delegated click listener (id-first, selector-fallback)
 * - Pointer sampling  → sampled pointermove on document (opt-in)
 * - Derivation rules  → compiled into pattern runtimes
 * - Sinks             → auto-configured from the plan's `sinks` block
 *
 * ## Three-layer model
 *
 *   Plan Layer      what DOM things to observe and what rules to apply
 *   Raw Events      section.entered, section.dwelled, button.clicked, pointer.sampled
 *   Derived Signals meaningful business events (hero_seen, pricing_read, etc.)
 *
 * The tracking plan automatically generates raw events from sections,
 * clicks, and pointer config. CEL rules handle **derivation** — turning
 * raw events into domain signals.
 *
 * ## Event envelope
 *
 *   {
 *     kind: "section.left",
 *     ts: 12345.67,
 *     page: { id: "product-detail", attrs: { productId: "sku-123" } },
 *     target: { id: "pricing", type: "section", selector: "#pricing" },
 *     fields: { visible_ms: 8421, max_ratio: 0.92 }
 *   }
 */

import { capture } from "./capture.js";
import {
    captureViewport,
    type CaptureViewportOptions,
} from "./observers/viewport.js";
import { captureErrors } from "./observers/errors.js";
import { captureScroll } from "./observers/scroll.js";
import { captureVisibility } from "./observers/visibility.js";
import { captureLifecycle } from "./observers/lifecycle.js";
import { TFloBrowser } from "./browser.js";
import { Pattern } from "./pattern.js";
import { ConsoleSink, EdgeSink, GA4Sink } from "./sinks/index.js";
import { expandPresets } from "./presets.js";
import { checkSelectorHealth } from "./diagnostics.js";
import type {
    EventRecord,
    TrackingPlan,
    SectionTrack,
    ClickTrack,
    PointerTrack,
    TrackingRule,
    SinkConfig,
    ViewportLifecycleEvent,
    Sink,
} from "./types.js";

// ─── public API ────────────────────────────────────────────────────

export interface TFlowInitResult {
    /** The underlying TFloBrowser instance — for advanced use. */
    readonly tflo: TFloBrowser;
    /** Promise that resolves when WASM is loaded and all wiring is done. */
    readonly ready: Promise<void>;
    /** Flush and teardown. */
    destroy(): Promise<void>;
}

/**
 * Initialize the tracking plan: observe DOM, wire patterns, configure sinks.
 *
 * Every captured event is enriched with `page` and `target` context
 * before being pushed into the pattern matching engine.
 *
 * CEL string predicates are compiled via a JS evaluator (full WASM CEL
 * parser from the `tflo-cel-parser` crate lands in v0.2+).
 */
export async function init(plan: TrackingPlan): Promise<TFlowInitResult> {
    const builtSinks = buildSinks(plan.sinks);
    const tflo = new TFloBrowser({
        sinks: builtSinks,
        consent: plan.consent,
        wasmUrl: plan.wasmUrl,
        onSinkError: plan.onSinkError,
    });

    await tflo.init();

    // Diagnostic sink: emit tflo:diagnostic events through the same pipeline
    const emitDiagnostic = (record: EventRecord) => {
        tflo.ingest(record);
    };

    // Create an enricher for page context — only carries page.id.
    // Full session metadata is emitted once as session_started.
    const pageId = plan.page.id;
    const enrichPage = (record: EventRecord): EventRecord => ({
        ...record,
        page: { id: pageId },
    });

    // Emit session_started with all metadata (page, GA-style fields)
    tflo.ingest(buildSessionStartEvent(plan.page));

    const unbindFns: Array<() => void> = [];

    // WARN helper: check selectors at init and emit diagnostics
    const checkSelectors = (
        /* label */ _label: string,
        selector: string,
        configKey: string,
    ) => {
        const result = document.querySelectorAll(selector);
        checkSelectorHealth(selector, configKey, result, emitDiagnostic);
    };

    // Layer 1: Capture — wire DOM observations through the enricher
    if (plan.track.sections && plan.track.sections.length > 0) {
        for (const section of plan.track.sections) {
            checkSelectors(
                "section",
                section.selector,
                `track.sections["${section.id}"]`,
            );
            unbindFns.push(wireSectionLayer(tflo, enrichPage, section));
        }
    }

    if (plan.track.clicks && plan.track.clicks.length > 0) {
        const configuredIds = new Set(plan.track.clicks.map((c) => c.id));
        for (const c of plan.track.clicks) {
            checkSelectors(
                "click",
                `[data-tflow-id="${c.id}"]`,
                `track.clicks["${c.id}"]`,
            );
        }
        unbindFns.push(
            wireClickLayer(tflo, enrichPage, plan.track.clicks, configuredIds),
        );
    }

    if (plan.track.pointer && plan.track.pointer.moves === "sampled") {
        unbindFns.push(wirePointerLayer(tflo, enrichPage, plan.track.pointer));
    }

    // Layer 1: Error capture
    if (plan.track.errors) {
        unbindFns.push(
            captureErrors({
                cfg: plan.track.errors,
                handler: (raw) => tflo.ingest(enrichPage(raw)),
            }),
        );
    }

    // Layer 1: Scroll depth
    if (plan.track.scroll) {
        unbindFns.push(
            captureScroll({
                cfg: plan.track.scroll,
                handler: (raw) => tflo.ingest(enrichPage(raw)),
            }),
        );
    }

    // Layer 1: Element visibility
    if (plan.track.visibility) {
        unbindFns.push(
            captureVisibility({
                cfg: plan.track.visibility,
                handler: (raw) => tflo.ingest(enrichPage(raw)),
            }),
        );
    }

    // Layer 1: Page lifecycle
    if (plan.track.lifecycle) {
        unbindFns.push(
            captureLifecycle({
                cfg: plan.track.lifecycle,
                handler: (raw) => tflo.ingest(enrichPage(raw)),
            }),
        );
    }

    // Layer 2: Derivation — expand presets + compile rules into pattern runtimes
    const allRules: TrackingRule[] = [];
    if (plan.presets && plan.presets.length > 0) {
        allRules.push(...expandPresets(plan.presets));
    }
    if (plan.rules && plan.rules.length > 0) {
        allRules.push(...plan.rules);
    }
    for (const rule of allRules) {
        wireRule(tflo, rule);
    }

    const ready = Promise.resolve();

    return {
        tflo,
        ready,
        async destroy() {
            for (const fn of unbindFns) fn();
            await tflo.flush();
            tflo.destroy();
        },
    };
}

// ─── sink factory ──────────────────────────────────────────────────

function buildSinks(cfg?: SinkConfig): Sink[] {
    const out: Sink[] = [];
    if (!cfg) return out;

    if (cfg.console) {
        const level =
            typeof cfg.console === "object" ? cfg.console.level : undefined;
        out.push(new ConsoleSink({ name: "console", level }));
    }

    if (cfg.ga4) {
        out.push(
            new GA4Sink({
                name: "ga4",
                sendTo: cfg.ga4.measurementId,
                gtag: cfg.ga4.gtag,
            }),
        );
    }

    if (cfg.edge) {
        out.push(
            new EdgeSink({
                name: "edge",
                endpoint: cfg.edge.endpoint,
                batchSize: cfg.edge.batchSize,
                batchIntervalMs: cfg.edge.batchIntervalMs,
                headers: cfg.edge.headers,
            }),
        );
    }

    return out;
}

// ─── section layer ─────────────────────────────────────────────────

/**
 * Wire section tracking via IntersectionObserver.
 *
 * Maps plan lifecycle keywords to raw event kinds:
 *
 *   entered            → "section.entered"
 *   visibility_changed → "section.visibility_changed"
 *   dwelled            → "section.dwelled"   (emitted alongside "section.left")
 *   left               → "section.left"
 *   completed          → "section.completed"
 *
 * Each event is enriched with `page` and `target` context.
 */
function wireSectionLayer(
    tflo: TFloBrowser,
    enrichPage: (r: EventRecord) => EventRecord,
    section: SectionTrack,
): () => void {
    const sectionId = section.id;
    const rawEmit = computeRawEmit(section.emit);
    const viewportBind = captureViewport(
        {
            target: document,
            selector: section.selector,
            threshold: section.threshold ?? 0.5,
            emit: rawEmit,
            now: () => performance.now(),
        },
        (raw) => {
            // Rename raw viewport kinds to plan-level event kinds
            const kind = mapRawKind(raw.kind);
            tflo.ingest(
                enrichPage({
                    ...raw,
                    kind,
                    target: {
                        id: sectionId,
                        type: "section",
                        selector: section.selector,
                    },
                }),
            );
        },
    );

    return viewportBind;
}

/** Compute the raw viewport emit mode from the plan-level config. */
function computeRawEmit(
    emit?: ViewportLifecycleEvent[],
): CaptureViewportOptions["emit"] {
    if (!emit) return ["enter", "exit", "dwell"];
    const kinds = new Set(emit);
    const raw: Array<"enter" | "exit" | "dwell"> = [];
    if (kinds.has("entered") || kinds.has("visibility_changed"))
        raw.push("enter");
    if (kinds.has("dwelled")) raw.push("dwell");
    if (kinds.has("left") || kinds.has("completed")) raw.push("exit");
    return raw.length > 0 ? raw : ["enter", "exit", "dwell"];
}

/** Map the lower-case viewport event kind to the plan-level event name. */
function mapRawKind(raw: string): string {
    switch (raw) {
        case "viewport:enter":
            return "section.entered";
        case "viewport:dwell":
            return "section.dwelled";
        case "viewport:exit":
            return "section.left";
        default:
            return raw;
    }
}

// ─── click layer ───────────────────────────────────────────────────

/**
 * Wire delegated click tracking on `document`.
 *
 * Recognition order:
 * 1. `[data-tflow-id]` on the target or any ancestor — the durable ID
 * 2. Falls through if no `data-tflow-id` matches a configured `ClickTrack`
 *
 * Each click event is enriched with `page` and `target` context.
 * Clicks on elements with unconfigured `data-tflow-id` values emit
 * a `tflo:diagnostic` so you can discover coverage gaps.
 */
function wireClickLayer(
    tflo: TFloBrowser,
    enrichPage: (r: EventRecord) => EventRecord,
    clicks: ClickTrack[],
    _configuredIds: Set<string>,
): () => void {
    // Build index: data-tflow-id → ClickTrack
    const idIndex = new Map<string, string>(); // id → selector (for target context)
    for (const c of clicks) {
        idIndex.set(c.id, c.selector ?? `[data-tflow-id="${c.id}"]`);
    }

    return capture<MouseEvent>(
        {
            target: document,
            type: "click",
            kind: "click",
            fields: (e) => {
                const el = e.target as HTMLElement | null;
                if (!el) return {};
                const tracked = closestTFlowElement(el);
                if (!tracked) return {};
                const tflowId = tracked.getAttribute("data-tflow-id");
                if (!tflowId || !idIndex.has(tflowId)) return {};
                return {
                    tflowId,
                    text: tracked.textContent?.trim().slice(0, 80) ?? null,
                    tag: tracked.tagName.toLowerCase(),
                };
            },
            listenerOptions: { passive: true },
        },
        (raw) => {
            const tflowId = raw.fields["tflowId"];
            if (typeof tflowId !== "string") return;
            tflo.ingest(
                enrichPage({
                    ...raw,
                    kind: "click",
                    target: {
                        id: tflowId,
                        type: "click",
                        selector:
                            idIndex.get(tflowId) ??
                            `[data-tflow-id="${tflowId}"]`,
                    },
                }),
            );
        },
    );
}

function closestTFlowElement(el: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = el;
    while (current) {
        if (current.hasAttribute("data-tflow-id")) return current;
        current = current.parentElement;
    }
    return null;
}

// ─── pointer layer ─────────────────────────────────────────────────

/**
 * Sampled pointer tracking. Emits `"pointer.sampled"` records at the
 * configured interval. Default sample rate: 250ms.
 */
function wirePointerLayer(
    tflo: TFloBrowser,
    enrichPage: (r: EventRecord) => EventRecord,
    cfg: PointerTrack,
): () => void {
    return capture<PointerEvent>(
        {
            target: document,
            type: "pointermove",
            kind: "pointermove",
            throttleMs: cfg.sampleMs ?? 250,
            fields: (e) => ({
                x: e.clientX,
                y: e.clientY,
                pointerType: e.pointerType,
            }),
            listenerOptions: { passive: true },
        },
        (raw) => {
            tflo.ingest(
                enrichPage({
                    ...raw,
                    kind: "pointer.sampled",
                }),
            );
        },
    );
}

// ─── rule wiring ───────────────────────────────────────────────────

/**
 * Compile a tracking rule into a WASM pattern runtime.
 *
 * CEL string → compiled via `celToPredicate()` (JS evaluator).
 * Closure → passed through directly.
 *
 * Each rule becomes a single-step pattern: `when(predicate).emit(...)`.
 */
function wireRule(tflo: TFloBrowser, rule: TrackingRule): void {
    const predicate =
        typeof rule.when === "function" ? rule.when : celToPredicate(rule.when);

    const emitConfig = rule.emit;

    const pattern = new Pattern<EventRecord>(rule.id)
        .timestamp((e) => e.ts)
        .when((e) => predicate(e))
        .emit((m) => {
            const ev = m.first();
            const outName = emitConfig.name ?? rule.id;
            const payload = buildEmitPayload(ev, emitConfig.params);
            return {
                name: outName,
                payload,
                sinks: emitConfig.sinks,
            };
        });

    tflo.addPattern(pattern);
}

/**
 * Build the emit payload from parameter mappings.
 * Each value is a dotted path resolved against the event:
 *   `"event.sectionId"` → event.fields.sectionId
 *   `"event.kind"`      → event.kind
 *   `"event.page.id"`   → event.page?.id
 */
function buildEmitPayload(
    event: EventRecord,
    params?: Record<string, string>,
): Record<string, unknown> {
    if (!params) return {};
    const out: Record<string, unknown> = {};
    for (const [key, path] of Object.entries(params)) {
        out[key] = resolvePath(event, path);
    }
    return out;
}

/**
 * Resolve a dotted path against an event.
 *
 * `"event.kind"` → event.kind
 * `"event.durationMs"` → event.fields.durationMs
 * `"event.page.id"` → event.page?.id
 */
function resolvePath(event: EventRecord, path: string): unknown {
    const segments = path.split(".");
    const start = segments[0] === "event" ? 1 : 0;
    let value: unknown = event;
    for (let i = start; i < segments.length; i++) {
        if (value == null) return undefined;
        const seg = segments[i]!;
        // First try the property on the current value
        const direct = (value as Record<string, unknown>)[seg];
        if (direct !== undefined) {
            value = direct;
        } else if (value === event && seg in event.fields) {
            // Fallback: unresolved top-level property → check fields
            value = event.fields[seg];
        } else {
            return undefined;
        }
    }
    return value;
}

// ─── session metadata ──────────────────────────────────────────────

/**
 * Build the session_started event — emitted once at init with
 * all page metadata (GA-style fields). Subsequent events only
 * carry `page.id` for correlation.
 */
function buildSessionStartEvent(
    page: import("./types.js").PageInfo,
): EventRecord {
    const sessionId = page.sessionId ?? generateSessionId();
    return {
        ts: performance.now(),
        kind: "session_started",
        page: { id: page.id, attrs: page.attrs },
        fields: {
            sessionId,
            title: page.title ?? resolveDocumentTitle(),
            url: page.url ?? resolveUrl(),
            referrer: page.referrer ?? resolveReferrer(),
            locale: page.locale ?? resolveLocale(),
            trafficSource: page.trafficSource ?? null,
            trafficMedium: page.trafficMedium ?? null,
            campaign: page.campaign ?? null,
            pageLoadTs: page.pageLoadTs ?? performance.timeOrigin,
        },
        target: { id: page.id, type: "page" },
    };
}

function resolveDocumentTitle(): string {
    try {
        return document.title || "";
    } catch {
        return "";
    }
}

function resolveUrl(): string {
    try {
        return location.href || "";
    } catch {
        return "";
    }
}

function resolveReferrer(): string {
    try {
        return document.referrer || "";
    } catch {
        return "";
    }
}

function resolveLocale(): string {
    try {
        return navigator.language || "";
    } catch {
        return "";
    }
}

function generateSessionId(): string {
    // Simple random session ID — replace with your own UUID library
    // if you need collision resistance at scale.
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── CEL evaluator (JS bridge — WASM CEL parser lands in v0.2) ────

/**
 * Compile a CEL expression string into a predicate function.
 *
 * Supported expressions (v0.2 subset):
 *
 *   `event.kind == "value"`
 *   `event.field >= number`
 *   `event.field >= number && event.other > number`
 *
 * Roadmap: compile from the `tflo-cel-parser` WASM crate for full
 * CEL support (string ops, `has()`, `startsWith()`, type coercion).
 */
function celToPredicate(expr: string): (event: EventRecord) => boolean {
    const parts = expr.split(/\s*&&\s*/);
    const checks = parts.map((part) => compileSimpleCondition(part.trim()));
    return (event: EventRecord) => checks.every((fn) => fn(event));
}

function compileSimpleCondition(cond: string): (event: EventRecord) => boolean {
    // event.kind == "value"
    const eqMatch = cond.match(/^event\.(\w+)\s*==\s*"(.+)"$/);
    if (eqMatch) {
        const field = eqMatch[1]!;
        const val = eqMatch[2]!;
        return (e) => resolveField(e, field) === val;
    }

    // event.field >= number
    const geMatch = cond.match(/^event\.(\w+)\s*>=\s*([\d.]+)$/);
    if (geMatch) {
        const field = geMatch[1]!;
        const val = Number(geMatch[2]);
        return (e) => {
            const v = resolveField(e, field);
            return typeof v === "number" && v >= val;
        };
    }

    // event.field > number
    const gtMatch = cond.match(/^event\.(\w+)\s*>\s*([\d.]+)$/);
    if (gtMatch) {
        const field = gtMatch[1]!;
        const val = Number(gtMatch[2]);
        return (e) => {
            const v = resolveField(e, field);
            return typeof v === "number" && v > val;
        };
    }

    // event.field <= number
    const leMatch = cond.match(/^event\.(\w+)\s*<=\s*([\d.]+)$/);
    if (leMatch) {
        const field = leMatch[1]!;
        const val = Number(leMatch[2]);
        return (e) => {
            const v = resolveField(e, field);
            return typeof v === "number" && v <= val;
        };
    }

    // event.field < number
    const ltMatch = cond.match(/^event\.(\w+)\s*<\s*([\d.]+)$/);
    if (ltMatch) {
        const field = ltMatch[1]!;
        const val = Number(ltMatch[2]);
        return (e) => {
            const v = resolveField(e, field);
            return typeof v === "number" && v < val;
        };
    }

    throw new Error(`Cannot compile CEL expression: "${cond}"`);
}

function resolveField(event: EventRecord, name: string): unknown {
    if (name === "kind") return event.kind;
    if (name === "ts") return event.ts;
    // Check page context
    if (name.startsWith("page.")) {
        const sub = name.slice(5);
        return (event.page as Record<string, unknown>)?.[sub];
    }
    // Check target context
    if (name.startsWith("target.")) {
        const sub = name.slice(7);
        return (event.target as Record<string, unknown>)?.[sub];
    }
    return event.fields[name];
}
