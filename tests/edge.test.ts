import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeSink, uuidv7, type EdgeSinkOptions } from "../src/sinks/edge.js";
import type { DerivedSignal } from "../src/types.js";

const encoder = new TextEncoder();
const ENVELOPE_BYTES = encoder.encode('{"batch":[]}').length;

function signal(name: string): DerivedSignal {
  return { name, ts: 0, payload: {} };
}

function ok(): Response {
  return new Response(null, { status: 200 });
}

function status(code: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: code, headers });
}

interface FetchCall {
  url: string;
  init: RequestInit & { headers?: Record<string, string>; body?: string };
}

function recordingFetch(handler: (call: number) => Response | Promise<Response> = () => ok()): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: (init ?? {}) as FetchCall["init"] });
    return handler(calls.length - 1);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function beaconRecorder(result = true): {
  sendBeacon: (url: string, body: BodyInit) => boolean;
  calls: Array<{ url: string; body: Blob }>;
} {
  const calls: Array<{ url: string; body: Blob }> = [];
  const sendBeacon = vi.fn((url: string, body: BodyInit) => {
    calls.push({ url, body: body as Blob });
    return result;
  });
  return { sendBeacon, calls };
}

function bodyNames(call: FetchCall): string[] {
  const parsed = JSON.parse(call.init.body as string) as { batch: Array<Record<string, unknown>> };
  return parsed.batch.map((event) => event["name"] as string);
}

function bodyLengths(calls: FetchCall[]): number[] {
  return calls.map((call) => bodyNames(call).length);
}

function newSink(opts: Partial<EdgeSinkOptions> = {}): EdgeSink {
  return new EdgeSink({
    endpoint: "https://edge.test/collect",
    bindPageLifecycle: false,
    now: () => 1_700_000_000_000,
    random: () => 0,
    randomBytes: () => new Uint8Array(16),
    ...opts,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("EdgeSink options", () => {
  it("defaults the sink name to edge", () => {
    const sink = newSink();
    expect(sink.name).toBe("edge");
  });

  it("honours a custom sink name", () => {
    const sink = newSink({ name: "first-party" });
    expect(sink.name).toBe("first-party");
  });

  it("throws when text/plain is combined with custom headers", () => {
    expect(
      () => newSink({ contentType: "text/plain", headers: { authorization: "token" } }),
    ).toThrow(TypeError);
  });

  it("clamps batchSize above 50 to the 50-event maximum", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 100, fetchImpl });
    for (let i = 0; i < 51; i++) sink.send(signal(`e${i}`));
    await sink.flush();
    expect(bodyLengths(calls)[0]).toBe(50);
  });

  it("batches up to 20 events by default", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    for (let i = 0; i < 20; i++) sink.send(signal(`e${i}`));
    await sink.flush();
    expect(bodyLengths(calls)).toEqual([20]);
  });

  it("sends one event per request when batchSize is 1", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 1, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(bodyLengths(calls)).toEqual([1]);
  });
});

describe("EdgeSink wire format and batching", () => {
  it("posts a JSON {batch:[...]} envelope with the signal's fields, event_id and seq", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    const expectedId = uuidv7(1_700_000_000_000, () => new Uint8Array(16));
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      batch: [{ name: "a", ts: 0, payload: {}, event_id: expectedId, seq: 1 }],
    });
  });

  it("carries the sinks hint on the wire event when present", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    sink.send({ ...signal("a"), sinks: ["edge"] });
    await sink.flush();
    expect(JSON.parse(calls[0]!.init.body as string).batch[0].sinks).toEqual(["edge"]);
  });

  it("sends queued events oldest first in batches of at most batchSize", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 2, fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush();
    expect(calls.map(bodyNames)).toEqual([["a", "b"], ["c"]]);
  });

  it("splits a batch when the encoded body would exceed maxBatchBytes", async () => {
    const eventBytes = encoder.encode(
      JSON.stringify({
        name: "a",
        ts: 0,
        payload: {},
        event_id: uuidv7(1_700_000_000_000, () => new Uint8Array(16)),
        seq: 1,
      }),
    ).length;
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 20, maxBatchBytes: ENVELOPE_BYTES + eventBytes * 2 + 1, fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush();
    expect(bodyLengths(calls)).toEqual([2, 1]);
  });

  it("drops an event whose encoded wire body exceeds maxBatchBytes", async () => {
    const drops: Array<[string, number]> = [];
    const sink = newSink({ maxBatchBytes: 10, onDrop: (reason, count) => drops.push([reason, count]) });
    sink.send(signal("a"));
    expect(drops).toEqual([["oversize", 1]]);
  });

  it("sends text/plain with a CORS-simple content type and no other headers", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ contentType: "text/plain", fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(calls[0]!.init.headers).toEqual({ "content-type": "text/plain;charset=UTF-8" });
  });

  it("sends application/json with the configured custom headers", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ headers: { authorization: "Bearer token" }, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(calls[0]!.init.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer token",
    });
  });

  it("never sets keepalive on a normal fetch", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(calls[0]!.init).not.toHaveProperty("keepalive");
  });
});

describe("EdgeSink event identity", () => {
  it("assigns each queued event a UUIDv7 event_id", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    const eventId = JSON.parse(calls[0]!.init.body as string).batch[0].event_id as string;
    expect(eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps an event_id stable across a retry", async () => {
    const { fetchImpl, calls } = recordingFetch((call) => {
      if (call === 0) throw new Error("network down");
      return ok();
    });
    const sink = newSink({ batchSize: 1, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(500);
    const first = JSON.parse(calls[0]!.init.body as string).batch[0].event_id;
    const second = JSON.parse(calls[1]!.init.body as string).batch[0].event_id;
    expect(second).toBe(first);
  });

  it("increments seq for each queued event", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 2, fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    await sink.flush();
    const seqs = JSON.parse(calls[0]!.init.body as string).batch.map(
      (event: Record<string, unknown>) => event["seq"],
    );
    expect(seqs).toEqual([1, 2]);
  });

  it("wraps seq to 1 after the 32-bit maximum", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    (sink as unknown as { seq: number }).seq = 0xffff_ffff;
    sink.send(signal("a"));
    await sink.flush();
    const seq = JSON.parse(calls[0]!.init.body as string).batch[0].seq;
    expect(seq).toBe(1);
  });
});

describe("EdgeSink retry policy", () => {
  function failFirstThenOk(response: Response) {
    return recordingFetch((call) => (call === 0 ? response : ok()));
  }

  it("does not retry before the minimum jittered backoff", async () => {
    const { fetchImpl, calls } = recordingFetch((call) => {
      if (call === 0) throw new Error("network down");
      return ok();
    });
    const sink = newSink({ batchSize: 1, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(499);
    expect(calls.length).toBe(1);
  });

  it("retries before the maximum jittered backoff elapses", async () => {
    const { fetchImpl, calls } = recordingFetch((call) => {
      if (call === 0) throw new Error("network down");
      return ok();
    });
    const sink = newSink({ batchSize: 1, random: () => 0.999, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls.length).toBe(2);
  });

  it("doubles the backoff after each failed attempt", async () => {
    const { fetchImpl, calls } = recordingFetch(() => {
      throw new Error("network down");
    });
    const sink = newSink({ batchSize: 1, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(999);
    expect(calls.length).toBe(2);
  });

  it("honours a Retry-After in seconds over the backoff", async () => {
    const { fetchImpl, calls } = failFirstThenOk(status(429, { "retry-after": "5" }));
    const sink = newSink({ batchSize: 1, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(4999);
    expect(calls.length).toBe(1);
  });

  it("honours an HTTP-date Retry-After over the backoff", async () => {
    const now = 1_700_000_000_000;
    const when = new Date(now + 3000).toUTCString();
    const { fetchImpl, calls } = failFirstThenOk(status(503, { "retry-after": when }));
    const sink = newSink({ batchSize: 1, now: () => now, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls.length).toBe(1);
  });

  it("caps Retry-After at 60 seconds", async () => {
    const { fetchImpl, calls } = failFirstThenOk(status(503, { "retry-after": "9999" }));
    const sink = newSink({ batchSize: 1, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.length).toBe(2);
  });

  it("drops a batch on a non-retriable HTTP status", async () => {
    const drops: Array<[string, number]> = [];
    const { fetchImpl } = recordingFetch(() => status(400));
    const sink = newSink({
      batchSize: 1,
      fetchImpl,
      onDrop: (reason, count) => drops.push([reason, count]),
    });
    sink.send(signal("a"));
    await sink.flush();
    expect(drops).toEqual([["non_retriable", 1]]);
  });

  it("drops a batch after 5 retries on a retriable HTTP status", async () => {
    const { fetchImpl, calls } = recordingFetch(() => status(500));
    const sink = newSink({ batchSize: 1, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.runAllTimersAsync();
    expect(calls.length).toBe(6);
  });

  it("drops a batch after 3 network retries", async () => {
    const { fetchImpl, calls } = recordingFetch(() => {
      throw new Error("network down");
    });
    const sink = newSink({ batchSize: 1, random: () => 0, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await vi.runAllTimersAsync();
    expect(calls.length).toBe(4);
  });
});

describe("EdgeSink bounded queue and stats", () => {
  it("caps the queue at maxQueueEvents by dropping the oldest events", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 50, maxQueueEvents: 3, fetchImpl });
    for (const name of ["a", "b", "c", "d", "e"]) sink.send(signal(name));
    await sink.flush();
    expect(calls.map(bodyNames)).toEqual([["c", "d", "e"]]);
  });

  it("counts queue_full drops in stats", async () => {
    const { fetchImpl } = recordingFetch();
    const sink = newSink({ batchSize: 50, maxQueueEvents: 3, fetchImpl });
    for (const name of ["a", "b", "c", "d", "e"]) sink.send(signal(name));
    expect(sink.stats()).toEqual({ queued: 3, dropped: 2, sent: 0 });
  });

  it("notifies onDrop with queue_full when the queue cap drops events", async () => {
    const drops: number[] = [];
    const { fetchImpl } = recordingFetch();
    const sink = newSink({
      batchSize: 50,
      maxQueueEvents: 3,
      fetchImpl,
      onDrop: (reason, count) => {
        if (reason === "queue_full") drops.push(count);
      },
    });
    for (const name of ["a", "b", "c", "d", "e"]) sink.send(signal(name));
    expect(drops).toEqual([1, 1]);
  });

  it("caps the queue at maxQueueBytes by dropping the oldest events", async () => {
    const eventBytes = encoder.encode(
      JSON.stringify({
        name: "a",
        ts: 0,
        payload: {},
        event_id: uuidv7(1_700_000_000_000, () => new Uint8Array(16)),
        seq: 1,
      }),
    ).length;
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 50, maxQueueBytes: eventBytes, fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    await sink.flush();
    expect(calls.map(bodyNames)).toEqual([["b"]]);
  });

  it("reports sent events in stats after a successful flush", async () => {
    const { fetchImpl } = recordingFetch();
    const sink = newSink({ fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    await sink.flush();
    expect(sink.stats()).toEqual({ queued: 0, dropped: 0, sent: 2 });
  });
});

describe("EdgeSink offline and page lifecycle", () => {
  function fakeEventTarget(initial: Record<string, unknown> = {}) {
    const listeners = new Map<string, Set<(event: unknown) => void>>();
    return {
      ...initial,
      addEventListener(type: string, handler: (event: unknown) => void) {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(handler);
      },
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.get(type)?.delete(handler);
      },
      dispatch(type: string) {
        for (const handler of listeners.get(type) ?? []) handler({ type });
      },
    };
  }

  function installDom(online = true) {
    const fakeDocument = fakeEventTarget({ visibilityState: "visible" });
    const fakeWindow = fakeEventTarget();
    const fakeNavigator = { onLine: online };
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("window", fakeWindow);
    vi.stubGlobal("navigator", fakeNavigator);
    return { fakeDocument, fakeWindow, fakeNavigator };
  }

  it("does not schedule a retry timer while offline", async () => {
    installDom(false);
    const { fetchImpl } = recordingFetch(() => {
      throw new Error("network down");
    });
    const sink = newSink({ bindPageLifecycle: true, batchSize: 1, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resumes a paused retry on the online event", async () => {
    const { fakeWindow, fakeNavigator } = installDom(false);
    const { fetchImpl, calls } = recordingFetch((call) => {
      if (call === 0) throw new Error("network down");
      return ok();
    });
    const sink = newSink({ bindPageLifecycle: true, batchSize: 1, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    fakeNavigator.onLine = true;
    fakeWindow.dispatch("online");
    await sink.flush();
    expect(calls.length).toBe(2);
  });

  it("resends queued events on pageshow", async () => {
    const { fakeWindow } = installDom();
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ bindPageLifecycle: true, batchSize: 50, fetchImpl });
    sink.send(signal("a"));
    fakeWindow.dispatch("pageshow");
    await sink.flush();
    expect(calls.length).toBe(1);
  });

  it("resends queued events when the document becomes visible", async () => {
    const { fakeDocument } = installDom();
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ bindPageLifecycle: true, batchSize: 50, fetchImpl });
    sink.send(signal("a"));
    fakeDocument.visibilityState = "hidden";
    fakeDocument.dispatch("visibilitychange");
    fakeDocument.visibilityState = "visible";
    fakeDocument.dispatch("visibilitychange");
    await sink.flush();
    expect(calls.length).toBe(1);
  });

  it("beacons on pagehide when page lifecycle is bound", async () => {
    const { fakeWindow } = installDom();
    const beacons = beaconRecorder();
    const sink = newSink({ bindPageLifecycle: true, batchSize: 50, sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    fakeWindow.dispatch("pagehide");
    expect(beacons.calls.length).toBe(1);
  });

  it("beacons when the document becomes hidden", async () => {
    const { fakeDocument } = installDom();
    const beacons = beaconRecorder();
    const sink = newSink({ bindPageLifecycle: true, batchSize: 50, sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    fakeDocument.visibilityState = "hidden";
    fakeDocument.dispatch("visibilitychange");
    expect(beacons.calls.length).toBe(1);
  });

  it("clears pending timers on close", async () => {
    const { fetchImpl } = recordingFetch();
    const sink = newSink({ batchSize: 50, fetchImpl });
    sink.send(signal("a"));
    sink.close();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes page lifecycle listeners on close", async () => {
    const { fakeWindow } = installDom();
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ bindPageLifecycle: true, batchSize: 50, fetchImpl });
    sink.send(signal("a"));
    sink.close();
    fakeWindow.dispatch("pageshow");
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.length).toBe(0);
  });

  it("ignores send after close", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ fetchImpl });
    sink.close();
    sink.send(signal("a"));
    await sink.flush();
    expect(calls.length).toBe(0);
  });

  it("is idempotent when closed twice", () => {
    const sink = newSink();
    expect(() => {
      sink.close();
      sink.close();
    }).not.toThrow();
  });
});

describe("EdgeSink page end", () => {
  it("posts one beacon to the endpoint on flush({unloading:true})", async () => {
    const beacons = beaconRecorder();
    const sink = newSink({ sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    await sink.flush({ unloading: true });
    expect(beacons.calls.map((call) => call.url)).toEqual(["https://edge.test/collect"]);
  });

  it("beacons on flush while the document is hidden", async () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    const beacons = beaconRecorder();
    const sink = newSink({ sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    await sink.flush();
    expect(beacons.calls.length).toBe(1);
  });

  it("beacons a Blob with the application/json content type", async () => {
    const beacons = beaconRecorder();
    const sink = newSink({ sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    await sink.flush({ unloading: true });
    expect(beacons.calls[0]!.body.type).toBe("application/json");
  });

  it("beacons a Blob with the text/plain content type", async () => {
    const beacons = beaconRecorder();
    const sink = newSink({ contentType: "text/plain", sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    await sink.flush({ unloading: true });
    expect(beacons.calls[0]!.body.type).toBe("text/plain;charset=utf-8");
  });

  it("caps the page-end beacon at one batch of at most batchSize events", async () => {
    const beacons = beaconRecorder();
    const sink = newSink({ batchSize: 2, sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush({ unloading: true });
    const body = JSON.parse(await beacons.calls[0]!.body.text()) as { batch: unknown[] };
    expect(body.batch.length).toBe(2);
  });

  it("drops page-end overflow once the beacon succeeds", async () => {
    const drops: Array<[string, number]> = [];
    const beacons = beaconRecorder(true);
    const sink = newSink({
      batchSize: 2,
      sendBeacon: beacons.sendBeacon,
      onDrop: (reason, count) => drops.push([reason, count]),
    });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush({ unloading: true });
    expect(drops).toEqual([["page_end_overflow", 1]]);
  });

  it("keeps queued events when the page-end beacon is refused", async () => {
    const beacons = beaconRecorder(false);
    const sink = newSink({ batchSize: 50, sendBeacon: beacons.sendBeacon });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush({ unloading: true });
    expect(sink.stats().queued).toBe(3);
  });

  it("does not fetch when the page-end beacon is refused", async () => {
    const beacons = beaconRecorder(false);
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 50, sendBeacon: beacons.sendBeacon, fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush({ unloading: true });
    expect(calls.length).toBe(0);
  });

  it("keeps queued events when no beacon is available", async () => {
    const sink = newSink({ batchSize: 50 });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush({ unloading: true });
    expect(sink.stats().queued).toBe(3);
  });

  it("does not fetch when no beacon is available", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 50, fetchImpl });
    sink.send(signal("a"));
    sink.send(signal("b"));
    sink.send(signal("c"));
    await sink.flush({ unloading: true });
    expect(calls.length).toBe(0);
  });
});

describe("EdgeSink flush", () => {
  it("sends queued events immediately without waiting for the batch timer", async () => {
    const { fetchImpl, calls } = recordingFetch();
    const sink = newSink({ batchSize: 50, batchIntervalMs: 10_000, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(calls.length).toBe(1);
  });

  it("cancels the batch timer when flushing", async () => {
    const { fetchImpl } = recordingFetch();
    const sink = newSink({ batchSize: 50, batchIntervalMs: 10_000, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("respects a pending retry wait instead of sending immediately", async () => {
    const { fetchImpl, calls } = recordingFetch((call) => {
      if (call === 0) throw new Error("network down");
      return ok();
    });
    const sink = newSink({ batchSize: 1, fetchImpl });
    sink.send(signal("a"));
    await sink.flush();
    await sink.flush();
    expect(calls.length).toBe(1);
  });
});
