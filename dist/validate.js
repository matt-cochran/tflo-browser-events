/**
 * DOM validator — checks that a TrackingPlan's selectors match real
 * elements and that the CEL rules compile.
 *
 * Designed for LLM codegen feedback loops:
 *
 *   1. LLM generates a TrackingPlan
 *   2. `validatePlan(plan)` runs in the browser
 *   3. LLM reads the report, fixes issues, resubmits
 *
 * Also useful for dev-mode warnings: call `tflo({ ... validate: true })`
 * to run validation at init time.
 */
/**
 * Validate a tracking plan against the live DOM.
 *
 * Returns a structured report suitable for:
 * - Displaying in a dev toolbar
 * - Feeding back to an LLM as a correction prompt
 * - Blocking init in strict mode
 */
export function validatePlan(plan, opts = {}) {
    const root = opts.root ?? document;
    const issues = [];
    // ── Sections ─────────────────────────────────────────────────
    if (plan.track.sections) {
        validateSections(root, plan.track.sections, issues);
    }
    // ── Clicks ───────────────────────────────────────────────────
    if (plan.track.clicks) {
        validateClicks(root, plan.track.clicks, issues);
    }
    // ── Visibility selectors ─────────────────────────────────────
    if (plan.track.visibility) {
        validateVisibilitySelectors(root, plan.track.visibility.selectors, issues);
    }
    // ── Forms ────────────────────────────────────────────────────
    if (plan.track.forms) {
        validateForms(root, plan.track.forms, issues);
    }
    // ── CEL ──────────────────────────────────────────────────────
    if (opts.validateCel !== false) {
        validateRules(plan.rules ?? [], issues);
        // Presets are expanded internally so we don't validate their
        // individual CEL — presets are pre-tested.
    }
    // ── Presets ──────────────────────────────────────────────────
    if (plan.presets) {
        validatePresets(plan.presets, issues);
    }
    // ── Page info ────────────────────────────────────────────────
    if (!plan.page || !plan.page.id) {
        issues.push({
            level: "error",
            path: "page.id",
            message: "page.id is required",
            suggestion: "Set page.id to a stable identifier like 'product-detail' or 'checkout'",
        });
    }
    // ── Build report ─────────────────────────────────────────────
    const errors = issues.filter((i) => i.level === "error").length;
    const warnings = issues.filter((i) => i.level === "warning").length;
    const infos = issues.filter((i) => i.level === "info").length;
    return {
        valid: errors === 0,
        issues,
        summary: { errors, warnings, infos },
    };
}
// ─── Section validation ───────────────────────────────────────────
function validateSections(root, sections, issues) {
    for (const section of sections) {
        const els = root.querySelectorAll(section.selector);
        const prefix = `track.sections["${section.id}"]`;
        if (els.length === 0) {
            issues.push({
                level: "error",
                path: prefix,
                message: `Selector "${section.selector}" matched zero elements`,
                suggestion: `Add a section element like <section id="${section.id}"> or update the selector`,
            });
        }
        else if (els.length > 1) {
            issues.push({
                level: "info",
                path: prefix,
                message: `Selector "${section.selector}" matched ${els.length} elements — using all of them`,
                suggestion: els.length > 5
                    ? `Consider a more specific selector to avoid tracking ${els.length} elements`
                    : undefined,
            });
        }
    }
}
// ─── Click validation ─────────────────────────────────────────────
function validateClicks(root, clicks, issues) {
    for (const click of clicks) {
        const prefix = `track.clicks["${click.id}"]`;
        // Primary method: data-tflow-id attribute
        const byId = root.querySelectorAll(`[data-tflow-id="${click.id}"]`);
        // Fallback: CSS selector
        let bySelector;
        if (click.selector) {
            bySelector = root.querySelectorAll(click.selector);
        }
        if (byId.length === 0 && (!bySelector || bySelector.length === 0)) {
            const suggestion = click.selector
                ? `Add data-tflow-id="${click.id}" to the target element, or fix selector "${click.selector}"`
                : `Add <button data-tflow-id="${click.id}"> to the target element`;
            issues.push({
                level: "error",
                path: prefix,
                message: `No element found with [data-tflow-id="${click.id}"]`,
                suggestion,
            });
        }
        else if (byId.length > 1) {
            issues.push({
                level: "warning",
                path: prefix,
                message: `${byId.length} elements have data-tflow-id="${click.id}" — tracked clicks will fire for all of them`,
                suggestion: "Use unique data-tflow-id values per trackable element",
            });
        }
        else if (byId.length === 1 && bySelector && bySelector.length > 0) {
            // Gracefully note that both match — selector might be stale
            if (!bySelector[0]?.isSameNode(byId[0])) {
                issues.push({
                    level: "info",
                    path: prefix,
                    message: `Selector "${click.selector}" matches a different element than [data-tflow-id="${click.id}"]`,
                    suggestion: "Remove the selector — data-tflow-id is the durable contract",
                });
            }
        }
    }
}
// ─── Visibility validation ────────────────────────────────────────
function validateVisibilitySelectors(root, selectors, issues) {
    for (const vs of selectors) {
        const prefix = `track.visibility["${vs.id}"]`;
        const els = root.querySelectorAll(vs.selector);
        if (els.length === 0) {
            issues.push({
                level: "warning",
                path: prefix,
                message: `Visibility target "${vs.selector}" matched zero elements at init time (may appear later via JS)`,
                suggestion: `Ensure the element exists or add [data-track-visibility="${vs.id}"]`,
            });
        }
    }
}
// ─── Form validation ──────────────────────────────────────────────
function validateForms(root, forms, issues) {
    for (const form of forms) {
        const prefix = `track.forms["${form.id}"]`;
        const els = root.querySelectorAll(form.selector);
        if (els.length === 0) {
            issues.push({
                level: "error",
                path: prefix,
                message: `Form selector "${form.selector}" matched zero elements`,
                suggestion: `Add <form id="${form.id}" data-track-form> to your markup`,
            });
        }
        // Check that matched elements are actually <form> tags
        let formTagCount = 0;
        for (const el of els) {
            if (el.tagName === "FORM")
                formTagCount++;
        }
        if (els.length > 0 && formTagCount !== els.length) {
            issues.push({
                level: "warning",
                path: prefix,
                message: `Selector "${form.selector}" matched ${els.length - formTagCount} non-<form> elements`,
                suggestion: "Form tracking works best on actual <form> elements",
            });
        }
    }
}
// ─── CEL rule validation ──────────────────────────────────────────
function validateRules(rules, issues) {
    for (const rule of rules) {
        const prefix = `rules["${rule.id}"]`;
        if (!rule.id) {
            issues.push({
                level: "error",
                path: "rules[?].id",
                message: "A rule is missing its id field",
            });
            return;
        }
        if (typeof rule.when === "string") {
            try {
                celToPredicate(rule.when);
            }
            catch (e) {
                issues.push({
                    level: "error",
                    path: `${prefix}.when`,
                    message: `CEL expression failed to compile: ${e.message}`,
                    suggestion: 'Try simplifying the expression. Supported: event.kind == "val", event.field >= num, && for compound',
                });
            }
        }
        // Validate emit.params paths look reasonable
        if (rule.emit.params) {
            for (const [key, path] of Object.entries(rule.emit.params)) {
                if (typeof path !== "string" || !path.startsWith("event.")) {
                    issues.push({
                        level: "warning",
                        path: `${prefix}.emit.params.${key}`,
                        message: `Param "${key}" path "${path}" should start with "event."`,
                    });
                }
            }
        }
    }
}
// ─── Preset validation ────────────────────────────────────────────
function validatePresets(presets, issues) {
    const validPresets = new Set([
        "section_engagement",
        "full_engagement",
        "error_hunting",
        "scroll_tracking",
        "form_validation",
        "page_value",
        "cta_performance",
        "bounce_detection",
    ]);
    for (const preset of presets) {
        if (!validPresets.has(preset)) {
            issues.push({
                level: "error",
                path: `presets["${preset}"]`,
                message: `Unknown preset "${preset}"`,
                suggestion: `Valid presets: ${[...validPresets].join(", ")}`,
            });
        }
    }
}
// ─── Reused CEL compiler (light copy from plan.ts for validation) ──
function celToPredicate(expr) {
    const parts = expr.split(/\s*&&\s*/);
    const checks = parts.map((part) => compileSimpleCondition(part.trim()));
    return (event) => checks.every((fn) => fn(event));
}
function compileSimpleCondition(cond) {
    const eqMatch = cond.match(/^event\.(\w+)\s*==\s*"(.+)"$/);
    if (eqMatch) {
        const field = eqMatch[1];
        const val = eqMatch[2];
        return (e) => resolveField(e, field) === val;
    }
    const geMatch = cond.match(/^event\.(\w+)\s*>=\s*([\d.]+)$/);
    if (geMatch) {
        const field = geMatch[1];
        const val = Number(geMatch[2]);
        return (e) => typeof resolveField(e, field) === "number" &&
            resolveField(e, field) >= val;
    }
    const gtMatch = cond.match(/^event\.(\w+)\s*>\s*([\d.]+)$/);
    if (gtMatch) {
        const field = gtMatch[1];
        const val = Number(gtMatch[2]);
        return (e) => typeof resolveField(e, field) === "number" &&
            resolveField(e, field) > val;
    }
    const leMatch = cond.match(/^event\.(\w+)\s*<=\s*([\d.]+)$/);
    if (leMatch) {
        const field = leMatch[1];
        const val = Number(leMatch[2]);
        return (e) => typeof resolveField(e, field) === "number" &&
            resolveField(e, field) <= val;
    }
    const ltMatch = cond.match(/^event\.(\w+)\s*<\s*([\d.]+)$/);
    if (ltMatch) {
        const field = ltMatch[1];
        const val = Number(ltMatch[2]);
        return (e) => typeof resolveField(e, field) === "number" &&
            resolveField(e, field) < val;
    }
    throw new Error(`Cannot compile CEL expression: "${cond}"`);
}
function resolveField(event, name) {
    if (name === "kind")
        return event["kind"];
    if (name === "ts")
        return event["ts"];
    if (name.startsWith("target.")) {
        const sub = name.slice(7);
        const target = event["target"];
        return target?.[sub];
    }
    if (name.startsWith("page.")) {
        const sub = name.slice(5);
        const page = event["page"];
        return page?.[sub];
    }
    return event[name];
}
//# sourceMappingURL=validate.js.map