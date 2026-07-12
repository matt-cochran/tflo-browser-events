/**
 * Global error capture — JS errors, promise rejections, resource load
 * failures. Emits normalized `EventRecord` objects for each tracked
 * error source. Rate-limited to avoid flooding.
 */
/** Begin capturing global errors. Returns an unbind function. */
export function captureErrors(opts) {
    const now = opts.now ?? (() => performance.now());
    const maxEvents = opts.cfg.maxEvents ?? 50;
    let count = 0;
    const shouldIgnore = (message) => {
        if (!opts.cfg.ignorePatterns)
            return false;
        return opts.cfg.ignorePatterns.some((p) => {
            try {
                return new RegExp(p).test(message);
            }
            catch {
                return message.includes(p);
            }
        });
    };
    const emit = (record) => {
        if (count >= maxEvents)
            return;
        count++;
        opts.handler(record);
    };
    const cleanups = [];
    // ── JS errors (window.onerror) ─────────────────────────────────
    if (opts.cfg.jsErrors !== false) {
        const prev = window.onerror;
        window.onerror = (message, source, lineno, colno, error) => {
            const msg = typeof message === "string" ? message : String(message);
            if (shouldIgnore(msg))
                return;
            emit({
                ts: now(),
                kind: "error",
                fields: {
                    source: "onerror",
                    message: msg,
                    filename: source ?? undefined,
                    lineno: lineno ?? undefined,
                    colno: colno ?? undefined,
                    stack: error instanceof Error ? error.stack : undefined,
                },
                target: {
                    id: "window",
                    type: "source",
                    selector: source ?? undefined,
                },
            });
            if (typeof prev === "function") {
                prev.call(window, message, source, lineno, colno, error);
            }
        };
        cleanups.push(() => {
            window.onerror = prev;
        });
    }
    // ── Unhandled promise rejections ──────────────────────────────
    if (opts.cfg.promiseRejections !== false) {
        const listener = (event) => {
            const reason = event.reason;
            const msg = reason instanceof Error
                ? reason.message
                : typeof reason === "string"
                    ? reason
                    : JSON.stringify(reason).slice(0, 200);
            if (shouldIgnore(msg))
                return;
            emit({
                ts: now(),
                kind: "error",
                fields: {
                    source: "unhandledrejection",
                    reason: msg,
                    stack: reason instanceof Error ? reason.stack : undefined,
                },
                target: { id: "promise", type: "source" },
            });
        };
        window.addEventListener("unhandledrejection", listener);
        cleanups.push(() => window.removeEventListener("unhandledrejection", listener));
    }
    // ── Resource load errors ──────────────────────────────────────
    if (opts.cfg.resourceErrors !== false) {
        const listener = (event) => {
            const target = event.target;
            if (!target)
                return;
            if (!("tagName" in target))
                return;
            const el = target;
            const url = el.src ||
                el.src ||
                el.href ||
                "";
            const msg = `Failed to load ${el.tagName.toLowerCase()}: ${url}`;
            if (shouldIgnore(msg))
                return;
            emit({
                ts: now(),
                kind: "error",
                fields: {
                    source: "resource",
                    resourceTag: target.tagName.toLowerCase(),
                    resourceUrl: url,
                },
                target: {
                    id: "resource",
                    type: target.tagName.toLowerCase(),
                    selector: url,
                },
            });
        };
        // Resource load errors bubble to window (capture phase).
        window.addEventListener("error", listener, true);
        cleanups.push(() => window.removeEventListener("error", listener, true));
    }
    return () => {
        for (const fn of cleanups)
            fn();
    };
}
//# sourceMappingURL=errors.js.map