import { describe, expect, it } from "vitest";
import {
  ATTESTRACK_MAX_ALLOWED_EVENTS,
  ATTESTRACK_MAX_BATCH,
  AttestrackAdapterError,
  toAttestrackV1,
  type AttestrackAdapterOptions,
  type AttestrackConsent,
} from "../src/adapters/attestrack.js";

// Fictional fixtures only.
const EPOCH_2026 = Date.UTC(2026, 0, 2, 3, 4, 5, 678); // 2026-01-02T03:04:05.678Z

function opts(over: Partial<AttestrackAdapterOptions> = {}): AttestrackAdapterOptions {
  return {
    siteId: "site-fixture-001",
    allowedEvents: ["cta_clicked", "section_read", "web_vital"],
    time: { mode: "epoch" },
    consent: "granted",
    ...over,
  };
}

function signal(name: string, ts: number, payload: Record<string, unknown> = {}) {
  return { name, ts, payload };
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function expectError(fn: () => unknown, code: string): AttestrackAdapterError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AttestrackAdapterError);
    expect((err as AttestrackAdapterError).code).toBe(code);
    return err as AttestrackAdapterError;
  }
  throw new Error(`expected AttestrackAdapterError ${code}`);
}

describe("toAttestrackV1: timestamps", () => {
  it("epoch mode reads ts as epoch milliseconds", () => {
    const [rec] = toAttestrackV1({ batch: [signal("cta_clicked", EPOCH_2026)] }, opts());
    expect(rec.occurredAt).toBe("2026-01-02T03:04:05.678Z");
  });

  it("monotonic mode adds ts to the given origin", () => {
    const batch = { batch: [signal("cta_clicked", 1_500)] };
    const a = toAttestrackV1(batch, opts({ time: { mode: "monotonic", timeOriginMs: EPOCH_2026 } }));
    const b = toAttestrackV1(batch, opts({ time: { mode: "monotonic", timeOriginMs: EPOCH_2026 + 60_000 } }));
    expect(a[0].occurredAt).toBe("2026-01-02T03:04:07.178Z");
    expect(b[0].occurredAt).toBe("2026-01-02T03:05:07.178Z");
  });

  it("does not guess: the same small ts is 1970 in epoch mode", () => {
    const [rec] = toAttestrackV1({ batch: [signal("cta_clicked", 1_500)] }, opts());
    expect(rec.occurredAt).toBe("1970-01-01T00:00:01.500Z");
  });

  it.each([
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["string", "1700000000000"],
    ["beyond Date range", 8.64e15 + 1],
  ])("rejects a %s ts", (_label, ts) => {
    const err = expectError(
      () => toAttestrackV1({ batch: [{ name: "cta_clicked", ts, payload: {} }] }, opts()),
      "invalid_timestamp",
    );
    expect(err.index).toBe(0);
  });

  it("rejects a monotonic ts that overflows the Date range", () => {
    expectError(
      () =>
        toAttestrackV1(
          { batch: [signal("cta_clicked", 10)] },
          opts({ time: { mode: "monotonic", timeOriginMs: 8.64e15 } }),
        ),
      "invalid_timestamp",
    );
  });

  it.each([
    [{ mode: "monotonic" }],
    [{ mode: "monotonic", timeOriginMs: Number.NaN }],
    [{ mode: "monotonic", timeOriginMs: -5 }],
    [{ mode: "auto" }],
    [undefined],
  ])("rejects time option %j", (time) => {
    expectError(
      () => toAttestrackV1({ batch: [] }, opts({ time: time as AttestrackAdapterOptions["time"] })),
      "invalid_options",
    );
  });
});

describe("toAttestrackV1: consent", () => {
  it.each<AttestrackConsent>(["declined", "withdrawn", null])(
    "%s emits nothing and never reads the input",
    (consent) => {
      const trap = new Proxy(
        {},
        {
          get() {
            throw new Error("input was read");
          },
          has() {
            throw new Error("input was read");
          },
          getOwnPropertyDescriptor() {
            throw new Error("input was read");
          },
          getPrototypeOf() {
            throw new Error("input was read");
          },
        },
      );
      expect(toAttestrackV1(trap, opts({ consent }))).toEqual([]);
      // Even a malformed batch is not inspected.
      expect(toAttestrackV1({ batch: "nope" }, opts({ consent }))).toEqual([]);
    },
  );

  it("rejects an unknown consent value", () => {
    expectError(
      () => toAttestrackV1({ batch: [] }, opts({ consent: "yes" as unknown as AttestrackConsent })),
      "invalid_options",
    );
    expectError(
      () => toAttestrackV1({ batch: [] }, opts({ consent: undefined as unknown as AttestrackConsent })),
      "invalid_options",
    );
  });

  it("stamps only consentDecision, never shadow fields", () => {
    const [rec] = toAttestrackV1(
      {
        batch: [
          signal("cta_clicked", EPOCH_2026, {
            consentMode: "basic",
            wouldAllow: true,
            jurisdiction: "EU",
            policy: "p1",
          }),
        ],
      },
      opts(),
    );
    expect(rec).toEqual({
      v: 1,
      eventName: "cta_clicked",
      siteId: "site-fixture-001",
      occurredAt: "2026-01-02T03:04:05.678Z",
      consentDecision: "granted",
    });
  });
});

describe("toAttestrackV1: trusted context", () => {
  it("ignores payload siteId, environment and consent", () => {
    const [rec] = toAttestrackV1(
      {
        batch: [
          signal("cta_clicked", EPOCH_2026, {
            siteId: "attacker-site",
            site_id: "attacker-site",
            environment: "production",
            consent: "granted",
            consentDecision: "declined",
          }),
        ],
      },
      opts(),
    );
    expect(rec.siteId).toBe("site-fixture-001");
    expect(rec.consentDecision).toBe("granted");
    expect(Object.keys(rec).sort()).toEqual(["consentDecision", "eventName", "occurredAt", "siteId", "v"]);
  });

  it("rejects payloads that could inherit fields through a prototype", () => {
    const payload = Object.create({ sessionId: "inherited" }) as Record<string, unknown>;
    expectError(() => toAttestrackV1({ batch: [{ name: "cta_clicked", ts: 1, payload }] }, opts()), "invalid_signal");
  });

  it.each([
    [{ siteId: "has space" }],
    [{ siteId: "" }],
    [{ siteId: "x".repeat(129) }],
    [{ allowedEvents: [] }],
    [{ allowedEvents: ["ok", "not ok"] }],
    [{ allowedEvents: Array.from({ length: ATTESTRACK_MAX_ALLOWED_EVENTS + 1 }, (_, i) => `e${i}`) }],
    [{ source: { expectedAppId: "app-1" } }],
    [{ source: { expectedEnvironment: "staging" } }],
  ])("rejects bad options %#", (over) => {
    expectError(
      () => toAttestrackV1({ batch: [] }, opts(over as Partial<AttestrackAdapterOptions>)),
      "invalid_options",
    );
  });

  it("accepts an allowlist of exactly the maximum size", () => {
    const allowedEvents = Array.from({ length: ATTESTRACK_MAX_ALLOWED_EVENTS }, (_, i) => `e${i}`);
    expect(toAttestrackV1({ batch: [signal("e63", 1)] }, opts({ allowedEvents }))).toHaveLength(1);
  });
});

describe("toAttestrackV1: field selection", () => {
  it("copies the selected semantic fields", () => {
    const [rec] = toAttestrackV1(
      {
        batch: [
          signal("section_read", EPOCH_2026, {
            sessionId: "sess_abc123",
            pagePath: "/pricing/plans",
            ctaType: "primary",
            section: "hero",
            scrollDepthPct: 75,
            dwellMs: 12_345,
            eventId: "evt-0001",
          }),
          signal("web_vital", EPOCH_2026, { webVitalName: "CLS", webVitalValue: 0.08 }),
        ],
      },
      opts(),
    );
    expect(rec).toEqual({
      v: 1,
      eventName: "section_read",
      siteId: "site-fixture-001",
      occurredAt: "2026-01-02T03:04:05.678Z",
      consentDecision: "granted",
      sessionId: "sess_abc123",
      pagePath: "/pricing/plans",
      ctaType: "primary",
      section: "hero",
      scrollDepthPct: 75,
      dwellMs: 12_345,
      eventId: "evt-0001",
    });
  });

  it("drops unknown signals and strips PII and raw extras", () => {
    const out = toAttestrackV1(
      {
        batch: [
          signal("js_error", EPOCH_2026, { message: "TypeError at alice@example.test" }),
          signal("form_submitted", EPOCH_2026, { email: "alice@example.test" }),
          signal("cta_clicked", EPOCH_2026, {
            ctaType: "signup",
            text: "Email alice@example.test",
            email: "alice@example.test",
            value: "4111 1111 1111 1111",
            visitorId: "v-123",
            referrer: "https://ref.example.test/?q=secret",
            utm_source: "newsletter",
            params: { a: 1 },
            message: "Error: boom",
            raw: { anything: true },
          }),
        ],
      },
      opts(),
    );
    expect(out).toEqual([
      {
        v: 1,
        eventName: "cta_clicked",
        siteId: "site-fixture-001",
        occurredAt: "2026-01-02T03:04:05.678Z",
        consentDecision: "granted",
        ctaType: "signup",
      },
    ]);
    expect(JSON.stringify(out)).not.toMatch(/alice|4111|ref\.example|newsletter|boom|v-123/);
  });

  it("strips the query and fragment from pagePath", () => {
    const [rec] = toAttestrackV1(
      { batch: [signal("cta_clicked", 1, { pagePath: "/reset?token=abc&email=a@example.test#frag" })] },
      opts(),
    );
    expect(rec.pagePath).toBe("/reset");
  });

  it.each([
    ["absolute URL", "https://example.test/x"],
    ["protocol-relative", "//evil.example.test/x"],
    ["backslash host", "/\\evil.example.test"],
    ["no leading slash", "pricing"],
    ["whitespace", "/a b"],
    ["empty", ""],
    ["too long", "/" + "a".repeat(512)],
    ["non-string", 42],
  ])("rejects a %s pagePath", (_label, pagePath) => {
    const err = expectError(
      () => toAttestrackV1({ batch: [signal("cta_clicked", 1, { pagePath })] }, opts()),
      "invalid_field",
    );
    expect(err.field).toBe("payload.pagePath");
  });

  it("never echoes rejected values in the error", () => {
    const err = expectError(
      () => toAttestrackV1({ batch: [signal("cta_clicked", 1, { ctaType: "alice@example.test x" })] }, opts()),
      "invalid_field",
    );
    expect(err.message).not.toContain("alice");
  });

  it("accepts a path of exactly the maximum length", () => {
    const pagePath = "/" + "a".repeat(511);
    expect(toAttestrackV1({ batch: [signal("cta_clicked", 1, { pagePath })] }, opts())[0].pagePath).toBe(pagePath);
  });

  it.each([
    ["sessionId", "free text with spaces"],
    ["sessionId", "x".repeat(129)],
    ["ctaType", "alice@example.test is here"],
    ["section", ""],
    ["eventId", { id: 1 }],
    ["scrollDepthPct", 101],
    ["scrollDepthPct", -1],
    ["scrollDepthPct", 50.5],
    ["scrollDepthPct", "50"],
    ["dwellMs", 86_400_001],
    ["dwellMs", -1],
    ["dwellMs", Number.POSITIVE_INFINITY],
    ["sessionId", null],
  ])("rejects %s = %j", (field, value) => {
    const err = expectError(
      () => toAttestrackV1({ batch: [signal("cta_clicked", 1, { [field]: value })] }, opts()),
      "invalid_field",
    );
    expect(err.field).toBe(`payload.${field}`);
  });

  it("accepts bounds at their edges", () => {
    const [rec] = toAttestrackV1(
      {
        batch: [
          signal("cta_clicked", 0, {
            sessionId: "s".repeat(128),
            scrollDepthPct: 100,
            dwellMs: 86_400_000,
          }),
        ],
      },
      opts(),
    );
    expect(rec).toMatchObject({ scrollDepthPct: 100, dwellMs: 86_400_000, occurredAt: "1970-01-01T00:00:00.000Z" });
  });

  it.each([
    [{ webVitalName: "LCP" }],
    [{ webVitalValue: 1200 }],
    [{ webVitalName: "FID", webVitalValue: 10 }],
    [{ webVitalName: "LCP", webVitalValue: Number.NaN }],
    [{ webVitalName: "LCP", webVitalValue: -1 }],
    [{ webVitalName: "LCP", webVitalValue: 600_001 }],
  ])("rejects web vital %j", (payload) => {
    expectError(() => toAttestrackV1({ batch: [signal("web_vital", 1, payload)] }, opts()), "invalid_field");
  });
});

describe("toAttestrackV1: batch shape and atomicity", () => {
  it("returns [] for an empty batch", () => {
    expect(toAttestrackV1({ batch: [] }, opts())).toEqual([]);
  });

  it(`accepts ${ATTESTRACK_MAX_BATCH} signals and rejects ${ATTESTRACK_MAX_BATCH + 1}`, () => {
    const make = (n: number) => ({ batch: Array.from({ length: n }, (_, i) => signal("cta_clicked", i)) });
    expect(toAttestrackV1(make(ATTESTRACK_MAX_BATCH), opts())).toHaveLength(ATTESTRACK_MAX_BATCH);
    expectError(() => toAttestrackV1(make(ATTESTRACK_MAX_BATCH + 1), opts()), "batch_too_large");
  });

  it.each([[null], [undefined], [[]], ["batch"], [{}], [{ batch: {} }], [{ batch: "x" }]])(
    "rejects input %j",
    (input) => {
      expectError(() => toAttestrackV1(input, opts()), "invalid_input");
    },
  );

  it.each([
    [null],
    [[]],
    [{ name: 1, ts: 1, payload: {} }],
    [{ name: "cta_clicked", ts: 1 }],
    [{ name: "cta_clicked", ts: 1, payload: [] }],
    [{ name: "cta_clicked", ts: 1, payload: "x" }],
  ])("rejects signal %j", (bad) => {
    expectError(() => toAttestrackV1({ batch: [signal("cta_clicked", 1), bad] }, opts()), "invalid_signal");
  });

  it("one malformed signal fails the whole batch with no partial output", () => {
    const batch = {
      batch: [
        signal("cta_clicked", EPOCH_2026, { ctaType: "primary" }),
        signal("section_read", EPOCH_2026, { scrollDepthPct: 250 }),
        signal("cta_clicked", EPOCH_2026, { ctaType: "secondary" }),
      ],
    };
    let result: unknown = "unset";
    const err = expectError(() => {
      result = toAttestrackV1(batch, opts());
    }, "invalid_field");
    expect(result).toBe("unset");
    expect(err.index).toBe(1);
  });

  it("validates dropped (non-allowlisted) signals too", () => {
    expectError(
      () => toAttestrackV1({ batch: [signal("cta_clicked", 1), signal("not_allowed", -1)] }, opts()),
      "invalid_timestamp",
    );
  });
});

describe("toAttestrackV1: source binding", () => {
  const source = { expectedAppId: "app-fixture", expectedEnvironment: "staging" };
  const bound = (payload: Record<string, unknown> = {}) => ({
    app_id: "app-fixture",
    environment: "staging",
    ...payload,
  });

  it("accepts a batch that matches and does not copy the identity", () => {
    const out = toAttestrackV1(
      { batch: [signal("cta_clicked", 1, bound({ ctaType: "primary" }))] },
      opts({ source }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("app_id");
    expect(out[0]).not.toHaveProperty("environment");
    expect(out[0].siteId).toBe("site-fixture-001");
  });

  it.each([
    ["other app", { app_id: "app-other", environment: "staging" }, "payload.app_id"],
    ["other environment", { app_id: "app-fixture", environment: "production" }, "payload.environment"],
    ["missing app_id", { environment: "staging" }, "payload.app_id"],
    ["missing environment", { app_id: "app-fixture" }, "payload.environment"],
  ])("rejects the whole batch on %s", (_label, identity, field) => {
    const err = expectError(
      () =>
        toAttestrackV1(
          { batch: [signal("cta_clicked", 1, bound()), signal("cta_clicked", 2, identity)] },
          opts({ source }),
        ),
      "source_mismatch",
    );
    expect(err.index).toBe(1);
    expect(err.field).toBe(field);
  });

  it("rejects cross-cohort mixing even on a non-allowlisted signal", () => {
    expectError(
      () =>
        toAttestrackV1(
          {
            batch: [
              signal("cta_clicked", 1, bound()),
              signal("not_allowed", 2, { app_id: "app-other", environment: "staging" }),
            ],
          },
          opts({ source }),
        ),
      "source_mismatch",
    );
  });

  it("ignores payload identity when no binding is configured", () => {
    const out = toAttestrackV1(
      { batch: [signal("cta_clicked", 1, { app_id: "anything", environment: "whatever" })] },
      opts(),
    );
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0])).not.toContain("app_id");
  });
});

describe("toAttestrackV1: purity", () => {
  it("does not mutate its arguments", () => {
    const input = {
      batch: [
        signal("cta_clicked", EPOCH_2026, {
          ctaType: "primary",
          pagePath: "/a?b=c",
          email: "alice@example.test",
          app_id: "app-fixture",
          environment: "staging",
        }),
        signal("section_read", EPOCH_2026, { app_id: "app-fixture", environment: "staging" }),
      ],
    };
    const options = opts({
      time: { mode: "monotonic", timeOriginMs: 0 },
      source: { expectedAppId: "app-fixture", expectedEnvironment: "staging" },
    });
    const inputCopy = structuredClone(input);
    const optionsCopy = structuredClone(options);
    deepFreeze(input);
    deepFreeze(options);

    const out = toAttestrackV1(input, options);
    expect(out).toHaveLength(2);
    expect(input).toEqual(inputCopy);
    expect(options).toEqual(optionsCopy);

    // Output does not alias input objects.
    out[0].ctaType = "changed";
    expect(input.batch[0].payload.ctaType).toBe("primary");
  });

  it("is deterministic for the same arguments", () => {
    const input = { batch: [signal("cta_clicked", EPOCH_2026, { sessionId: "s1" })] };
    expect(toAttestrackV1(input, opts())).toEqual(toAttestrackV1(input, opts()));
  });
});
