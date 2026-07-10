/**
 * Event capture layer.
 *
 * Wraps `addEventListener` (and observer APIs in v0.2) with a stable
 * shape: every captured event becomes an `EventRecord` with a `ts`
 * (from `performance.now()`), a `kind`, and a `fields` payload. The
 * caller decides what to capture; the SDK never auto-instruments the
 * page.
 *
 * Built-in helpers:
 *
 * - `capture({ target, type, kind, fields })` — generic listener.
 * - Throttling — optional `throttleMs` collapses repeated events
 *   (scroll, pointermove, wheel) to one per window.
 * - `unbind` — every `capture` returns a function that removes the
 *   listener.
 *
 * Pointer/touch/wheel/scroll-specific helpers will land in v0.2.
 * For v0.1, callers wire their own listeners through the generic
 * `capture(...)` API.
 */
/**
 * Bind a capture. Returns an unbind function that removes the listener.
 *
 * The handler is invoked synchronously inside the DOM event handler
 * unless `throttleMs` is set, in which case it runs on a trailing
 * timer.
 */
export function capture(opts, handler) {
    const fields = opts.fields ?? (() => ({}));
    const kind = opts.kind ?? opts.type;
    const now = opts.now ?? (() => performance.now());
    const passiveByDefault = opts.type === "scroll" || opts.type === "wheel" || opts.type === "touchmove";
    const listenerOpts = {
        passive: passiveByDefault,
        ...(opts.listenerOptions ?? {}),
    };
    let pending = null;
    let throttleTimer = null;
    const flushPending = () => {
        if (pending) {
            handler(pending);
            pending = null;
        }
        throttleTimer = null;
    };
    const listener = (event) => {
        const record = {
            ts: now(),
            kind,
            fields: fields(event),
        };
        if (opts.throttleMs && opts.throttleMs > 0) {
            pending = record;
            if (throttleTimer === null) {
                throttleTimer = setTimeout(flushPending, opts.throttleMs);
            }
            return;
        }
        handler(record);
    };
    opts.target.addEventListener(opts.type, listener, listenerOpts);
    return () => {
        opts.target.removeEventListener(opts.type, listener, listenerOpts);
        if (throttleTimer !== null) {
            clearTimeout(throttleTimer);
            throttleTimer = null;
        }
        pending = null;
    };
}
//# sourceMappingURL=capture.js.map