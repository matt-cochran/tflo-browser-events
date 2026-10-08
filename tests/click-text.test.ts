// @vitest-environment jsdom
/**
 * Click records and element text (issue #10): no text by default, an explicit
 * per-click opt-in, and never text from form fields, editable regions or
 * masked subtrees.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TFloBrowser } from "../src/browser.js";
import { init } from "../src/plan.js";
import { capturableText, MAX_CAPTURED_TEXT } from "../src/privacy.js";
import { expandPresets } from "../src/presets.js";
import type { EventRecord, TrackingPlan, TrackingPreset } from "../src/types.js";

function html(markup: string): HTMLElement {
    document.body.innerHTML = markup;
    return document.body;
}

describe("capturableText", () => {
    it("joins visible text, collapses whitespace and caps the length", () => {
        html(`<button id="b">  Save   <b>draft</b>\n now </button>`);
        expect(capturableText(document.getElementById("b")!)).toBe("Save draft now");

        html(`<button id="b">${"x".repeat(200)}</button>`);
        expect(capturableText(document.getElementById("b")!)).toHaveLength(MAX_CAPTURED_TEXT);
    });

    it("returns null for form fields, including passwords", () => {
        for (const tag of [
            `<input id="t" value="secret">`,
            `<input id="t" type="password" value="hunter2">`,
            `<textarea id="t">my message</textarea>`,
            `<select id="t"><option>Ada Lovelace</option></select>`,
        ]) {
            html(tag);
            expect(capturableText(document.getElementById("t")!)).toBeNull();
        }
    });

    it("returns null inside editable or masked regions", () => {
        html(`<div contenteditable="true"><span id="t">draft text</span></div>`);
        expect(capturableText(document.getElementById("t")!)).toBeNull();
        html(`<div data-tflo-mask><button id="t">Ada Lovelace</button></div>`);
        expect(capturableText(document.getElementById("t")!)).toBeNull();
        html(`<div data-jz-mask><button id="t">Ticket #123: refund</button></div>`);
        expect(capturableText(document.getElementById("t")!)).toBeNull();
        html(`<button id="t" data-tflo-mask>Ada</button>`);
        expect(capturableText(document.getElementById("t")!)).toBeNull();
    });

    it("skips masked, editable and form descendants but keeps the rest", () => {
        html(`<button id="t">Assign to <span data-tflo-mask>Ada Lovelace</span>
            <span data-jz-mask>ada@example.com</span> <input value="typed">
            <span contenteditable="true">note</span> now</button>`);
        expect(capturableText(document.getElementById("t")!)).toBe("Assign to now");
    });

    it("returns null when nothing safe remains", () => {
        html(`<button id="t"><span data-tflo-mask>Ada</span></button>`);
        expect(capturableText(document.getElementById("t")!)).toBeNull();
    });

    it("treats contenteditable=false as not editable", () => {
        html(`<div contenteditable="false"><button id="t">Archive</button></div>`);
        expect(capturableText(document.getElementById("t")!)).toBe("Archive");
    });
});

describe("click records (tracking plan)", () => {
    let ingested: EventRecord[];

    beforeEach(() => {
        ingested = [];
        vi.spyOn(TFloBrowser.prototype, "init").mockResolvedValue();
        vi.spyOn(TFloBrowser.prototype, "ingest").mockImplementation((event: EventRecord) => {
            ingested.push(event);
            return [];
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    async function clickWith(plan: TrackingPlan["track"], markup: string): Promise<EventRecord> {
        ingested = [];
        html(markup);
        const result = await init({ page: { id: "p" }, track: plan });
        await result.ready;
        document.querySelector<HTMLElement>("[data-tflow-id]")!.click();
        await result.destroy();
        const click = ingested.find((e) => e.kind === "click");
        expect(click).toBeDefined();
        return click!;
    }

    it("records no element text by default", async () => {
        const click = await clickWith(
            { clicks: [{ id: "assign" }] },
            `<button data-tflow-id="assign">Assign to Ada Lovelace</button>`,
        );
        expect(click.fields).not.toHaveProperty("text");
        expect(click.fields.tflowId).toBe("assign");
        expect(click.fields.tag).toBe("button");
    });

    it("records text when the click opts in", async () => {
        const click = await clickWith(
            { clicks: [{ id: "save", captureText: true }] },
            `<button data-tflow-id="save">Save draft</button>`,
        );
        expect(click.fields.text).toBe("Save draft");
    });

    it("never records masked text, even with the opt-in", async () => {
        const click = await clickWith(
            { clicks: [{ id: "assign", captureText: true }] },
            `<button data-tflow-id="assign">Assign to <span data-tflo-mask>Ada Lovelace</span></button>`,
        );
        expect(click.fields.text).toBe("Assign to");

        const masked = await clickWith(
            { clicks: [{ id: "row", captureText: true }] },
            `<div data-jz-mask><a data-tflow-id="row">Ticket #123: refund for Ada</a></div>`,
        );
        expect(masked.fields.text).toBeNull();
    });

    it("keeps the opt-in per click", async () => {
        html(`<button data-tflow-id="a">Alpha</button><button data-tflow-id="b">Beta</button>`);
        const result = await init({
            page: { id: "p" },
            track: { clicks: [{ id: "a", captureText: true }, { id: "b" }] },
        });
        await result.ready;
        document.querySelector<HTMLElement>('[data-tflow-id="a"]')!.click();
        document.querySelector<HTMLElement>('[data-tflow-id="b"]')!.click();
        await result.destroy();
        const clicks = ingested.filter((e) => e.kind === "click");
        expect(clicks.map((c) => c.fields.text)).toEqual(["Alpha", undefined]);
    });

    it("no preset rule reads or emits element text", () => {
        const presets: TrackingPreset[] = [
            "section_engagement",
            "full_engagement",
            "error_hunting",
            "scroll_tracking",
        ];
        const rules = JSON.stringify(expandPresets(presets));
        expect(rules).not.toMatch(/\btext\b|textContent|innerText/);
    });
});
