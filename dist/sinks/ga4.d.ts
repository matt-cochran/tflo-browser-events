/**
 * `GA4Sink` — forwards derived signals to Google Analytics 4 via the
 * page's `gtag.js` snippet. One option among many: the SDK doesn't
 * require GA4 and the matching engine has no GA-specific knowledge.
 *
 * Configuration is minimal because gtag.js owns the heavy lifting on
 * the page. Set the optional `sendTo` to scope the event to a specific
 * stream id (`"G-XXXXXXX"`); omit it to use whatever streams the page
 * has configured.
 *
 * Out of scope: the Measurement Protocol path. Its API secret must not
 * appear in browser code — route signals through an `EdgeSink` to your
 * own collector and have *that* fan out to Measurement Protocol.
 */
import type { DerivedSignal, Sink } from "../types.js";
export interface GA4SinkOptions {
    /** Sink identifier — defaults to `"ga4"`. */
    name?: string;
    /** Optional stream id (e.g. `"G-XXXXXXX"`) to scope the gtag event. */
    sendTo?: string;
    /** Override the `gtag` resolution — useful for tests. */
    gtag?: (command: "event", name: string, params: Record<string, unknown>) => void;
}
export declare class GA4Sink implements Sink {
    readonly name: string;
    private readonly sendTo?;
    private readonly gtagImpl?;
    constructor(opts?: GA4SinkOptions);
    send(signal: DerivedSignal): void;
    private resolveGtag;
}
//# sourceMappingURL=ga4.d.ts.map