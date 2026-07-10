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
import type { EventRecord } from "../types.js";
/** Section identifier function. Defaults to a stable fallback chain. */
type SectionIdFn = (el: Element) => string;
/**
 * The `IntersectionObserver` constructor signature, parameterized so
 * tests can inject a mock without faking the global.
 */
export type ObserverFactory = (callback: IntersectionObserverCallback, options?: IntersectionObserverInit) => IntersectionObserver;
export type ViewportEmitKind = "enter" | "exit" | "dwell";
export interface CaptureViewportOptions {
    /** What to observe. Either a list of elements, or a root + selector. */
    target: Document | Element | NodeListOf<Element> | Element[];
    /** When `target` is a Document/Element, selector for elements within
     * it. Ignored when `target` is already a list. */
    selector?: string;
    /** Per-element identifier. Defaults to data-section-id → id → tagName. */
    sectionIdFrom?: SectionIdFn;
    /** Which event kinds to emit. Defaults to all three. */
    emit?: ViewportEmitKind[];
    /** `IntersectionObserver.threshold`. Defaults to 0.5 (half visible). */
    threshold?: number | number[];
    /** `IntersectionObserver.rootMargin`. */
    rootMargin?: string;
    /** Time source — defaults to `performance.now()`. */
    now?: () => number;
    /** Mock `IntersectionObserver` constructor for tests. */
    observerImpl?: ObserverFactory;
}
export type ViewportHandler = (record: EventRecord) => void;
/**
 * Begin observing. Returns an unbind function that disconnects the
 * observer and emits a final `viewport:exit` + `viewport:dwell` for
 * every element still visible at the time of unbinding.
 *
 * The default sectionIdFrom inspects `data-section-id`, `id`, then
 * tagName. Override for custom identification.
 */
export declare function captureViewport(opts: CaptureViewportOptions, handler: ViewportHandler): () => void;
export {};
//# sourceMappingURL=viewport.d.ts.map