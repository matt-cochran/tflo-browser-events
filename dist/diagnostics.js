/**
 * Diagnostic layer — surfaces tflo operational events through the same
 * ingest→pattern→sink pipeline that user events flow through.
 *
 * Diagnostics include:
 *   - Selector staleness (zero elements matched at capture time)
 *   - WASM init failure
 *   - Sink delivery errors (already partially covered by `onSinkError`)
 *   - Consent gate rejected
 *   - Pattern compilation failure
 *   - EdgeSink batch delivery failure
 *   - IntersectionObserver errors
 *   - Rate-limit hit (error capture flooded)
 *
 * These emit as `tflo:diagnostic` events with a structured payload
 * so they can be derived into your analytics just like any other event.
 */
/** Factory: produce a `tflo:diagnostic` EventRecord. */
export function diagnosticEvent(kind, payload, now = () => performance.now()) {
    return {
        ts: now(),
        kind: "tflo:diagnostic",
        fields: {
            diagnosticKind: kind,
            ...payload,
        },
        target: { id: "tflo", type: "diagnostic" },
    };
}
/**
 * Wrap a handler so that diagnostic events on selector staleness are
 * automatically emitted. Call this for every DOM query that could
 * return zero results at runtime.
 */
export function checkSelectorHealth(selector, configKey, result, onDiagnostic, now) {
    if (result.length === 0) {
        onDiagnostic(diagnosticEvent("selector_stale", {
            source: configKey,
            message: `Selector "${selector}" matched zero elements at runtime`,
            context: { selector, configKey },
        }, now));
        return false;
    }
    return true;
}
/**
 * Health-check a click target at event time. If the delegated click
 * lands on an element with no matching data-tflow-id, emit a diagnostic
 * so you know the plan has a coverage gap.
 */
export function checkClickCoverage(clickedEl, configuredIds, onDiagnostic, now) {
    const tracked = closestTFlowElement(clickedEl);
    const clickedId = tracked?.getAttribute("data-tflow-id") ?? null;
    // Click landed on something with data-tflow-id but it's not configured
    if (clickedId && !configuredIds.has(clickedId)) {
        onDiagnostic(diagnosticEvent("click_target_missing", {
            source: `track.clicks`,
            message: `Clicked element has data-tflow-id="${clickedId}" which is not in the tracking plan — add it to track.clicks`,
            context: { dataTflowId: clickedId, tag: clickedEl.tagName.toLowerCase() },
        }, now));
    }
}
function closestTFlowElement(el) {
    let current = el;
    while (current) {
        if (current.hasAttribute("data-tflow-id"))
            return current;
        current = current.parentElement;
    }
    return null;
}
//# sourceMappingURL=diagnostics.js.map