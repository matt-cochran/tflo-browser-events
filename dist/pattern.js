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
import { WasmPattern, WasmPatternRuntime, } from "./wasm/tflo_cep_wasm.js";
/**
 * The pattern builder. Chain steps and finalize with `.emit(...)`.
 */
export class Pattern {
    // The internal WASM builder is mutated in place by each step; the
    // wrapper holds the handle.
    inner;
    finalized = false;
    constructor(name) {
        this.inner = new WasmPattern(name);
    }
    /**
     * Configure event-time extraction. Defaults to `e => e.ts` when not
     * called — convenient for the standard `EventRecord` shape.
     */
    timestamp(fn) {
        this.inner = this.inner.timestamp((e) => fn(e));
        return this;
    }
    when(predicate) {
        this.inner = this.inner.when((e) => predicate(e));
        return this;
    }
    then(predicate) {
        this.inner = this.inner.then((e) => predicate(e));
        return this;
    }
    thenNamed(name, predicate) {
        this.inner = this.inner.thenNamed(name, (e) => predicate(e));
        return this;
    }
    notThen(predicate) {
        this.inner = this.inner.notThen((e) => predicate(e));
        return this;
    }
    notThenNamed(name, predicate) {
        this.inner = this.inner.notThenNamed(name, (e) => predicate(e));
        return this;
    }
    /** Time bound (milliseconds) on the previous step. */
    within(ms) {
        this.inner = this.inner.within(ms);
        return this;
    }
    /**
     * Finalize. The emit closure receives a `Match<E>` and returns the
     * payload (or a partial signal) to ship.
     *
     * Throws if the builder state is invalid.
     */
    emit(fn) {
        const compiled = this.inner.emit((rawMatch) => {
            const match = rawMatch;
            const out = fn(match);
            return out;
        });
        this.finalized = true;
        return new CompiledPattern(compiled);
    }
    /** Internal — disposes the WASM handle if the pattern was never
     * finalized. */
    destroy() {
        if (!this.finalized) {
            this.inner.free();
        }
    }
}
/** A finalized pattern, ready to drive a runtime. */
export class CompiledPattern {
    name;
    inner;
    constructor(inner) {
        this.inner = inner;
        this.name = inner.name;
    }
    /** Free the underlying WASM resources. The compiled pattern cannot
     * be used after this call. */
    destroy() {
        this.inner.free();
    }
}
/**
 * The streaming pattern runtime. Push events one at a time; collect
 * emitted signals from the return value (or via `flush()` on stream end).
 */
export class PatternRuntime {
    inner;
    patternName;
    constructor(pattern) {
        this.inner = new WasmPatternRuntime(pattern.inner);
        this.patternName = pattern.name;
    }
    /** Push one event. Returns any signals emitted as a result. */
    push(event) {
        const raw = this.inner.push(event);
        return this.normalize(raw);
    }
    /** End-of-stream — drain pending negative matches whose deadlines
     * haven't elapsed yet. */
    flush() {
        const raw = this.inner.flush();
        return this.normalize(raw);
    }
    /** Reset to fresh state. The compiled pattern is preserved. */
    reset() {
        this.inner.reset();
    }
    /** Release the underlying WASM resources. */
    destroy() {
        this.inner.free();
    }
    normalize(raw) {
        const out = [];
        const now = performance.now();
        for (const item of raw) {
            const partial = (item ?? {});
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
//# sourceMappingURL=pattern.js.map