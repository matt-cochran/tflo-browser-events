import { describe, expect, it, vi } from "vitest";
import { captureViewport, type EventRecord } from "../src/index.js";

/**
 * Minimal mock IntersectionObserver that exposes a `.fire()` method so
 * tests can simulate the browser firing entries. The captureViewport
 * helper accepts an `observerImpl` factory so tests inject this without
 * touching globals.
 */
class MockObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = "";
  readonly thresholds: ReadonlyArray<number> = [];
  observed: Element[] = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(el: Element): void {
    this.observed = this.observed.filter((x) => x !== el);
  }
  disconnect(): void {
    this.observed = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Test API: fire one or more entries through the callback. */
  fire(entries: Array<Partial<IntersectionObserverEntry> & { target: Element }>): void {
    this.callback(entries as IntersectionObserverEntry[], this);
  }
}

function elWithSectionId(id: string): Element {
  // Construct a minimal "Element-like" object that satisfies what the
  // viewport helper actually reads — sectionIdFrom default reads
  // `dataset.sectionId`, `id`, and `tagName`. We use a plain object
  // shaped like an HTMLElement.
  return {
    dataset: { sectionId: id },
    id: "",
    tagName: "DIV",
  } as unknown as Element;
}

describe("captureViewport", () => {
  it("emits enter, exit, and dwell with durationMs on intersection cycle", () => {
    let observer!: MockObserver;
    const records: EventRecord[] = [];
    let now = 1000;

    const unbind = captureViewport(
      {
        target: [],
        observerImpl: (cb) => {
          observer = new MockObserver(cb);
          return observer;
        },
        now: () => now,
      },
      (r) => records.push(r),
    );

    const intro = elWithSectionId("intro");
    observer.observe(intro);

    // Element enters viewport at ts=1000
    now = 1000;
    observer.fire([{ target: intro, isIntersecting: true, intersectionRatio: 0.8 }]);
    // Element leaves viewport at ts=4500
    now = 4500;
    observer.fire([{ target: intro, isIntersecting: false, intersectionRatio: 0.1 }]);

    expect(records.map((r) => r.kind)).toEqual([
      "viewport:enter",
      "viewport:exit",
      "viewport:dwell",
    ]);
    const dwell = records[2]!;
    expect(dwell.fields).toMatchObject({
      sectionId: "intro",
      durationMs: 3500,
      entryTs: 1000,
      exitTs: 4500,
    });
    unbind();
  });

  it("only enters once per visibility window when threshold steps", () => {
    let observer!: MockObserver;
    const records: EventRecord[] = [];
    captureViewport(
      {
        target: [],
        observerImpl: (cb) => {
          observer = new MockObserver(cb);
          return observer;
        },
        now: () => 0,
      },
      (r) => records.push(r),
    );

    const el = elWithSectionId("hero");
    observer.observe(el);

    // Browser may fire several "isIntersecting=true" events as the
    // intersection ratio crosses thresholds. Only one enter should emit.
    observer.fire([{ target: el, isIntersecting: true, intersectionRatio: 0.5 }]);
    observer.fire([{ target: el, isIntersecting: true, intersectionRatio: 0.8 }]);
    observer.fire([{ target: el, isIntersecting: true, intersectionRatio: 1.0 }]);

    expect(records.filter((r) => r.kind === "viewport:enter").length).toBe(1);
  });

  it("emit filter — only dwell", () => {
    let observer!: MockObserver;
    const records: EventRecord[] = [];
    let now = 0;
    captureViewport(
      {
        target: [],
        emit: ["dwell"],
        observerImpl: (cb) => {
          observer = new MockObserver(cb);
          return observer;
        },
        now: () => now,
      },
      (r) => records.push(r),
    );
    const el = elWithSectionId("feature");
    observer.observe(el);
    now = 100;
    observer.fire([{ target: el, isIntersecting: true, intersectionRatio: 0.7 }]);
    now = 500;
    observer.fire([{ target: el, isIntersecting: false, intersectionRatio: 0.0 }]);
    expect(records.map((r) => r.kind)).toEqual(["viewport:dwell"]);
    expect(records[0]?.fields).toMatchObject({ durationMs: 400, sectionId: "feature" });
  });

  it("unbind emits trailing exit + dwell for still-visible elements", () => {
    let observer!: MockObserver;
    const records: EventRecord[] = [];
    let now = 0;
    const unbind = captureViewport(
      {
        target: [],
        observerImpl: (cb) => {
          observer = new MockObserver(cb);
          return observer;
        },
        now: () => now,
      },
      (r) => records.push(r),
    );
    const el = elWithSectionId("footer");
    observer.observe(el);
    now = 100;
    observer.fire([{ target: el, isIntersecting: true, intersectionRatio: 0.6 }]);
    // Section never exited via browser. User navigates away → unbind.
    now = 2500;
    unbind();
    const dwell = records.find((r) => r.kind === "viewport:dwell");
    expect(dwell?.fields).toMatchObject({
      sectionId: "footer",
      durationMs: 2400,
    });
  });

  it("tracks multiple sections independently", () => {
    let observer!: MockObserver;
    const records: EventRecord[] = [];
    let now = 0;
    captureViewport(
      {
        target: [],
        observerImpl: (cb) => {
          observer = new MockObserver(cb);
          return observer;
        },
        now: () => now,
      },
      (r) => records.push(r),
    );
    const a = elWithSectionId("section-a");
    const b = elWithSectionId("section-b");
    observer.observe(a);
    observer.observe(b);

    now = 100;
    observer.fire([{ target: a, isIntersecting: true, intersectionRatio: 0.8 }]);
    now = 200;
    observer.fire([{ target: b, isIntersecting: true, intersectionRatio: 0.6 }]);
    now = 500;
    observer.fire([{ target: a, isIntersecting: false, intersectionRatio: 0.0 }]);
    now = 800;
    observer.fire([{ target: b, isIntersecting: false, intersectionRatio: 0.0 }]);

    const dwells = records.filter((r) => r.kind === "viewport:dwell");
    expect(dwells.length).toBe(2);
    const aDwell = dwells.find((r) => r.fields["sectionId"] === "section-a");
    const bDwell = dwells.find((r) => r.fields["sectionId"] === "section-b");
    expect(aDwell?.fields).toMatchObject({ durationMs: 400, entryTs: 100, exitTs: 500 });
    expect(bDwell?.fields).toMatchObject({ durationMs: 600, entryTs: 200, exitTs: 800 });
  });

  it("custom sectionIdFrom overrides the default", () => {
    let observer!: MockObserver;
    const records: EventRecord[] = [];
    captureViewport(
      {
        target: [],
        sectionIdFrom: () => "custom-id",
        observerImpl: (cb) => {
          observer = new MockObserver(cb);
          return observer;
        },
        now: () => 0,
      },
      (r) => records.push(r),
    );
    const el = elWithSectionId("ignored");
    observer.observe(el);
    observer.fire([{ target: el, isIntersecting: true, intersectionRatio: 1.0 }]);
    expect(records[0]?.fields["sectionId"]).toBe("custom-id");
  });
});
