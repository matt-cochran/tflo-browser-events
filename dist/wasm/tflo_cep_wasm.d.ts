/* tslint:disable */
/* eslint-disable */

export class WasmCompiledPattern {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly name: string;
}

export class WasmPattern {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Finalize the pattern. Throws a `JsError` if the builder state is
     * invalid (no `when`, `not_then` without `within`, `not_then` not
     * terminal).
     *
     * # Errors
     *
     * Throws a JS-side `Error` when: (a) no `.when(...)` step was added,
     * (b) a `.notThen(...)` step has no paired `.within(...)`, or (c) a
     * `.notThen(...)` step is followed by another step (it must be
     * terminal).
     */
    emit(f: Function): WasmCompiledPattern;
    constructor(name: string);
    /**
     * Make the most recently added step **strictly contiguous** (`next`): the
     * event immediately following the previous capture must satisfy it, else the
     * partial match dies — expressing "B directly follows A" / "no event between
     * A and B". No-op on the initial `when` / on negatives.
     */
    next(): WasmPattern;
    /**
     * Attach an **interior-negation guard** (JS predicate) to the next positive
     * step: while the match skips events waiting for that step, any event
     * satisfying `p` kills the partial. Mirrors native `not_between`.
     */
    notBetween(p: Function): WasmPattern;
    notThen(p: Function): WasmPattern;
    notThenNamed(name: string, p: Function): WasmPattern;
    then(p: Function): WasmPattern;
    thenNamed(name: string, p: Function): WasmPattern;
    /**
     * Make the most recently added step a `repeated(min..=max)` quantifier: it
     * matches its predicate between `min` and `max` times (capturing each), then
     * advances. `min`/`max` are clamped to `1 <= min <= max`.
     */
    times(min: number, max: number): WasmPattern;
    /**
     * Set the event-time extractor. Required for correct `within(...)`
     * behavior; without it, every event is treated as ts=0.
     */
    timestamp(f: Function): WasmPattern;
    when(p: Function): WasmPattern;
    /**
     * Attach a within-bound (milliseconds) to the most recently added
     * step. Capped at `i32::MAX` (~24.8 days) so the JS-facing param is
     * `number`, not `bigint`.
     */
    within(ms: number): WasmPattern;
}

export class WasmPatternRuntime {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Signal end of input. Drains any pending negative-step matches.
     */
    flush(): Array<any>;
    /**
     * Wrap a finalized compiled pattern in a streaming runtime.
     *
     * # Errors
     *
     * Throws if the compiled pattern was already consumed (each
     * `WasmCompiledPattern` produces exactly one runtime).
     * Wrap a finalized compiled pattern in a streaming runtime. Pass
     * `maxLatenessMs` to enable the event-time **reorder buffer**: events that
     * arrive up to that many ms out of order are released to the matcher in
     * event-time order (later-than-that drop as `"late"`). Omit it for the
     * default in-order behaviour.
     */
    constructor(pattern: WasmCompiledPattern, max_lateness_ms?: number | null);
    /**
     * Push one event through the runtime. Returns a JS array of any
     * signals emitted by this event.
     */
    push(event: any): Array<any>;
    /**
     * Reset to the just-constructed state. The compiled pattern is kept;
     * in-flight partial matches are dropped.
     */
    reset(): void;
    /**
     * Register a JS callback invoked once for every partial match the
     * runtime discards. The callback receives the drop reason as a string:
     * `"max_in_flight"` (the bounded in-flight set overflowed) or
     * `"deadline"` (a positive step's `within` window closed unmatched).
     * Replaces any previously-set handler.
     */
    setDropHandler(handler: Function): void;
    /**
     * Advance logical time to `now` (ms) **without** consuming an event, firing
     * any deadline-reached matches — e.g. "A then no B within T" fires on
     * absence. Returns a JS array of emitted signals. The host drives this from
     * its clock (the browser provider schedules it at [`nextDeadline`]); the
     * engine reads no wall clock, so a tick-driven run stays byte-identical to an
     * event-driven one. `now` is a JS `number` (ms), matching the timestamp
     * convention.
     */
    tick(now: number): Array<any>;
    /**
     * Total number of partial matches dropped over this runtime's lifetime
     * (both `max_in_flight` and `deadline` reasons). Monotonic.
     */
    readonly droppedCount: number;
    /**
     * The earliest pending deadline (ms) across in-flight partials, or
     * `undefined` if no timer is pending. The host schedules its next
     * [`tick`](Self::tick) for this instant.
     */
    readonly nextDeadline: number | undefined;
}

/**
 * Initialize the panic hook for better error messages in the browser
 * console. Idempotent — safe to call multiple times.
 */
export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmcompiledpattern_free: (a: number, b: number) => void;
    readonly __wbg_wasmpattern_free: (a: number, b: number) => void;
    readonly __wbg_wasmpatternruntime_free: (a: number, b: number) => void;
    readonly wasmcompiledpattern_name: (a: number) => [number, number];
    readonly wasmpattern_emit: (a: number, b: any) => [number, number, number];
    readonly wasmpattern_new: (a: number, b: number) => number;
    readonly wasmpattern_next: (a: number) => number;
    readonly wasmpattern_notBetween: (a: number, b: any) => number;
    readonly wasmpattern_notThen: (a: number, b: any) => number;
    readonly wasmpattern_notThenNamed: (a: number, b: number, c: number, d: any) => number;
    readonly wasmpattern_then: (a: number, b: any) => number;
    readonly wasmpattern_thenNamed: (a: number, b: number, c: number, d: any) => number;
    readonly wasmpattern_times: (a: number, b: number, c: number) => number;
    readonly wasmpattern_timestamp: (a: number, b: any) => number;
    readonly wasmpattern_when: (a: number, b: any) => number;
    readonly wasmpattern_within: (a: number, b: number) => number;
    readonly wasmpatternruntime_droppedCount: (a: number) => number;
    readonly wasmpatternruntime_flush: (a: number) => any;
    readonly wasmpatternruntime_new: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmpatternruntime_nextDeadline: (a: number) => [number, number];
    readonly wasmpatternruntime_push: (a: number, b: any) => any;
    readonly wasmpatternruntime_reset: (a: number) => void;
    readonly wasmpatternruntime_setDropHandler: (a: number, b: any) => void;
    readonly wasmpatternruntime_tick: (a: number, b: number) => any;
    readonly start: () => void;
    readonly wasm_bindgen__convert__closures_____invoke__heff3b4cc98a51c26: (a: number, b: number, c: number, d: number) => any;
    readonly wasm_bindgen__convert__closures_____invoke__hf26baf85b200020d: (a: number, b: number) => any;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
