/**
 * Diagnostic layer — surfaces tflo operational events through the same
 * ingest→pattern→sink pipeline that user events flow through.
 *
 * Diagnostics include:
 *   - Selector staleness (zero elements matched at capture time)
 *   - WASM init failure
 *   - Sink delivery errors (already partially covered by `onSinkError`)
 *   - Consent gate rejected
 *   - Pattern compilation failure
 *   - EdgeSink batch delivery failure
 *   - IntersectionObserver errors
 *   - Rate-limit hit (error capture flooded)
 *
 * These emit as `tflo:diagnostic` events with a structured payload
 * so they can be derived into your analytics just like any other event.
 */
import type { EventRecord } from "./types.js";
/** Diagnostic event kind. */
export type DiagnosticKind = "selector_stale" | "wasm_init_failed" | "sink_delivery_failed" | "consent_rejected" | "pattern_compile_failed" | "edge_batch_failed" | "observer_failed" | "rate_limit_hit" | "click_target_missing" | "section_target_missing" | "validation_failed";
/** Structured diagnostic payload. */
export interface DiagnosticPayload {
    /** Which part of the plan/config this affects. */
    source: string;
    /** Human-readable description. */
    message: string;
    /** The raw error if available. */
    error?: string;
    /** Additional context. */
    context?: Record<string, unknown>;
}
/** Factory: produce a `tflo:diagnostic` EventRecord. */
export declare function diagnosticEvent(kind: DiagnosticKind, payload: DiagnosticPayload, now?: () => number): EventRecord;
/**
 * Wrap a handler so that diagnostic events on selector staleness are
 * automatically emitted. Call this for every DOM query that could
 * return zero results at runtime.
 */
export declare function checkSelectorHealth(selector: string, configKey: string, result: NodeListOf<Element> | Element[], onDiagnostic: (record: EventRecord) => void, now?: () => number): boolean;
/**
 * Health-check a click target at event time. If the delegated click
 * lands on an element with no matching data-tflow-id, emit a diagnostic
 * so you know the plan has a coverage gap.
 */
export declare function checkClickCoverage(clickedEl: Element, configuredIds: Set<string>, onDiagnostic: (record: EventRecord) => void, now?: () => number): void;
//# sourceMappingURL=diagnostics.d.ts.map