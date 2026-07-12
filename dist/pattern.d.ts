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
import { type WasmCompiledPattern } from "./wasm/tflo_cep_wasm.js";
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
export declare class Pattern<E extends {
    ts: number;
} = EventRecord> {
    private inner;
    private finalized;
    constructor(name: string);
    /**
     * Configure event-time extraction. Defaults to `e => e.ts` when not
     * called — convenient for the standard `EventRecord` shape.
     */
    timestamp(fn: (e: E) => number): this;
    when(predicate: (e: E) => boolean): this;
    then(predicate: (e: E) => boolean): this;
    thenNamed(name: string, predicate: (e: E) => boolean): this;
    notThen(predicate: (e: E) => boolean): this;
    notThenNamed(name: string, predicate: (e: E) => boolean): this;
    /** Time bound (milliseconds) on the previous step. */
    within(ms: number): this;
    /**
     * Finalize. The emit closure receives a `Match<E>` and returns the
     * payload (or a partial signal) to ship.
     *
     * Throws if the builder state is invalid.
     */
    emit(fn: (m: Match<E>) => EmitOutput): CompiledPattern<E>;
    /** Internal — disposes the WASM handle if the pattern was never
     * finalized. */
    destroy(): void;
}
/** A finalized pattern, ready to drive a runtime. */
export declare class CompiledPattern<E extends {
    ts: number;
} = EventRecord> {
    readonly name: string;
    readonly inner: WasmCompiledPattern;
    private readonly __eventBrand;
    constructor(inner: WasmCompiledPattern);
    /** Free the underlying WASM resources. The compiled pattern cannot
     * be used after this call. */
    destroy(): void;
}
/**
 * The streaming pattern runtime. Push events one at a time; collect
 * emitted signals from the return value (or via `flush()` on stream end).
 */
export declare class PatternRuntime<E extends {
    ts: number;
} = EventRecord> {
    private readonly inner;
    readonly patternName: string;
    constructor(pattern: CompiledPattern<E>);
    /** Push one event. Returns any signals emitted as a result. */
    push(event: E): DerivedSignal[];
    /** End-of-stream — drain pending negative matches whose deadlines
     * haven't elapsed yet. */
    flush(): DerivedSignal[];
    /** Reset to fresh state. The compiled pattern is preserved. */
    reset(): void;
    /** Release the underlying WASM resources. */
    destroy(): void;
    private normalize;
}
//# sourceMappingURL=pattern.d.ts.map