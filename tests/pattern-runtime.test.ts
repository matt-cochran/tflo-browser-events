/**
 * Integration tests for the Pattern + PatternRuntime wrapper.
 *
 * The WASM module is normally loaded by the browser via the `web`
 * target; for these tests, we load the `nodejs` target build via a
 * dynamic import. The wrapper API is identical — only the loading
 * differs.
 */

import { describe, expect, it } from "vitest";
import {
  WasmPattern,
  WasmPatternRuntime,
} from "../../tflo/tflo-cep-wasm/pkg-node/tflo_cep_wasm.js";

type Ev = { ts: number; kind: string; cartId?: string };

describe("WASM pattern runtime (via wrapper API surface)", () => {
  it("abandoned_cart: fires when no purchase arrives within window", () => {
    const compiled = new WasmPattern("abandoned_cart")
      .timestamp((e: Ev) => e.ts)
      .when((e: Ev) => e.kind === "add_to_cart")
      .notThen((e: Ev) => e.kind === "purchase")
      .within(5_000)
      .emit((m: { first: () => Ev }) => ({
        name: "abandoned_cart",
        payload: { cartId: m.first().cartId },
      }));
    const runtime = new WasmPatternRuntime(compiled);

    const collected: Array<{ name?: string; payload?: { cartId?: string } }> = [];
    const push = (e: Ev) => {
      const out = runtime.push(e);
      for (const o of out) collected.push(o);
    };

    push({ ts: 0, kind: "add_to_cart", cartId: "abc" });
    push({ ts: 1_000, kind: "view_page" });
    push({ ts: 2_000, kind: "view_page" });
    push({ ts: 6_500, kind: "view_page" }); // past deadline

    expect(collected.length).toBe(1);
    expect(collected[0]?.payload?.cartId).toBe("abc");
  });

  it("abandoned_cart: no emit when purchase arrives in time", () => {
    const compiled = new WasmPattern("abandoned_cart")
      .timestamp((e: Ev) => e.ts)
      .when((e: Ev) => e.kind === "add_to_cart")
      .notThen((e: Ev) => e.kind === "purchase")
      .within(5_000)
      .emit(() => ({ name: "abandoned_cart", payload: {} }));
    const runtime = new WasmPatternRuntime(compiled);

    const collected: unknown[] = [];
    const push = (e: Ev) => {
      const out = runtime.push(e);
      for (const o of out) collected.push(o);
    };

    push({ ts: 0, kind: "add_to_cart" });
    push({ ts: 2_000, kind: "purchase" });
    push({ ts: 10_000, kind: "view_page" });

    expect(collected.length).toBe(0);
  });

  it("engaged_with_product: fires on view → deep_scroll within 30s", () => {
    const compiled = new WasmPattern("engaged_with_product")
      .timestamp((e: Ev) => e.ts)
      .when((e: Ev) => e.kind === "product_view")
      .then((e: Ev) => e.kind === "deep_scroll")
      .within(30_000)
      .emit((m: { first: () => Ev; last: () => Ev }) => ({
        name: "engaged_with_product",
        payload: { viewedAt: m.first().ts, scrolledAt: m.last().ts },
      }));
    const runtime = new WasmPatternRuntime(compiled);

    const collected: Array<{ payload?: { viewedAt?: number; scrolledAt?: number } }> = [];
    const push = (e: Ev) => {
      const out = runtime.push(e);
      for (const o of out) collected.push(o);
    };

    push({ ts: 1_000, kind: "product_view" });
    push({ ts: 5_000, kind: "deep_scroll" });

    expect(collected.length).toBe(1);
    expect(collected[0]?.payload).toEqual({ viewedAt: 1_000, scrolledAt: 5_000 });
  });

  it("flush() drains pending negatives at end of stream", () => {
    const compiled = new WasmPattern("abandoned_cart")
      .timestamp((e: Ev) => e.ts)
      .when((e: Ev) => e.kind === "add_to_cart")
      .notThen((e: Ev) => e.kind === "purchase")
      .within(5_000)
      .emit(() => ({ name: "abandoned_cart", payload: { resolved: "flush" } }));
    const runtime = new WasmPatternRuntime(compiled);

    runtime.push({ ts: 0, kind: "add_to_cart" });
    runtime.push({ ts: 1_000, kind: "view_page" });

    const onFlush = runtime.flush();
    expect(onFlush.length).toBe(1);
  });

  it("builder error: emit without when throws", () => {
    expect(() => new WasmPattern("bad").emit(() => ({}))).toThrow();
  });

  it("builder error: notThen without within throws", () => {
    expect(() =>
      new WasmPattern("bad")
        .when((e: Ev) => e.kind === "a")
        .notThen((e: Ev) => e.kind === "b")
        .emit(() => ({})),
    ).toThrow();
  });
});
