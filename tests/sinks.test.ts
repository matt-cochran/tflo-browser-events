import { describe, expect, it, vi } from "vitest";
import {
  ConsoleSink,
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

// EdgeSink is covered in tests/edge.test.ts (transport rules: journeeze direct-mode contract C0b).

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
