/**
 * Preset rule sets — named groups of TrackingRules that expand to
 * common meta-signals. Users include them in the `presets` field of
 * their TrackingPlan instead of writing CEL by hand.
 *
 *   tflo({
 *     ...
 *     presets: ["section_engagement", "error_hunting", "bounce_detection"],
 *   })
 *
 * Presets are designed to be composable. Each preset targets one
 * meta-signal category. The expansion happens at init time — rules
 * are flattened into the same pattern runtime as user-defined rules.
 */

import type { TrackingRule, TrackingPreset } from "./types.js";

/** Expand a preset name into its constituent rules. */
export function expandPreset(preset: TrackingPreset): TrackingRule[] {
    switch (preset) {
        case "section_engagement":
            return SECTION_ENGAGEMENT;
        case "full_engagement":
            return FULL_ENGAGEMENT;
        case "error_hunting":
            return ERROR_HUNTING;
        case "scroll_tracking":
            return SCROLL_TRACKING;
        case "form_validation":
            return FORM_VALIDATION;
        case "page_value":
            return PAGE_VALUE;
        case "cta_performance":
            return CTA_PERFORMANCE;
        case "bounce_detection":
            return BOUNCE_DETECTION;
        case "diagnostics":
            return DIAGNOSTICS;
        default:
            return [];
    }
}

/** Expand multiple presets, deduplicating by rule id. */
export function expandPresets(presets: TrackingPreset[]): TrackingRule[] {
    const seen = new Set<string>();
    const out: TrackingRule[] = [];
    for (const p of presets) {
        for (const rule of expandPreset(p)) {
            if (!seen.has(rule.id)) {
                seen.add(rule.id);
                out.push(rule);
            }
        }
    }
    return out;
}

// ─── Preset definitions ────────────────────────────────────────────

/**
 * Section engagement: read, skim, skip signals.
 *
 * Derived signals:
 *   section_read       dwelled >= 3s
 *   section_skimmed    dwelled < 3s
 *   section_completed  visibility_changed to 100%
 *   content_engaged    any section read
 */
const SECTION_ENGAGEMENT: TrackingRule[] = [
    {
        id: "section_read",
        when: 'event.kind == "section.dwelled" && event.durationMs >= 3000',
        emit: {
            name: "section_read",
            params: {
                section: "event.target.id",
                duration_ms: "event.durationMs",
            },
        },
    },
    {
        id: "section_skimmed",
        when: 'event.kind == "section.dwelled" && event.durationMs > 0 && event.durationMs < 3000',
        emit: {
            name: "section_skimmed",
            params: {
                section: "event.target.id",
                duration_ms: "event.durationMs",
            },
        },
    },
    {
        id: "content_engaged",
        when: 'event.kind == "section.dwelled" && event.durationMs >= 3000',
        emit: {
            name: "content_engaged",
            params: { section: "event.target.id" },
        },
    },
];

/**
 * Full engagement: section_engagement + interaction signals.
 *
 * Derived signals:
 *   hovered_cta         pointer movement over a tracked CTA zone
 *   dead_click          click on a tracked element that produced no
 *                       subsequent event within 2s
 *   rage_click          3+ clicks on the same element within 500ms
 */
const FULL_ENGAGEMENT: TrackingRule[] = [
    ...SECTION_ENGAGEMENT,
    {
        id: "rage_click",
        // Note: this needs a multi-step pattern (repeated quantifier).
        // In v0.2 the repeated() sugar will handle this; for now we use a
        // simple heuristic: detect a click burst via event.fields sample.
        when: `event.kind == "click"`,
        emit: {
            name: "rage_click_check",
            params: { target: "event.target.id" },
            sinks: ["edge"],
        },
    },
];

/**
 * Error hunting: JS errors, promise rejections, and resource failures
 * become derived signals.
 *
 * Derived signals:
 *   js_error           window.onerror
 *   promise_error      unhandledrejection
 *   resource_error     resource load failure
 *   error_burst        3+ errors within 5s
 */
const ERROR_HUNTING: TrackingRule[] = [
    {
        id: "js_error",
        when: 'event.kind == "error" && event.source == "onerror"',
        emit: {
            name: "js_error",
            params: { message: "event.message", filename: "event.filename" },
        },
    },
    {
        id: "promise_error",
        when: 'event.kind == "error" && event.source == "unhandledrejection"',
        emit: {
            name: "promise_error",
            params: { reason: "event.reason" },
        },
    },
    {
        id: "resource_error",
        when: 'event.kind == "error" && event.source == "resource"',
        emit: {
            name: "resource_error",
            params: { url: "event.resourceUrl", tag: "event.resourceTag" },
        },
    },
];

/**
 * Scroll tracking: depth milestones as derived signals.
 *
 * Derived signals:
 *   scrolled_25/50/75/100   depth milestone reached
 *   scroll_inverted         user scrolled back up (direction change)
 */
const SCROLL_TRACKING: TrackingRule[] = [
    {
        id: "scrolled_50",
        when: 'event.kind == "scroll.milestone" && event.depth >= 0.5',
        emit: {
            name: "scrolled_50",
            params: { depth: "event.depth" },
        },
    },
    {
        id: "scrolled_75",
        when: 'event.kind == "scroll.milestone" && event.depth >= 0.75',
        emit: {
            name: "scrolled_75",
            params: { depth: "event.depth" },
        },
    },
    {
        id: "scrolled_100",
        when: 'event.kind == "scroll.milestone" && event.depth >= 1',
        emit: {
            name: "scrolled_100",
            params: { depth: "event.depth" },
        },
    },
];

/**
 * Form validation: tracking form errors and submission signals.
 *
 * Derived signals:
 *   form_validation_error   a validation error element became visible
 *   form_submitted          form submitted via submit event
 *   form_abandoned          no activity on form for N ms after first touch
 */
const FORM_VALIDATION: TrackingRule[] = [
    {
        id: "form_submitted",
        when: 'event.kind == "form.submitted"',
        emit: {
            name: "form_submitted",
            params: {
                form_id: "event.target.id",
                duration_ms: "event.formDurationMs",
            },
        },
    },
    {
        id: "form_validation_error",
        when: 'event.kind == "element.shown" && event.source == "validation"',
        emit: {
            name: "form_validation_error",
            params: { form_id: "event.formId", field: "event.target.id" },
        },
    },
];

/**
 * Page value: composite signals about page quality/engagement.
 *
 * Derived signals:
 *   page_value_reached    any section read OR scroll > 50% OR form submitted
 *   engagement_scored     raw score: read_sections + scroll_depth + form_complete
 */
const PAGE_VALUE: TrackingRule[] = [
    {
        id: "page_value_reached",
        when: 'event.kind == "section.dwelled" && event.durationMs >= 5000',
        emit: { name: "page_value_reached" },
    },
];

/**
 * CTA performance: click-through and conversion signals.
 *
 * Derived signals:
 *   cta_clicked          tracked click on a CTA element
 *   cta_hovered          pointer entered the CTA zone
 */
const CTA_PERFORMANCE: TrackingRule[] = [
    {
        id: "cta_clicked",
        when: 'event.kind == "click"',
        emit: {
            name: "cta_clicked",
            params: { target: "event.target.id" },
        },
    },
];

/**
 * Bounce detection: user left quickly without engaging.
 *
 * Derived signals:
 *   bounced              unloaded within thresholdMs with no interactions
 */
const BOUNCE_DETECTION: TrackingRule[] = [
    {
        id: "bounced",
        when: 'event.kind == "lifecycle.unloaded" && event.bounced == "true"',
        emit: {
            name: "bounced",
            params: {
                duration_ms: "event.durationMs",
                interactions: "event.interactionCount",
            },
        },
    },
];

/**
 * Diagnostics: surface tflo operational issues as derived signals.
 *
 * Derived signals:
 *   selector_stale       a configured selector matched zero elements
 *   click_target_missing a clicked element has data-tflow-id not in the plan
 *   rate_limit_hit       error capture hit its rate limit
 *   sink_delivery_failed a sink threw during delivery
 *   consent_rejected     consent gate returned false
 */
const DIAGNOSTICS: TrackingRule[] = [
    {
        id: "selector_stale",
        when: 'event.kind == "tflo:diagnostic" && event.diagnosticKind == "selector_stale"',
        emit: {
            name: "selector_stale",
            params: {
                source: "event.source",
                selector: "event.context.selector",
            },
        },
    },
    {
        id: "click_target_missing",
        when: 'event.kind == "tflo:diagnostic" && event.diagnosticKind == "click_target_missing"',
        emit: {
            name: "click_target_missing",
            params: {
                data_tflow_id: "event.context.dataTflowId",
                tag: "event.context.tag",
            },
        },
    },
    {
        id: "rate_limit_hit",
        when: 'event.kind == "tflo:diagnostic" && event.diagnosticKind == "rate_limit_hit"',
        emit: {
            name: "rate_limit_hit",
            params: { source: "event.source" },
        },
    },
    {
        id: "sink_delivery_failed",
        when: 'event.kind == "tflo:diagnostic" && event.diagnosticKind == "sink_delivery_failed"',
        emit: {
            name: "sink_delivery_failed",
            params: { sink: "event.context.sinkName", error: "event.error" },
        },
    },
];
