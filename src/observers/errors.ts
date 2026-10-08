/**
 * Global error capture — JS errors, promise rejections, resource load
 * failures. Emits normalized `EventRecord` objects for each tracked
 * error source. Rate-limited to avoid flooding.
 */

import { pathOnlyUrl, stripUrlQueries } from "../privacy.js";
import type { EventRecord } from "../types.js";
import type { ErrorTrack } from "../types.js";

export interface ErrorObserverOptions {
    cfg: ErrorTrack;
    /** Keep query strings and fragments in URLs (`page.captureFullUrls`). Default false. */
    fullUrls?: boolean;
    handler: (record: EventRecord) => void;
    now?: () => number;
}

/** Begin capturing global errors. Returns an unbind function. */
export function captureErrors(opts: ErrorObserverOptions): () => void {
    const now = opts.now ?? (() => performance.now());
    // URLs and URL-bearing text keep origin + path unless the plan opts in (privacy.ts).
    const url = (u: string): string => (opts.fullUrls ? u : pathOnlyUrl(u));
    const urls = (t: string): string => (opts.fullUrls ? t : stripUrlQueries(t));
    const maxEvents = opts.cfg.maxEvents ?? 50;
    let count = 0;

    const shouldIgnore = (message: string): boolean => {
        if (!opts.cfg.ignorePatterns) return false;
        return opts.cfg.ignorePatterns.some((p) => {
            try {
                return new RegExp(p).test(message);
            } catch {
                return message.includes(p);
            }
        });
    };

    const emit = (record: EventRecord) => {
        if (count >= maxEvents) return;
        count++;
        opts.handler(record);
    };

    const cleanups: Array<() => void> = [];

    // ── JS errors (window.onerror) ─────────────────────────────────
    if (opts.cfg.jsErrors !== false) {
        const prev = window.onerror;
        window.onerror = (message, source, lineno, colno, error) => {
            const msg = urls(typeof message === "string" ? message : String(message));
            if (shouldIgnore(msg)) return;
            emit({
                ts: now(),
                kind: "error",
                fields: {
                    source: "onerror",
                    message: msg,
                    filename: source ? url(source) : undefined,
                    lineno: lineno ?? undefined,
                    colno: colno ?? undefined,
                    stack: error instanceof Error && error.stack ? urls(error.stack) : undefined,
                },
                target: {
                    id: "window",
                    type: "source",
                    selector: source ? url(source) : undefined,
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
        const listener = (event: PromiseRejectionEvent) => {
            const reason = event.reason;
            const msg = urls(
                reason instanceof Error
                    ? reason.message
                    : typeof reason === "string"
                      ? reason
                      : JSON.stringify(reason).slice(0, 200),
            );
            if (shouldIgnore(msg)) return;
            emit({
                ts: now(),
                kind: "error",
                fields: {
                    source: "unhandledrejection",
                    reason: msg,
                    stack: reason instanceof Error && reason.stack ? urls(reason.stack) : undefined,
                },
                target: { id: "promise", type: "source" },
            });
        };
        window.addEventListener("unhandledrejection", listener);
        cleanups.push(() =>
            window.removeEventListener("unhandledrejection", listener),
        );
    }

    // ── Resource load errors ──────────────────────────────────────
    if (opts.cfg.resourceErrors !== false) {
        const listener = (event: Event) => {
            const target = event.target as Element | null;
            if (!target) return;
            if (!("tagName" in target)) return;
            const el = target as HTMLElement;
            const resource = url(
                (el as HTMLImageElement).src ||
                    (el as HTMLScriptElement).src ||
                    (el as HTMLLinkElement).href ||
                    "",
            );
            const msg = `Failed to load ${el.tagName.toLowerCase()}: ${resource}`;
            if (shouldIgnore(msg)) return;
            emit({
                ts: now(),
                kind: "error",
                fields: {
                    source: "resource",
                    resourceTag: target.tagName.toLowerCase(),
                    resourceUrl: resource,
                },
                target: {
                    id: "resource",
                    type: target.tagName.toLowerCase(),
                    selector: resource,
                },
            });
        };
        // Resource load errors bubble to window (capture phase).
        window.addEventListener("error", listener, true);
        cleanups.push(() =>
            window.removeEventListener("error", listener, true),
        );
    }

    return () => {
        for (const fn of cleanups) fn();
    };
}
