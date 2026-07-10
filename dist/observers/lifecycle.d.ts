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
export declare function captureLifecycle(opts: LifecycleObserverOptions): () => void;
//# sourceMappingURL=lifecycle.d.ts.map