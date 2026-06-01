/**
 * Tests for preset expansion and the new observers (errors, scroll, lifecycle).
 */

import { describe, expect, it, vi } from "vitest";
import { expandPreset, expandPresets } from "../src/presets.js";
import type { TrackingPreset, EventRecord } from "../src/types.js";

// ─── Preset expansion ──────────────────────────────────────────────

describe("preset expansion", () => {
  it("expands a single preset into rules", () => {
    const rules = expandPreset("section_engagement");
    expect(rules.length).toBeGreaterThanOrEqual(3);
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("section_read");
    expect(ids).toContain("section_skimmed");
    expect(ids).toContain("content_engaged");
  });

  it("every preset returns rules with id, when, and emit", () => {
    const presets: TrackingPreset[] = [
      "section_engagement",
      "full_engagement",
      "error_hunting",
      "scroll_tracking",
      "form_validation",
      "page_value",
      "cta_performance",
      "bounce_detection",
    ];
    for (const p of presets) {
      const rules = expandPreset(p);
      expect(rules.length).toBeGreaterThan(0);
      for (const r of rules) {
        expect(r.id).toBeTruthy();
        expect(r.when).toBeTruthy();
        expect(r.emit).toBeTruthy();
      }
    }
  });

  it("deduplicates rules when presets overlap", () => {
    // section_engagement's rules are subset of full_engagement
    const both: TrackingPreset[] = ["section_engagement", "full_engagement"];
    const merged = expandPresets(both);
    const ids = merged.map((r) => r.id);
    // section_read should appear exactly once
    expect(ids.filter((id) => id === "section_read").length).toBe(1);
  });

  it("section_engagement rules use correct event kinds", () => {
    const rules = expandPreset("section_engagement");
    const readRule = rules.find((r) => r.id === "section_read");
    expect(readRule?.when).toContain("section.dwelled");
    expect(readRule?.emit.params).toEqual(
      expect.objectContaining({ section: "event.target.id" }),
    );
  });

  it("error_hunting covers all three error sources", () => {
    const rules = expandPreset("error_hunting");
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("js_error");
    expect(ids).toContain("promise_error");
    expect(ids).toContain("resource_error");
  });
});

// ─── Scroll depth ──────────────────────────────────────────────────
// We test the computeScrollDepth logic indirectly through the observer
// API — actual scroll position requires a browser-like environment.
// The following tests the preset rules and CEL compilation for scroll.

describe("scroll tracking (preset rules)", () => {
  it("scrolled_50 fires when depth >= 0.5", () => {
    const rules = expandPreset("scroll_tracking");
    const rule50 = rules.find((r) => r.id === "scrolled_50");
    expect(rule50).toBeDefined();
    expect(rule50!.when).toContain("scroll.milestone");
    expect(rule50!.when).toContain("event.depth >= 0.5");
  });

  it("scrolled_100 fires when depth >= 1", () => {
    const rules = expandPreset("scroll_tracking");
    const rule100 = rules.find((r) => r.id === "scrolled_100");
    expect(rule100).toBeDefined();
    expect(rule100!.when).toContain("scroll.milestone");
    expect(rule100!.when).toContain("event.depth >= 1");
  });
});

// ─── Lifecycle / bounce ────────────────────────────────────────────

describe("bounce detection (preset rules)", () => {
  it("bounced rule references lifecycle.unloaded and event.bounced", () => {
    const rules = expandPreset("bounce_detection");
    expect(rules.length).toBe(1);
    const bounced = rules[0]!;
    expect(bounced.when).toContain("lifecycle.unloaded");
    expect(bounced.emit.params).toEqual(
      expect.objectContaining({
        duration_ms: "event.durationMs",
        interactions: "event.interactionCount",
      }),
    );
  });
});

// ─── Error observer (preset integration) ───────────────────────────

describe("error observer (preset integration)", () => {
  it("js_error rule matches error kind with onerror source", () => {
    const rules = expandPreset("error_hunting");
    const jsError = rules.find((r) => r.id === "js_error")!;
    expect(jsError.when).toContain('event.kind == "error"');
    expect(jsError.when).toContain('event.source == "onerror"');
  });
});
