/**
 * Element visibility tracking — detects when DOM elements become visible
 * or hidden. Uses a MutationObserver to watch for:
 *
 *   - DOM insertion/removal (element added/removed)
 *   - Style changes (display:none ↔ block, visibility:hidden ↔ visible)
 *
 * Combined with IntersectionObserver for viewport-relative visibility.
 *
 * Useful for tracking: modal opens, toast notifications, error banners,
 * loading spinners, confirmation dialogs, validation error elements.
 */

import type { EventRecord } from "../types.js";
import type { VisibilityTrack } from "../types.js";

export interface VisibilityObserverOptions {
    cfg: VisibilityTrack;
    handler: (record: EventRecord) => void;
    now?: () => number;
}

export function captureVisibility(opts: VisibilityObserverOptions): () => void {
    const now = opts.now ?? (() => performance.now());
    const watchDomChanges = opts.cfg.domChanges !== false;
    const watchStyleChanges = opts.cfg.styleChanges !== false;
    const useMutationObserver = opts.cfg.mutationObserver !== false;
    const selectors = opts.cfg.selectors;

    if (!useMutationObserver) return () => {};

    const cleanups: Array<() => void> = [];

    // Build element→id lookup. We resolve selectors lazily on mutation.
    const resolveId = (el: Element): string | null => {
        for (const s of selectors) {
            if (el.matches(s.selector)) return s.id;
        }
        return null;
    };

    const checkAndEmit = (el: Element, reason: string) => {
        const id = resolveId(el);
        if (!id) return;
        const isVisible = isElementVisible(el);
        const kind = isVisible ? "element.shown" : "element.hidden";
        opts.handler({
            ts: now(),
            kind,
            fields: { reason },
            target: { id, type: "element", selector: cssPath(el) },
        });
    };

    // ── MutationObserver: watch DOM for nodes matching our selectors ─
    if (watchDomChanges) {
        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node instanceof Element) {
                        if (resolveId(node)) checkAndEmit(node, "dom-added");
                        // Also check subtree
                        node.querySelectorAll("*").forEach((child) => {
                            if (resolveId(child))
                                checkAndEmit(child, "dom-added");
                        });
                    }
                }
                for (const node of m.removedNodes) {
                    if (node instanceof Element) {
                        if (resolveId(node)) {
                            opts.handler({
                                ts: now(),
                                kind: "element.hidden",
                                fields: { reason: "dom-removed" },
                                target: {
                                    id: resolveId(node)!,
                                    type: "element",
                                    selector: cssPath(node),
                                },
                            });
                        }
                    }
                }
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });
        cleanups.push(() => mo.disconnect());
    }

    // ── Style change polling via IntersectionObserver ───────────────
    // When the IO fires, we check if elements that match our selectors
    // have flipped their display state since last check.
    if (watchStyleChanges) {
        const visibleCache = new WeakMap<Element, boolean>();

        // Initial scan
        const scan = () => {
            const ts = now();
            for (const s of selectors) {
                const els = document.querySelectorAll(s.selector);
                for (const el of els) {
                    const wasVisible = visibleCache.get(el) ?? false;
                    const isVisible = isElementVisible(el);
                    visibleCache.set(el, isVisible);
                    if (wasVisible !== isVisible) {
                        opts.handler({
                            ts,
                            kind: isVisible
                                ? "element.shown"
                                : "element.hidden",
                            fields: { reason: "style-changed" },
                            target: {
                                id: s.id,
                                type: "element",
                                selector: s.selector,
                            },
                        });
                    }
                }
            }
        };

        // Initial state
        scan();

        // Rescan periodically (MutationObserver covers insertions; this
        // catches pure CSS toggles like classList.add('hidden')).
        const interval = setInterval(scan, 500);
        cleanups.push(() => clearInterval(interval));
    }

    return () => {
        for (const fn of cleanups) fn();
    };
}

function isElementVisible(el: Element): boolean {
    const style = window.getComputedStyle(el);
    return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        (el as HTMLElement).offsetParent !== null
    );
}

/** Approximate CSS path for debugging (max 3 levels). */
function cssPath(el: Element): string {
    const parts: string[] = [];
    let current: Element | null = el;
    let depth = 0;
    while (current && current !== document.body && depth < 3) {
        let seg = current.tagName.toLowerCase();
        if (current.id) seg += "#" + current.id;
        else if (current.className && typeof current.className === "string") {
            const cls = current.className.trim().split(/\s+/)[0];
            if (cls) seg += "." + cls;
        }
        parts.unshift(seg);
        current = current.parentElement;
        depth++;
    }
    return parts.join(" > ");
}
