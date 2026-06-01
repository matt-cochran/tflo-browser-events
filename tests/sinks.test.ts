import { describe, expect, it, vi } from "vitest";
import {
  ConsoleSink,
  EdgeSink,
  GA4Sink,
  SinkRouter,
  type DerivedSignal,
  type Sink,
} from "../src/index.js";

function signal(name: string, sinks?: string[]): DerivedSignal {
  return { name, ts: 0, payload: { x: 1 }, sinks };
}

class CollectorSink implements Sink {
  readonly name: string;
  readonly received: DerivedSignal[] = [];
  constructor(name: string) {
    this.name = name;
  }
  send(s: DerivedSignal): void {
    this.received.push(s);
  }
}

describe("SinkRouter", () => {
  it("routes to every sink when signal.sinks is unset", async () => {
    const a = new CollectorSink("a");
    const b = new CollectorSink("b");
    const router = new SinkRouter({ sinks: [a, b] });
    await router.route(signal("x"));
    expect(a.received.length).toBe(1);
    expect(b.received.length).toBe(1);
  });

  it("routes only to named sinks when signal.sinks is set", async () => {
    const a = new CollectorSink("a");
    const b = new CollectorSink("b");
    const router = new SinkRouter({ sinks: [a, b] });
    await router.route(signal("x", ["a"]));
    expect(a.received.length).toBe(1);
    expect(b.received.length).toBe(0);
  });

  it("isolates a sink's failure from the others", async () => {
    const errors: Array<[string, unknown]> = [];
    const onError = (name: string, err: unknown) => errors.push([name, err]);
    const ok = new CollectorSink("ok");
    const failing: Sink = {
      name: "fail",
      send: () => {
        throw new Error("boom");
      },
    };
    const router = new SinkRouter({ sinks: [failing, ok], onError });
    await router.route(signal("x"));
    expect(ok.received.length).toBe(1);
    expect(errors).toEqual([["fail", expect.any(Error)]]);
  });

  it("flushAll calls flush on every sink that implements it", async () => {
    const flushed: string[] = [];
    const a: Sink = {
      name: "a",
      send: () => {},
      flush: () => {
        flushed.push("a");
      },
    };
    const b: Sink = { name: "b", send: () => {} }; // no flush
    const c: Sink = {
      name: "c",
      send: () => {},
      flush: async () => {
        flushed.push("c");
      },
    };
    const router = new SinkRouter({ sinks: [a, b, c] });
    await router.flushAll();
    expect(flushed.sort()).toEqual(["a", "c"]);
  });
});

describe("ConsoleSink", () => {
  it("logs the signal at the configured level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const sink = new ConsoleSink();
      sink.send(signal("x"));
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("EdgeSink", () => {
  it("batches up to batchSize before flushing", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response(null, { status: 200 });
    });
    const sink = new EdgeSink({
      endpoint: "/collect",
      batchSize: 3,
      batchIntervalMs: 60_000,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    sink.send(signal("a"));
    sink.send(signal("b"));
    expect(calls.length).toBe(0); // not yet at batchSize
    sink.send(signal("c")); // triggers flush
    // Allow microtask queue to drain
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.length).toBe(1);
    const parsed = JSON.parse(calls[0]!.body) as { batch: DerivedSignal[] };
    expect(parsed.batch.map((s) => s.name)).toEqual(["a", "b", "c"]);
  });

  it("flush(unloading=true) prefers sendBeacon when available", async () => {
    const beaconCalls: Array<[string, BodyInit]> = [];
    const sendBeacon = vi.fn((url: string, body: BodyInit) => {
      beaconCalls.push([url, body]);
      return true;
    });
    const fakeFetch = vi.fn();
    const sink = new EdgeSink({
      endpoint: "/collect",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      sendBeacon,
    });
    sink.send(signal("a"));
    await sink.flush({ unloading: true });
    expect(beaconCalls.length).toBe(1);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("falls back to fetch keepalive when sendBeacon refuses", async () => {
    const sendBeacon = vi.fn(() => false);
    const fetchCalls: RequestInit[] = [];
    const fakeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push(init ?? {});
      return new Response(null, { status: 200 });
    });
    const sink = new EdgeSink({
      endpoint: "/collect",
      fetchImpl: fakeFetch as unknown as typeof fetch,
      sendBeacon,
    });
    sink.send(signal("a"));
    await sink.flush({ unloading: true });
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0]?.keepalive).toBe(true);
  });
});

describe("GA4Sink", () => {
  it("forwards to gtag with sendTo when configured", () => {
    const calls: Array<[string, string, Record<string, unknown>]> = [];
    const gtag = (command: "event", name: string, params: Record<string, unknown>) => {
      calls.push([command, name, params]);
    };
    const sink = new GA4Sink({ gtag, sendTo: "G-XXXX" });
    sink.send({ name: "rage_click", ts: 100, payload: { target: "buy" } });
    expect(calls.length).toBe(1);
    const [cmd, name, params] = calls[0]!;
    expect(cmd).toBe("event");
    expect(name).toBe("rage_click");
    expect(params).toEqual({ target: "buy", send_to: "G-XXXX" });
  });

  it("no-ops when gtag is unavailable", () => {
    const sink = new GA4Sink(); // no gtag passed, none in globalThis
    expect(() =>
      sink.send({ name: "x", ts: 0, payload: {} }),
    ).not.toThrow();
  });
});
