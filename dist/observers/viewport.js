/**
 * `captureViewport()` — IntersectionObserver-backed capture of "what
 * sections are visible to the user, and for how long."
 *
 * For each observed element, the helper emits up to three event kinds:
 *
 * - `viewport:enter` — element became visible. Fields: `sectionId`,
 *   `intersectionRatio`.
 * - `viewport:exit` — element stopped being visible. Fields: `sectionId`,
 *   `intersectionRatio`.
 * - `viewport:dwell` — fired *with* the `exit`, rolling up the time the
 *   element was visible. Fields: `sectionId`, `durationMs`, `entryTs`,
 *   `exitTs`.
 *
 * The dwell event is the "time on section" the user typically wants.
 * Enter/exit are also emitted so callers can build richer patterns
 * ("user entered section A then entered section B without leaving A
 * first"), or filter out below-threshold flickers in their own logic.
 *
 * Selector input modes:
 *
 * - `target: Document | Element` + `selector: string` — observe every
 *   element matching `selector` under `target`. The default
 *   `sectionIdFrom` reads `[data-section-id]` then falls back to
 *   `element.id` then to the tag name.
 * - `target: NodeListOf<Element> | Element[]` — observe the explicit
 *   list directly.
 *
 * The helper is browser-only (it touches `IntersectionObserver`). For
 * tests, pass `observerImpl` to inject a mock constructor.
 */
const defaultSectionIdFrom = (el) => {
    // Duck-typed access — `HTMLElement` isn't defined in non-DOM
    // environments, but the `dataset` shape is what we actually need.
    const dataset = el.dataset;
    if (dataset && typeof dataset["sectionId"] === "string") {
        return dataset["sectionId"];
    }
    if (el.id)
        return el.id;
    return el.tagName.toLowerCase();
};
/**
 * Begin observing. Returns an unbind function that disconnects the
 * observer and emits a final `viewport:exit` + `viewport:dwell` for
 * every element still visible at the time of unbinding.
 *
 * The default sectionIdFrom inspects `data-section-id`, `id`, then
 * tagName. Override for custom identification.
 */
export function captureViewport(opts, handler) {
    const emitKinds = new Set(opts.emit ?? ["enter", "exit", "dwell"]);
    const sectionIdFrom = opts.sectionIdFrom ?? defaultSectionIdFrom;
    const now = opts.now ?? (() => performance.now());
    const observerFactory = opts.observerImpl ??
        ((cb, options) => new IntersectionObserver(cb, options));
    const elements = resolveElements(opts.target, opts.selector);
    // Track active visibility windows per element: when did each element
    // last enter the viewport?
    const activeEntry = new Map();
    const observer = observerFactory((entries) => {
        for (const entry of entries) {
            const sectionId = sectionIdFrom(entry.target);
            const ts = now();
            const ratio = entry.intersectionRatio;
            if (entry.isIntersecting) {
                if (activeEntry.has(entry.target)) {
                    // Already in view (threshold-stepping); ignore.
                    continue;
                }
                activeEntry.set(entry.target, { ts, sectionId });
                if (emitKinds.has("enter")) {
                    handler({
                        ts,
                        kind: "viewport:enter",
                        fields: { sectionId, intersectionRatio: ratio },
                    });
                }
            }
            else {
                const entryRec = activeEntry.get(entry.target);
                if (!entryRec)
                    continue; // not previously marked entering
                activeEntry.delete(entry.target);
                if (emitKinds.has("exit")) {
                    handler({
                        ts,
                        kind: "viewport:exit",
                        fields: { sectionId, intersectionRatio: ratio },
                    });
                }
                if (emitKinds.has("dwell")) {
                    handler({
                        ts,
                        kind: "viewport:dwell",
                        fields: {
                            sectionId,
                            entryTs: entryRec.ts,
                            exitTs: ts,
                            durationMs: ts - entryRec.ts,
                        },
                    });
                }
            }
        }
    }, {
        threshold: opts.threshold ?? 0.5,
        rootMargin: opts.rootMargin,
    });
    for (const el of elements) {
        observer.observe(el);
    }
    return () => {
        observer.disconnect();
        // Final flush: any element still visible at unbind time gets its
        // exit + dwell. Without this, navigating away from a page swallows
        // the trailing dwell — exactly the case "time on section" cares
        // about most.
        if (!emitKinds.has("exit") && !emitKinds.has("dwell"))
            return;
        const flushTs = now();
        for (const [el, rec] of activeEntry) {
            const sectionId = sectionIdFrom(el);
            if (emitKinds.has("exit")) {
                handler({
                    ts: flushTs,
                    kind: "viewport:exit",
                    fields: { sectionId, intersectionRatio: 0 },
                });
            }
            if (emitKinds.has("dwell")) {
                handler({
                    ts: flushTs,
                    kind: "viewport:dwell",
                    fields: {
                        sectionId,
                        entryTs: rec.ts,
                        exitTs: flushTs,
                        durationMs: flushTs - rec.ts,
                    },
                });
            }
        }
        activeEntry.clear();
    };
}
function resolveElements(target, selector) {
    // Element list shape
    if (Array.isArray(target))
        return target;
    if ("length" in target && typeof target.item === "function") {
        return Array.from(target);
    }
    // Document or single Element root
    const root = target;
    if (!selector) {
        return root instanceof Element ? [root] : [];
    }
    return Array.from(root.querySelectorAll(selector));
}
//# sourceMappingURL=viewport.js.map