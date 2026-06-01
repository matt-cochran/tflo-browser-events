/**
 * Example: full tracking plan — the "product detail" page with all
 * meta-signal layers enabled.
 *
 * Demonstrates sections, clicks, pointer sampling, errors, scroll depth,
 * visibility tracking, lifecycle monitoring, presets, and CEL rules all
 * wired through tflo().
 *
 * Markup expected:
 *   <section id="hero"> ... </section>
 *   <section id="pricing"> ... </section>
 *   <section id="reviews"> ... </section>
 *   <button data-tflow-id="buy_now">Buy now</button>
 *   <a data-tflow-id="pricing_cta" href="/pricing">See pricing</a>
 *   <form id="checkout" data-track-form> ... </form>
 *   <div data-track-visibility="toast_error" class="hidden">Error</div>
 */

import { tflo, type TrackingPlan } from "../src/index.js";

const plan: TrackingPlan = {
    page: {
        id: "product-detail",
        attrs: { productId: "sku-123", category: "electronics" },
    },

    track: {
        // ── Sections (IntersectionObserver) ─────────────────────────
        sections: [
            { id: "hero", selector: "#hero" },
            { id: "pricing", selector: "#pricing" },
            { id: "reviews", selector: "#reviews" },
        ],

        // ── Clicks (durable data-tflow-id contract) ────────────────
        clicks: [{ id: "buy_now" }, { id: "pricing_cta" }],

        // ── Pointer (sampled) ──────────────────────────────────────
        pointer: {
            moves: "sampled",
            sampleMs: 250,
        },

        // ── Errors (JS, promise, resource) ─────────────────────────
        errors: {
            jsErrors: true,
            promiseRejections: true,
            resourceErrors: true,
            ignorePatterns: ["chrome-extension://", "moz-extension://"],
        },

        // ── Scroll depth ───────────────────────────────────────────
        scroll: {
            milestones: [0.25, 0.5, 0.75, 1],
            throttleMs: 250,
            directionChanges: true,
        },

        // ── Element visibility (modals, toasts) ────────────────────
        visibility: {
            selectors: [
                {
                    id: "toast_error",
                    selector: "[data-track-visibility='toast_error']",
                },
                { id: "loading_spinner", selector: ".loading-spinner" },
            ],
        },

        // ── Page lifecycle ─────────────────────────────────────────
        lifecycle: {
            pageLoad: true,
            visibilityChange: true,
            pageUnload: true,
            bounceThresholdMs: 10_000, // bounce if user leaves in <10s with no interaction
            idleThresholdMs: 30_000, // idle after 30s of no activity
        },

        // ── Codegen hints ──────────────────────────────────────────
        auto: {
            scanSections:
                "[data-section-id], section[id], [data-track-section]",
            scanClicks: true,
            scanForms: "form[data-track-form], form[id]",
            scanVisibility: "[data-track-visibility]",
        },
    },

    // ── Presets (no CEL to write for these) ──────────────────────
    presets: [
        "section_engagement",
        "error_hunting",
        "scroll_tracking",
        "bounce_detection",
    ],

    // ── Rules (custom CEL for domain-specific signals) ───────────
    rules: [
        {
            id: "section_read",
            when: 'event.kind == "section.dwelled" && event.durationMs >= 3000',
            emit: {
                name: "section_read",
                params: {
                    section: "event.target.id",
                    duration_ms: "event.durationMs",
                },
                sinks: ["ga4", "edge"],
            },
        },
        {
            id: "buy_now_clicked",
            when: 'event.kind == "click" && event.target.id == "buy_now"',
            emit: {
                name: "buy_now_clicked",
                params: { target: "event.target.id" },
                sinks: ["ga4", "edge"],
            },
        },
    ],

    // ── Sinks ───────────────────────────────────────────────────
    sinks: {
        ga4: { measurementId: "G-XXXXXXXX" },
        edge: { endpoint: "/collect/signals", batchSize: 10 },
        console: true,
    },

    consent: () => localStorage.getItem("analytics_consent") === "yes",
};

const { ready, destroy } = await tflo(plan);
await ready;

window.addEventListener("pagehide", () => {
    void destroy();
});
