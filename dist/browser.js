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
import { capture as bindCapture } from "./capture.js";
import init from "./wasm/tflo_cep_wasm.js";
import { stableSessionId, withIdentity } from "./identity.js";
import { captureViewport as bindCaptureViewport, } from "./observers/viewport.js";
import { PatternRuntime } from "./pattern.js";
import { SinkRouter } from "./sinks/index.js";
/** Best-effort session id: uses the durable `sessionStorage`-backed id
 * when available, otherwise mints a one-off id for this instance. */
function resolveSessionId(explicit) {
    if (explicit)
        return explicit;
    if (typeof sessionStorage !== "undefined")
        return stableSessionId();
    return crypto.randomUUID();
}
/**
 * The default page-context hooks. When `document` is absent (Node tests,
 * non-DOM workers), these gracefully no-op.
 */
function bindVisibilityChange(onHidden) {
    if (typeof document === "undefined")
        return () => { };
    const handler = () => {
        if (document.visibilityState === "hidden")
            onHidden();
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
}
export class TFloBrowser {
    router;
    runtimes = new Map();
    unbinders = [];
    consent;
    opts;
    stampIdentity;
    initialized = null;
    constructor(opts = {}) {
        this.opts = opts;
        this.consent = opts.consent;
        if (opts.identity) {
            const sessionId = resolveSessionId(opts.identity.sessionId);
            this.stampIdentity = withIdentity({ ...opts.identity, sessionId });
        }
        this.router = new SinkRouter({
            sinks: opts.sinks,
            onError: opts.onSinkError,
        });
        this.unbinders.push(bindVisibilityChange(() => {
            void this.router.flushAll();
        }));
    }
    /**
     * Initialize WASM. Must be awaited before pushing events.
     * Idempotent — calling it more than once returns the same promise.
     */
    async init() {
        if (!this.initialized) {
            const wasmUrl = this.opts.wasmUrl;
            this.initialized = wasmUrl ? init({ module_or_path: wasmUrl }).then(() => { }) : init().then(() => { });
        }
        await this.initialized;
    }
    /**
     * Attach a compiled pattern. The SDK creates a runtime for it.
     * Returns the runtime so the caller can `.reset()` or inspect it.
     */
    addPattern(compiled) {
        const runtime = new PatternRuntime(compiled);
        this.runtimes.set(compiled.name, runtime);
        return runtime;
    }
    /**
     * Remove an attached pattern by name. Frees its runtime.
     */
    removePattern(name) {
        const r = this.runtimes.get(name);
        if (!r)
            return;
        r.destroy();
        this.runtimes.delete(name);
    }
    /**
     * Push an event through every attached pattern. Signals emitted are
     * routed to sinks (gated by `consent()`).
     *
     * Returns an array of all signals emitted by all patterns — useful
     * for tests; production callers typically ignore the return value
     * and rely on sink delivery.
     */
    ingest(event) {
        const emitted = [];
        for (const runtime of this.runtimes.values()) {
            for (const signal of runtime.push(event))
                emitted.push(signal);
        }
        this.routeAll(emitted);
        return emitted;
    }
    /**
     * Convenience: bind a capture and route its events into `ingest`.
     * Returns the unbind function so callers can selectively detach.
     */
    capture(opts) {
        const handler = (record) => {
            this.ingest(record);
        };
        const unbind = bindCapture(opts, handler);
        this.unbinders.push(unbind);
        return unbind;
    }
    /**
     * Convenience: bind a viewport tracker (IntersectionObserver) and
     * route its `viewport:enter` / `viewport:exit` / `viewport:dwell`
     * events into `ingest`. The dwell event is what most callers want for
     * "time on section" — it includes `durationMs` directly.
     */
    captureViewport(opts) {
        const unbind = bindCaptureViewport(opts, (record) => {
            this.ingest(record);
        });
        this.unbinders.push(unbind);
        return unbind;
    }
    /**
     * End-of-stream / page-unload flush. Drains pending negative-step
     * matches across all runtimes and flushes batched sinks.
     */
    async flush() {
        const drained = [];
        for (const runtime of this.runtimes.values()) {
            for (const signal of runtime.flush())
                drained.push(signal);
        }
        this.routeAll(drained);
        await this.router.flushAll();
    }
    /**
     * Detach all listeners, free all runtimes, clear sinks. Idempotent.
     */
    destroy() {
        for (const unbind of this.unbinders)
            unbind();
        this.unbinders.length = 0;
        for (const runtime of this.runtimes.values())
            runtime.destroy();
        this.runtimes.clear();
    }
    routeAll(signals) {
        if (signals.length === 0)
            return;
        if (this.consent && !this.consent())
            return;
        for (const signal of signals) {
            void this.router.route(this.stampIdentity ? this.stampIdentity(signal) : signal);
        }
    }
}
//# sourceMappingURL=browser.js.map