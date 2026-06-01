/**
 * Tests for the diagnostics module: diagnosticEvent factory,
 * checkSelectorHealth, checkClickCoverage, and the full diagnostic
 * event shape.
 */
import { describe, expect, it, vi } from "vitest";
import type { EventRecord } from "../src/types.js";
import {
    diagnosticEvent,
    checkSelectorHealth,
    checkClickCoverage,
    type DiagnosticKind,
} from "../src/diagnostics.js";

// ─── diagnosticEvent factory ───────────────────────────────────────

describe("diagnosticEvent factory", () => {
    const now = () => 1000;

    it("creates an EventRecord with kind tflo:diagnostic", () => {
        const ev = diagnosticEvent(
            "selector_stale",
            {
                source: 'track.sections["hero"]',
                message: "Selector matched zero elements",
            },
            now,
        );

        expect(ev.kind).toBe("tflo:diagnostic");
        expect(ev.ts).toBe(1000);
        expect(ev.target?.id).toBe("tflo");
        expect(ev.target?.type).toBe("diagnostic");
    });

    it("includes diagnosticKind in fields", () => {
        const ev = diagnosticEvent(
            "rate_limit_hit",
            {
                source: "track.errors",
                message: "Rate limit reached",
            },
            now,
        );

        expect(ev.fields["diagnosticKind"]).toBe("rate_limit_hit");
    });

    it("includes source and message in fields", () => {
        const ev = diagnosticEvent(
            "sink_delivery_failed",
            {
                source: "ga4",
                message: "gtag threw",
                error: "TypeError: gtag is not a function",
            },
            now,
        );

        expect(ev.fields["source"]).toBe("ga4");
        expect(ev.fields["message"]).toBe("gtag threw");
        expect(ev.fields["error"]).toBe("TypeError: gtag is not a function");
    });

    it("includes optional context", () => {
        const ev = diagnosticEvent(
            "click_target_missing",
            {
                source: "track.clicks",
                message: "Unconfigured click target",
                context: { dataTflowId: "buy_now", tag: "button" },
            },
            now,
        );

        const ctx = ev.fields["context"] as Record<string, unknown>;
        expect(ctx?.dataTflowId).toBe("buy_now");
        expect(ctx?.tag).toBe("button");
    });

    it("uses default time source when now is omitted", () => {
        const ev = diagnosticEvent("selector_stale", {
            source: "test",
            message: "test",
        });
        expect(typeof ev.ts).toBe("number");
        expect(ev.ts).toBeGreaterThan(0);
    });

    it("every DiagnosticKind produces a valid event", () => {
        const kinds: DiagnosticKind[] = [
            "selector_stale",
            "wasm_init_failed",
            "sink_delivery_failed",
            "consent_rejected",
            "pattern_compile_failed",
            "edge_batch_failed",
            "observer_failed",
            "rate_limit_hit",
            "click_target_missing",
            "section_target_missing",
            "validation_failed",
        ];
        for (const kind of kinds) {
            const ev = diagnosticEvent(
                kind,
                {
                    source: "test",
                    message: `test ${kind}`,
                },
                now,
            );
            expect(ev.fields["diagnosticKind"]).toBe(kind);
        }
    });
});

// ─── checkSelectorHealth ──────────────────────────────────────────

describe("checkSelectorHealth", () => {
    it("returns true when elements exist, no diagnostic emitted", () => {
        // We need a DOM element. Use a mock.
        const onDiagnostic = vi.fn();
        const results = [document.createElement("div")];
        const healthy = checkSelectorHealth(
            "#exists",
            "test",
            results,
            onDiagnostic,
            () => 0,
        );
        expect(healthy).toBe(true);
        expect(onDiagnostic).not.toHaveBeenCalled();
    });

    it("returns false and emits diagnostic when no elements", () => {
        const onDiagnostic = vi.fn();
        const healthy = checkSelectorHealth(
            "#nonexistent",
            'track.sections["foo"]',
            [],
            onDiagnostic,
            () => 0,
        );
        expect(healthy).toBe(false);
        expect(onDiagnostic).toHaveBeenCalledTimes(1);
        const ev = onDiagnostic.mock.calls[0]![0] as EventRecord;
        expect(ev.kind).toBe("tflo:diagnostic");
        expect(ev.fields["diagnosticKind"]).toBe("selector_stale");
        expect(ev.fields["source"]).toBe('track.sections["foo"]');
        expect(ev.fields["message"]).toContain("#nonexistent");
    });
});

// ─── checkClickCoverage ───────────────────────────────────────────

describe("checkClickCoverage", () => {
    it("emits nothing when clicked element has no data-tflow-id", () => {
        const onDiagnostic = vi.fn();
        const el = document.createElement("button");
        const configured = new Set<string>(["buy_now"]);

        checkClickCoverage(el, configured, onDiagnostic, () => 0);
        expect(onDiagnostic).not.toHaveBeenCalled();
    });

    it("emits nothing when clicked data-tflow-id is in configured set", () => {
        const onDiagnostic = vi.fn();
        const el = document.createElement("button");
        el.setAttribute("data-tflow-id", "buy_now");
        const configured = new Set<string>(["buy_now"]);

        checkClickCoverage(el, configured, onDiagnostic, () => 0);
        expect(onDiagnostic).not.toHaveBeenCalled();
    });

    it("emits diagnostic when data-tflow-id is not in configured set", () => {
        const onDiagnostic = vi.fn();
        const el = document.createElement("button");
        el.setAttribute("data-tflow-id", "missing_cta");
        const configured = new Set<string>(["buy_now"]);

        checkClickCoverage(el, configured, onDiagnostic, () => 0);
        expect(onDiagnostic).toHaveBeenCalledTimes(1);
        const ev = onDiagnostic.mock.calls[0]![0] as EventRecord;
        expect(ev.fields["diagnosticKind"]).toBe("click_target_missing");
        const ctx = ev.fields["context"] as Record<string, unknown>;
        expect(ctx?.dataTflowId).toBe("missing_cta");
    });

    it("walks up parent chain to find data-tflow-id", () => {
        const onDiagnostic = vi.fn();
        const parent = document.createElement("div");
        parent.setAttribute("data-tflow-id", "parent_cta");
        const child = document.createElement("span");
        parent.appendChild(child);
        const configured = new Set<string>(["buy_now"]);

        checkClickCoverage(child, configured, onDiagnostic, () => 0);
        expect(onDiagnostic).toHaveBeenCalledTimes(1);
        const ev = onDiagnostic.mock.calls[0]![0] as EventRecord;
        const ctx = ev.fields["context"] as Record<string, unknown>;
        expect(ctx?.dataTflowId).toBe("parent_cta");
    });
});

// ─── Negative: SHALL NOT emit for falsy conditions ────────────────

describe("diagnostics — negative assertions", () => {
    it("shall NOT emit diagnostic when empty elements list passed to checkSelectorHealth", () => {
        const onDiagnostic = vi.fn();
        const result = checkSelectorHealth(
            "foo",
            "test",
            [],
            onDiagnostic,
            () => 0,
        );
        expect(result).toBe(false);
        expect(onDiagnostic).toHaveBeenCalledTimes(1);
        // Only selector_stale, nothing else
        const ev = onDiagnostic.mock.calls[0]![0] as EventRecord;
        expect(ev.fields["diagnosticKind"]).toBe("selector_stale");
    });

    it("shall NOT emit click coverage diagnostic for null element", () => {
        const onDiagnostic = vi.fn();
        // @ts-expect-error testing null
        checkClickCoverage(null, new Set(), onDiagnostic, () => 0);
        expect(onDiagnostic).not.toHaveBeenCalled();
    });
});
