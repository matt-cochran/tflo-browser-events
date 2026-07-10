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
export declare function captureVisibility(opts: VisibilityObserverOptions): () => void;
//# sourceMappingURL=visibility.d.ts.map