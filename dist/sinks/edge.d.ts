/**
 * `EdgeSink` — POSTs derived signals to a first-party HTTP endpoint.
 *
 * The recommended deployment pattern for analytics: derive signals in
 * the browser, ship them to *your* edge collector, and let that edge
 * collector fan out to ClickHouse, GA4 Measurement Protocol, vendor
 * APIs, etc. Keeps shared secrets server-side.
 *
 * Batches by default — signals are buffered and flushed either when
 * the buffer hits `batchSize` or after `batchIntervalMs` has elapsed
 * since the last flush. Use `flush()` to force delivery (the SDK
 * calls this on shutdown / visibility transitions).
 *
 * On page unload, uses `navigator.sendBeacon` when available (more
 * reliable than `fetch` mid-tear-down), falling back to
 * `fetch(..., { keepalive: true })`.
 */
import type { DerivedSignal, Sink } from "../types.js";
export interface EdgeSinkOptions {
    /** Sink identifier — defaults to `"edge"`. */
    name?: string;
    /** HTTP endpoint that accepts a JSON-encoded `{ batch: DerivedSignal[] }`
     * payload. */
    endpoint: string;
    /** Max signals to buffer before forcing a flush. Defaults to 20. */
    batchSize?: number;
    /** Max time (ms) to wait before flushing a non-empty buffer. Defaults to 1000. */
    batchIntervalMs?: number;
    /** Custom headers to add to each POST. */
    headers?: Record<string, string>;
    /** Override the fetch implementation — useful for tests. Defaults
     * to `globalThis.fetch`. */
    fetchImpl?: typeof fetch;
    /** Override `sendBeacon` resolution — useful for tests. */
    sendBeacon?: (url: string, body: BodyInit) => boolean;
}
export declare class EdgeSink implements Sink {
    readonly name: string;
    private buffer;
    private timer;
    private readonly endpoint;
    private readonly batchSize;
    private readonly batchIntervalMs;
    private readonly headers;
    private readonly fetchImpl;
    private readonly sendBeacon?;
    constructor(opts: EdgeSinkOptions);
    send(signal: DerivedSignal): void;
    flush(opts?: {
        unloading?: boolean;
    }): Promise<void>;
    private scheduleFlush;
    private resolveSendBeacon;
}
//# sourceMappingURL=edge.d.ts.map