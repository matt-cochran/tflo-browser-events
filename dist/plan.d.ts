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
import { TFloBrowser } from "./browser.js";
import type { TrackingPlan } from "./types.js";
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
export declare function init(plan: TrackingPlan): Promise<TFlowInitResult>;
//# sourceMappingURL=plan.d.ts.map