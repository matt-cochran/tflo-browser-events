import { describe, expect, it, vi } from "vitest";
import { capture, type EventRecord } from "../src/index.js";

class FakeTarget implements EventTarget {
  private listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener as EventListener);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener as EventListener);
  }
  dispatchEvent(event: Event): boolean {
    const set = this.listeners.get(event.type);
    if (!set) return true;
    for (const fn of set) fn(event);
    return true;
  }
}

describe("capture", () => {
  it("emits a record for each event by default", () => {
    const target = new FakeTarget();
    const records: EventRecord[] = [];
    const unbind = capture(
      { target, type: "pointerdown", now: () => 100 },
      (r) => records.push(r),
    );
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("pointerdown"));
    unbind();
    expect(records.length).toBe(2);
    expect(records[0]?.kind).toBe("pointerdown");
    expect(records[0]?.ts).toBe(100);
  });

  it("respects custom kind and fields extractors", () => {
    const target = new FakeTarget();
    const records: EventRecord[] = [];
    capture<CustomEvent<{ id: string }>>(
      {
        target,
        type: "buy",
        kind: "purchase",
        fields: (e) => ({ id: e.detail.id }),
        now: () => 42,
      },
      (r) => records.push(r),
    );
    target.dispatchEvent(new CustomEvent("buy", { detail: { id: "sku-1" } }));
    expect(records[0]).toEqual({
      ts: 42,
      kind: "purchase",
      fields: { id: "sku-1" },
    });
  });

  it("throttles repeated events to one per window", () => {
    vi.useFakeTimers();
    try {
      const target = new FakeTarget();
      const records: EventRecord[] = [];
      capture(
        { target, type: "scroll", throttleMs: 50, now: () => 0 },
        (r) => records.push(r),
      );
      target.dispatchEvent(new Event("scroll"));
      target.dispatchEvent(new Event("scroll"));
      target.dispatchEvent(new Event("scroll"));
      expect(records.length).toBe(0); // pending in throttle
      vi.advanceTimersByTime(60);
      expect(records.length).toBe(1); // one collapsed
    } finally {
      vi.useRealTimers();
    }
  });

  it("unbind removes the listener", () => {
    const target = new FakeTarget();
    const records: EventRecord[] = [];
    const unbind = capture(
      { target, type: "click", now: () => 0 },
      (r) => records.push(r),
    );
    unbind();
    target.dispatchEvent(new Event("click"));
    expect(records.length).toBe(0);
  });
});
