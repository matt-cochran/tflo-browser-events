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
export declare function expandPreset(preset: TrackingPreset): TrackingRule[];
/** Expand multiple presets, deduplicating by rule id. */
export declare function expandPresets(presets: TrackingPreset[]): TrackingRule[];
//# sourceMappingURL=presets.d.ts.map