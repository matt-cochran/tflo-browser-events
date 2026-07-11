/**
 * `TFloBrowser` — the top-level SDK class.
 *
 * Wires three independent layers together:
 *
 * - **Capture**: the user binds events via `tflo.capture(...)`. Captured
 *   events flow into the runtimes.
 * - **Patterns**: the user attaches one or more compiled patterns via
 *   `addPattern(...)`. Each pattern owns its own `PatternRuntime`.
 * - **Sinks**: registered at construction or via `router.register(...)`.
 *
 * The three are decoupled. Tests can run any layer in isolation:
 * patterns + sinks without DOM (just call `ingest(...)`); capture
 * without patterns (just observe the recorded events); sinks alone.
 *
 * The class is browser-friendly but DOM-agnostic — it only touches the
 * DOM when the user calls `capture(...)`, and gracefully no-ops on
 * `visibilitychange` flush when `document` is absent.
 */
import { type CaptureOptions } from "./capture.js";
import { type Identity } from "./identity.js";
import { type CaptureViewportOptions } from "./observers/viewport.js";
import { CompiledPattern, PatternRuntime } from "./pattern.js";
import { SinkRouter } from "./sinks/index.js";
import type { DerivedSignal, EventRecord, Sink } from "./types.js";
export interface TFloBrowserOptions {
    /** Sinks to route emitted signals to. */
    sinks?: Sink[];
    /** Optional consent gate. When set and returning `false`, signals are
     * captured and matched but **not** routed to sinks. */
    consent?: () => boolean;
    /** Path to the WASM file. Defaults to relative to the JS bundle. Some
     * bundlers (Vite, Webpack 5) handle this automatically; for others,
     * pass an absolute URL or a `URL` object. */
    wasmUrl?: string | URL;
    /** Error sink — receives delivery errors from individual sinks. */
    onSinkError?: (sinkName: string, err: unknown) => void;
    /**
     * Identity stamping — when set, every emitted signal is stamped with
     * `app_id` / `environment` / `session_id` (and, if supplied,
     * `user_id_hash` / `tenant_id_hash`) before routing to sinks. Never
     * stamps raw PII — callers must pre-hash user/tenant identifiers.
     *
     * `sessionId` defaults to `stableSessionId()` — a `sessionStorage`-backed
     * id that stays stable across SPA route changes within the same tab.
     * Falls back to a fresh per-instance id when `sessionStorage` is
     * unavailable (SSR, workers, non-DOM tests).
     */
    identity?: Omit<Identity, "sessionId"> & {
        sessionId?: string;
    };
}
export declare class TFloBrowser {
    readonly router: SinkRouter;
    private readonly runtimes;
    private readonly unbinders;
    private readonly consent?;
    private readonly opts;
    private readonly stampIdentity?;
    private initialized;
    constructor(opts?: TFloBrowserOptions);
    /**
     * Initialize WASM. Must be awaited before pushing events.
     * Idempotent — calling it more than once returns the same promise.
     */
    init(): Promise<void>;
    /**
     * Attach a compiled pattern. The SDK creates a runtime for it.
     * Returns the runtime so the caller can `.reset()` or inspect it.
     */
    addPattern<E extends {
        ts: number;
    } = EventRecord>(compiled: CompiledPattern<E>): PatternRuntime<E>;
    /**
     * Remove an attached pattern by name. Frees its runtime.
     */
    removePattern(name: string): void;
    /**
     * Push an event through every attached pattern. Signals emitted are
     * routed to sinks (gated by `consent()`).
     *
     * Returns an array of all signals emitted by all patterns — useful
     * for tests; production callers typically ignore the return value
     * and rely on sink delivery.
     */
    ingest(event: EventRecord): DerivedSignal[];
    /**
     * Convenience: bind a capture and route its events into `ingest`.
     * Returns the unbind function so callers can selectively detach.
     */
    capture<E extends Event = Event>(opts: CaptureOptions<E>): () => void;
    /**
     * Convenience: bind a viewport tracker (IntersectionObserver) and
     * route its `viewport:enter` / `viewport:exit` / `viewport:dwell`
     * events into `ingest`. The dwell event is what most callers want for
     * "time on section" — it includes `durationMs` directly.
     */
    captureViewport(opts: CaptureViewportOptions): () => void;
    /**
     * End-of-stream / page-unload flush. Drains pending negative-step
     * matches across all runtimes and flushes batched sinks.
     */
    flush(): Promise<void>;
    /**
     * Detach all listeners, free all runtimes, clear sinks. Idempotent.
     */
    destroy(): void;
    private routeAll;
}
//# sourceMappingURL=browser.d.ts.map