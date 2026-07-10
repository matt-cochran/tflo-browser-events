/**
 * Global error capture — JS errors, promise rejections, resource load
 * failures. Emits normalized `EventRecord` objects for each tracked
 * error source. Rate-limited to avoid flooding.
 */
import type { EventRecord } from "../types.js";
import type { ErrorTrack } from "../types.js";
export interface ErrorObserverOptions {
    cfg: ErrorTrack;
    handler: (record: EventRecord) => void;
    now?: () => number;
}
/** Begin capturing global errors. Returns an unbind function. */
export declare function captureErrors(opts: ErrorObserverOptions): () => void;
//# sourceMappingURL=errors.d.ts.map