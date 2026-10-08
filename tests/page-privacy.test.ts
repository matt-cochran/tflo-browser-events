// @vitest-environment jsdom
/**
 * Page context privacy: no document.title by default, and URLs read from the
 * page keep origin + path unless `page.captureFullUrls` is set.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TFloBrowser } from "../src/browser.js";
import { captureErrors } from "../src/observers/errors.js";
import { captureLifecycle } from "../src/observers/lifecycle.js";
import { init } from "../src/plan.js";
import { pathOnlyUrl, stripUrlQueries } from "../src/privacy.js";
import type { EventRecord, PageInfo } from "../src/types.js";

describe("URL helpers", () => {
    it("pathOnlyUrl drops query and fragment", () => {
        expect(pathOnlyUrl("https://a.example/p/q?token=abc#x")).toBe("https://a.example/p/q");
        expect(pathOnlyUrl("https://a.example/p#/route?x=1")).toBe("https://a.example/p");
        expect(pathOnlyUrl("/relative?x=1")).toBe("/relative");
        expect(pathOnlyUrl("")).toBe("");
    });

    it("stripUrlQueries cleans URLs inside text and keeps stack line:col", () => {
        expect(stripUrlQueries("fetch https://api.example/u?email=ada@example.com failed")).toBe(
            "fetch https://api.example/u failed",
        );
        expect(
            stripUrlQueries("at load (https://cdn.example/app.js?v=3&sig=s3cr3t:10:5)"),
        ).toBe("at load (https://cdn.example/app.js:10:5)");
        expect(stripUrlQueries("plain text, no url")).toBe("plain text, no url");
    });
});

describe("session_started page context", () => {
    let ingested: EventRecord[];

    beforeEach(() => {
        ingested = [];
        document.title = "Refund for Ada Lovelace";
        window.history.pushState({}, "", "/tickets/42?email=ada@example.com#reply");
        Object.defineProperty(document, "referrer", {
            value: "https://search.example/?q=ada+lovelace",
            configurable: true,
        });
        vi.spyOn(TFloBrowser.prototype, "init").mockResolvedValue();
        vi.spyOn(TFloBrowser.prototype, "ingest").mockImplementation((event: EventRecord) => {
            ingested.push(event);
            return [];
        });
    });

    afterEach(() => vi.restoreAllMocks());

    async function sessionStarted(page: PageInfo): Promise<EventRecord> {
        const result = await init({ page, track: {} });
        await result.ready;
        await result.destroy();
        const start = ingested.find((e) => e.kind === "session_started");
        expect(start).toBeDefined();
        return start!;
    }

    it("sends no title and path-only URLs by default", async () => {
        const start = await sessionStarted({ id: "ticket" });
        expect(start.fields).not.toHaveProperty("title");
        expect(start.fields.url).toBe(`${location.origin}/tickets/42`);
        expect(start.fields.referrer).toBe("https://search.example/");
        expect(JSON.stringify(start)).not.toMatch(/Ada|ada|email|reply/);
    });

    it("sends document.title only on opt-in", async () => {
        const start = await sessionStarted({ id: "ticket", captureTitle: true });
        expect(start.fields.title).toBe("Refund for Ada Lovelace");
    });

    it("sends full URLs only on opt-in", async () => {
        const start = await sessionStarted({ id: "ticket", captureFullUrls: true });
        expect(start.fields.url).toBe(`${location.origin}/tickets/42?email=ada@example.com#reply`);
        expect(start.fields.referrer).toBe("https://search.example/?q=ada+lovelace");
    });

    it("sends values the host sets explicitly, as given", async () => {
        const start = await sessionStarted({
            id: "ticket",
            title: "Ticket",
            url: "https://app.example/t/{id}",
        });
        expect(start.fields.title).toBe("Ticket");
        expect(start.fields.url).toBe("https://app.example/t/{id}");
    });
});

describe("error capture URLs", () => {
    let records: EventRecord[];
    let unbind: () => void;
    afterEach(() => unbind?.());

    function start(fullUrls?: boolean): void {
        records = [];
        unbind = captureErrors({ cfg: {}, handler: (r) => records.push(r), fullUrls });
    }

    it("strips query and fragment from resource and script URLs by default", () => {
        start();
        const img = document.createElement("img");
        img.src = "https://cdn.example/a.png?sig=s3cr3t#x";
        document.body.appendChild(img);
        img.dispatchEvent(new Event("error"));
        window.onerror?.(
            "failed https://api.example/u?email=ada@example.com",
            "https://cdn.example/app.js?sig=s3cr3t",
            1,
            2,
            undefined,
        );
        expect(JSON.stringify(records)).not.toMatch(/s3cr3t|email|ada/);
        const resource = records.find((r) => r.fields.source === "resource");
        expect(resource?.fields.resourceUrl).toBe("https://cdn.example/a.png");
        const js = records.find((r) => r.fields.source === "onerror");
        expect(js?.fields.filename).toBe("https://cdn.example/app.js");
    });

    it("keeps full URLs on opt-in", () => {
        start(true);
        const img = document.createElement("img");
        img.src = "https://cdn.example/a.png?sig=s3cr3t";
        document.body.appendChild(img);
        img.dispatchEvent(new Event("error"));
        expect(records.find((r) => r.fields.source === "resource")?.fields.resourceUrl).toBe(
            "https://cdn.example/a.png?sig=s3cr3t",
        );
    });
});

describe("route changes", () => {
    it("send the path only by default, the fragment on opt-in", () => {
        window.history.pushState({}, "", "/inbox#token=abc");
        for (const [fullUrls, expected] of [
            [undefined, { pathname: "/inbox" }],
            [true, { pathname: "/inbox", hash: "#token=abc" }],
        ] as const) {
            const records: EventRecord[] = [];
            const unbind = captureLifecycle({
                cfg: { pageLoad: false, pageUnload: false, routeChanges: true },
                handler: (r) => records.push(r),
                fullUrls,
            });
            window.dispatchEvent(new PopStateEvent("popstate"));
            unbind();
            const route = records.find((r) => r.kind === "lifecycle.route_changed");
            expect(route?.fields).toEqual(expected);
        }
    });
});
