/**
 * Typed `Pattern` builder — TypeScript wrapper around the WASM
 * `WasmPattern` / `WasmPatternRuntime`. The wrapper exists for two
 * reasons:
 *
 * 1. Generic event types: WASM takes `any`; TS lets the user write
 *    `Pattern<MyEvent>` and get type-checked predicates/emit.
 * 2. Match type ergonomics: WASM hands the emit closure an object with
 *    methods; the wrapper documents the surface and the TS types.
 */

import {
  WasmPattern,
  WasmPatternRuntime,
  type WasmCompiledPattern,
} from "./wasm/tflo_cep_wasm.js";
import type { EventRecord, DerivedSignal } from "./types.js";

/**
 * What an emit closure receives — captured events from a successful
 * match. Methods mirror the Rust `Match<E>` API.
 */
export interface Match<E> {
  readonly patternName: string;
  readonly length: number;
  first(): E;
  last(): E;
  all(): E[];
  at(stepName: string): E | undefined;
}

/**
 * Output shape an emit closure may produce. The pattern name and `ts`
 * are filled in by the runtime if omitted.
 */
export type EmitOutput = Partial<DerivedSignal> & {
  payload?: Record<string, unknown>;
};

/**
 * The pattern builder. Chain steps and finalize with `.emit(...)`.
 */
export class Pattern<E extends { ts: number } = EventRecord> {
  // The internal WASM builder is mutated in place by each step; the
  // wrapper holds the handle.
  private inner: WasmPattern;
  private finalized = false;

  constructor(name: string) {
    this.inner = new WasmPattern(name);
  }

  /**
   * Configure event-time extraction. Defaults to `e => e.ts` when not
   * called — convenient for the standard `EventRecord` shape.
   */
  timestamp(fn: (e: E) => number): this {
    this.inner = this.inner.timestamp((e: unknown) => fn(e as E));
    return this;
  }

  when(predicate: (e: E) => boolean): this {
    this.inner = this.inner.when((e: unknown) => predicate(e as E));
    return this;
  }

  then(predicate: (e: E) => boolean): this {
    this.inner = this.inner.then((e: unknown) => predicate(e as E));
    return this;
  }

  thenNamed(name: string, predicate: (e: E) => boolean): this {
    this.inner = this.inner.thenNamed(name, (e: unknown) => predicate(e as E));
    return this;
  }

  notThen(predicate: (e: E) => boolean): this {
    this.inner = this.inner.notThen((e: unknown) => predicate(e as E));
    return this;
  }

  notThenNamed(name: string, predicate: (e: E) => boolean): this {
    this.inner = this.inner.notThenNamed(name, (e: unknown) => predicate(e as E));
    return this;
  }

  /** Time bound (milliseconds) on the previous step. */
  within(ms: number): this {
    this.inner = this.inner.within(ms);
    return this;
  }

  /**
   * Finalize. The emit closure receives a `Match<E>` and returns the
   * payload (or a partial signal) to ship.
   *
   * Throws if the builder state is invalid.
   */
  emit(fn: (m: Match<E>) => EmitOutput): CompiledPattern<E> {
    const compiled = this.inner.emit((rawMatch: unknown) => {
      const match = rawMatch as Match<E>;
      const out = fn(match);
      return out;
    });
    this.finalized = true;
    return new CompiledPattern<E>(compiled);
  }

  /** Internal — disposes the WASM handle if the pattern was never
   * finalized. */
  destroy(): void {
    if (!this.finalized) {
      this.inner.free();
    }
  }
}

/** A finalized pattern, ready to drive a runtime. */
export class CompiledPattern<E extends { ts: number } = EventRecord> {
  readonly name: string;
  readonly inner: WasmCompiledPattern;
  // Phantom brand: forces the type parameter to be load-bearing so a
  // `CompiledPattern<MyEvent>` is not assignable to `CompiledPattern<OtherEvent>`.
  declare private readonly __eventBrand: E | undefined;

  constructor(inner: WasmCompiledPattern) {
    this.inner = inner;
    this.name = inner.name;
  }

  /** Free the underlying WASM resources. The compiled pattern cannot
   * be used after this call. */
  destroy(): void {
    this.inner.free();
  }
}

/**
 * The streaming pattern runtime. Push events one at a time; collect
 * emitted signals from the return value (or via `flush()` on stream end).
 */
export class PatternRuntime<E extends { ts: number } = EventRecord> {
  private readonly inner: WasmPatternRuntime;
  readonly patternName: string;

  constructor(pattern: CompiledPattern<E>) {
    this.inner = new WasmPatternRuntime(pattern.inner);
    this.patternName = pattern.name;
  }

  /** Push one event. Returns any signals emitted as a result. */
  push(event: E): DerivedSignal[] {
    const raw = this.inner.push(event);
    return this.normalize(raw);
  }

  /** End-of-stream — drain pending negative matches whose deadlines
   * haven't elapsed yet. */
  flush(): DerivedSignal[] {
    const raw = this.inner.flush();
    return this.normalize(raw);
  }

  /** Reset to fresh state. The compiled pattern is preserved. */
  reset(): void {
    this.inner.reset();
  }

  /** Release the underlying WASM resources. */
  destroy(): void {
    this.inner.free();
  }

  private normalize(raw: Array<unknown>): DerivedSignal[] {
    const out: DerivedSignal[] = [];
    const now = performance.now();
    for (const item of raw) {
      const partial = (item ?? {}) as EmitOutput;
      out.push({
        name: partial.name ?? this.patternName,
        ts: partial.ts ?? now,
        payload: partial.payload ?? {},
        sinks: partial.sinks,
      });
    }
    return out;
  }
}
