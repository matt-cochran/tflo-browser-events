/**
 * Scroll depth tracking — fires milestones at configurable depth thresholds
 * (25%, 50%, 75%, 100%) and optionally tracks direction changes.
 *
 * Uses a single throttled scroll listener. Each milestone fires once
 * per lifecycle (it won't re-fire on scroll-back-and-down unless
 * `directionChanges` is enabled, in which case it tracks inversion).
 */
import type { EventRecord } from "../types.js";
import type { ScrollTrack } from "../types.js";
export interface ScrollObserverOptions {
    cfg: ScrollTrack;
    handler: (record: EventRecord) => void;
    now?: () => number;
}
export declare function captureScroll(opts: ScrollObserverOptions): () => void;
//# sourceMappingURL=scroll.d.ts.map