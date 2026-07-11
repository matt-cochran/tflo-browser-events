/**
 * Sink router — dispatches derived signals to registered sinks based on
 * the signal's optional `sinks` hint, or to all registered sinks when
 * the hint is absent.
 *
 * The router is intentionally minimal. It is the seam where users plug
 * in their own destinations (one-off `Sink` implementations) without
 * touching the matching engine or the capture layer. The SDK ships
 * `ConsoleSink`, `EdgeSink`, and `GA4Sink` as ready-to-use options; GA4
 * is one option among many, not the default.
 */
import type { DerivedSignal, Sink } from "../types.js";
export { ConsoleSink } from "./console.js";
export { EdgeSink, type EdgeSinkOptions } from "./edge.js";
export { GA4Sink, type GA4SinkOptions } from "./ga4.js";
/**
 * A registry of sinks plus the dispatch logic.
 *
 * Construct with the sinks you want to route to. Send a signal with
 * `route(signal)` — the router decides who receives it based on the
 * `sinks` field, then awaits delivery for any async sinks.
 *
 * Failures are isolated per sink: a thrown error from one sink does
 * not stop delivery to the others. Errors are exposed via the optional
 * `onError` callback for downstream metrics/observability.
 */
export declare class SinkRouter {
    private readonly sinks;
    private readonly onError?;
    constructor(opts?: {
        sinks?: Sink[];
        onError?: (sink: string, err: unknown) => void;
    });
    /** Register a sink. Replacing an existing sink with the same name is
     * allowed — useful for hot-swapping endpoints. */
    register(sink: Sink): void;
    /** Remove a sink by name. */
    unregister(name: string): void;
    /** Total number of registered sinks. */
    get size(): number;
    /** Dispatch a signal. Returns a Promise that resolves when every
     * targeted sink has finished delivery (or thrown). Synchronous sinks
     * return immediately; the Promise still resolves on the next
     * microtask. */
    route(signal: DerivedSignal): Promise<void>;
    /** Flush all sinks that have a `flush` method. Errors are isolated
     * per sink. */
    flushAll(): Promise<void>;
    private resolveTargets;
}
//# sourceMappingURL=index.d.ts.map