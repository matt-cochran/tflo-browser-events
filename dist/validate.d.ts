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
import type { TrackingPlan } from "./types.js";
/** A single validation issue. */
export interface ValidationIssue {
    /** Severity level. */
    level: "error" | "warning" | "info";
    /** Which part of the plan this affects. */
    path: string;
    /** Human-readable description. */
    message: string;
    /** Suggested fix (when we can infer one). */
    suggestion?: string;
}
/** Result of validating a plan against the DOM. */
export interface ValidationReport {
    /** Overall pass/fail. `false` if any error-level issues exist. */
    valid: boolean;
    /** All issues found. */
    issues: ValidationIssue[];
    /** Summary counts. */
    summary: {
        errors: number;
        warnings: number;
        infos: number;
    };
}
/** Options for validation. */
export interface ValidateOptions {
    /** Root element for selector queries. Default: `document`. */
    root?: Document | Element;
    /** Whether to validate CEL rules compile. Default: true. */
    validateCel?: boolean;
    /** Maximum elements to scan for visibility validation.
     * Default: 1000 (MutationObserver scans can be heavy). */
    maxVisibilityScan?: number;
}
/**
 * Validate a tracking plan against the live DOM.
 *
 * Returns a structured report suitable for:
 * - Displaying in a dev toolbar
 * - Feeding back to an LLM as a correction prompt
 * - Blocking init in strict mode
 */
export declare function validatePlan(plan: TrackingPlan, opts?: ValidateOptions): ValidationReport;
//# sourceMappingURL=validate.d.ts.map