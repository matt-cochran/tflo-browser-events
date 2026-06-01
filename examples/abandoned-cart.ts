/**
 * Example: detect cart abandonment from browser events, route the
 * derived signal to an edge collector + GA4 (no console).
 *
 * Run locally:
 *   npm install
 *   npm run build
 *   # then load this from a page that imports `dist/index.js`
 */

import {
  TFloBrowser,
  Pattern,
  EdgeSink,
  GA4Sink,
  type EventRecord,
} from "../src/index.js";

const tflo = new TFloBrowser({
  sinks: [
    new EdgeSink({ name: "edge", endpoint: "/collect/signals", batchSize: 10 }),
    new GA4Sink({ name: "ga4" }),
  ],
  consent: () => localStorage.getItem("analytics_consent") === "yes",
  onSinkError: (sink, err) => console.warn(`[tflo] ${sink} delivery failed:`, err),
});

await tflo.init();

const abandonedCart = new Pattern<EventRecord>("abandoned_cart")
  .timestamp((e) => e.ts)
  .when((e) => e.kind === "add_to_cart")
  .notThen((e) => e.kind === "purchase")
  .within(5 * 60 * 1000)
  .emit((m) => ({
    name: "abandoned_cart",
    payload: {
      cartId: m.first().fields.cartId,
      sessionId: m.first().fields.sessionId,
    },
    sinks: ["edge", "ga4"],
  }));

tflo.addPattern(abandonedCart);

// Capture: any click on an element with [data-analytics-action]
// becomes an EventRecord with that action as the `kind`.
tflo.capture<MouseEvent>({
  target: document,
  type: "click",
  fields: (e) => {
    const t = e.target as HTMLElement | null;
    const action = t?.closest("[data-analytics-action]") as HTMLElement | null;
    if (!action) return {};
    return {
      cartId: action.dataset.cartId ?? null,
      sessionId: sessionStorage.getItem("session_id"),
      _action: action.dataset.analyticsAction,
    };
  },
});

// Flush on page hide (sendBeacon) so end-of-session signals ship reliably.
window.addEventListener("pagehide", () => {
  void tflo.flush();
});
