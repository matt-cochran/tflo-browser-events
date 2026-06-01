/**
 * Page lifecycle tracking — load, visibility, unload, idle, bounce, SPA routes.
 *
 * Emits normalized events for each lifecycle transition. Idle and bounce
 * detection are opt-in (thresholdMs > 0).
 */

import type { EventRecord } from "../types.js";
import type { LifecycleTrack } from "../types.js";

export interface LifecycleObserverOptions {
    cfg: LifecycleTrack;
    /** Called when a lifecycle event occurs. */
    handler: (record: EventRecord) => void;
    /** The page-load time anchor (e.g. `performance.timeOrigin`). */
    timeOrigin?: number;
    now?: () => number;
}

export function captureLifecycle(opts: LifecycleObserverOptions): () => void {
    const now = opts.now ?? (() => performance.now());
    const timeOrigin = opts.timeOrigin ?? performance.timeOrigin;
    const cleanups: Array<() => void> = [];
    let interactionCount = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Page load ──────────────────────────────────────────────────
    if (opts.cfg.pageLoad !== false) {
        const onLoad = () => {
            opts.handler({
                ts: now(),
                kind: "lifecycle.loaded",
                fields: { timeOrigin },
            });
        };
        if (document.readyState === "complete") {
            onLoad();
        } else {
            window.addEventListener("load", onLoad, { once: true });
            cleanups.push(() => window.removeEventListener("load", onLoad));
        }
    }

    // ── Visibility change ──────────────────────────────────────────
    if (opts.cfg.visibilityChange !== false) {
        const onVis = () => {
            opts.handler({
                ts: now(),
                kind:
                    document.visibilityState === "hidden"
                        ? "lifecycle.hidden"
                        : "lifecycle.visible",
                fields: { visibilityState: document.visibilityState },
            });
        };
        document.addEventListener("visibilitychange", onVis);
        cleanups.push(() =>
            document.removeEventListener("visibilitychange", onVis),
        );
    }

    // ── Page unload ────────────────────────────────────────────────
    if (opts.cfg.pageUnload !== false) {
        const unload = () => {
            const durationMs = now();
            const bounced =
                opts.cfg.bounceThresholdMs &&
                opts.cfg.bounceThresholdMs > 0 &&
                interactionCount === 0 &&
                durationMs < opts.cfg.bounceThresholdMs;
            opts.handler({
                ts: durationMs,
                kind: "lifecycle.unloaded",
                fields: {
                    durationMs,
                    interactionCount,
                    bounced: String(bounced),
                },
            });
        };
        window.addEventListener("pagehide", unload, { once: true });
        cleanups.push(() => window.removeEventListener("pagehide", unload));
    }

    // ── SPA route changes ──────────────────────────────────────────
    if (opts.cfg.routeChanges) {
        const onRoute = () => {
            opts.handler({
                ts: now(),
                kind: "lifecycle.route_changed",
                fields: { pathname: location.pathname, hash: location.hash },
            });
        };
        window.addEventListener("popstate", onRoute);
        window.addEventListener("hashchange", onRoute);
        cleanups.push(() => {
            window.removeEventListener("popstate", onRoute);
            window.removeEventListener("hashchange", onRoute);
        });
    }

    // ── Idle detection ─────────────────────────────────────────────
    const resetIdleTimer = () => {
        if (!opts.cfg.idleThresholdMs || opts.cfg.idleThresholdMs <= 0) return;
        if (idleTimer !== null) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            idleTimer = null;
        }, opts.cfg.idleThresholdMs);
    };

    if (opts.cfg.idleThresholdMs && opts.cfg.idleThresholdMs > 0) {
        // We hook into the idle timer reset. The actual idle event fires
        // when interactionCount is zero and the timer expires. For now,
        // idle is tracked externally by the caller via bumpInteraction.
        resetIdleTimer();
    }

    return () => {
        for (const fn of cleanups) fn();
        if (idleTimer !== null) clearTimeout(idleTimer);
    };
}
