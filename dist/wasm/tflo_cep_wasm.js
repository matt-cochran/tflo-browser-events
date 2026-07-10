/* @ts-self-types="./tflo_cep_wasm.d.ts" */

export class WasmCompiledPattern {
    static __wrap(ptr) {
        const obj = Object.create(WasmCompiledPattern.prototype);
        obj.__wbg_ptr = ptr;
        WasmCompiledPatternFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmCompiledPatternFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmcompiledpattern_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get name() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmcompiledpattern_name(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WasmCompiledPattern.prototype[Symbol.dispose] = WasmCompiledPattern.prototype.free;

export class WasmPattern {
    static __wrap(ptr) {
        const obj = Object.create(WasmPattern.prototype);
        obj.__wbg_ptr = ptr;
        WasmPatternFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPatternFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpattern_free(ptr, 0);
    }
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
     * @param {Function} f
     * @returns {WasmCompiledPattern}
     */
    emit(f) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_emit(ptr, f);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmCompiledPattern.__wrap(ret[0]);
    }
    /**
     * @param {string} name
     */
    constructor(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpattern_new(ptr0, len0);
        this.__wbg_ptr = ret;
        WasmPatternFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Make the most recently added step **strictly contiguous** (`next`): the
     * event immediately following the previous capture must satisfy it, else the
     * partial match dies — expressing "B directly follows A" / "no event between
     * A and B". No-op on the initial `when` / on negatives.
     * @returns {WasmPattern}
     */
    next() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_next(ptr);
        return WasmPattern.__wrap(ret);
    }
    /**
     * Attach an **interior-negation guard** (JS predicate) to the next positive
     * step: while the match skips events waiting for that step, any event
     * satisfying `p` kills the partial. Mirrors native `not_between`.
     * @param {Function} p
     * @returns {WasmPattern}
     */
    notBetween(p) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_notBetween(ptr, p);
        return WasmPattern.__wrap(ret);
    }
    /**
     * @param {Function} p
     * @returns {WasmPattern}
     */
    notThen(p) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_notThen(ptr, p);
        return WasmPattern.__wrap(ret);
    }
    /**
     * @param {string} name
     * @param {Function} p
     * @returns {WasmPattern}
     */
    notThenNamed(name, p) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpattern_notThenNamed(ptr, ptr0, len0, p);
        return WasmPattern.__wrap(ret);
    }
    /**
     * @param {Function} p
     * @returns {WasmPattern}
     */
    then(p) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_then(ptr, p);
        return WasmPattern.__wrap(ret);
    }
    /**
     * @param {string} name
     * @param {Function} p
     * @returns {WasmPattern}
     */
    thenNamed(name, p) {
        const ptr = this.__destroy_into_raw();
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmpattern_thenNamed(ptr, ptr0, len0, p);
        return WasmPattern.__wrap(ret);
    }
    /**
     * Make the most recently added step a `repeated(min..=max)` quantifier: it
     * matches its predicate between `min` and `max` times (capturing each), then
     * advances. `min`/`max` are clamped to `1 <= min <= max`.
     * @param {number} min
     * @param {number} max
     * @returns {WasmPattern}
     */
    times(min, max) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_times(ptr, min, max);
        return WasmPattern.__wrap(ret);
    }
    /**
     * Set the event-time extractor. Required for correct `within(...)`
     * behavior; without it, every event is treated as ts=0.
     * @param {Function} f
     * @returns {WasmPattern}
     */
    timestamp(f) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_timestamp(ptr, f);
        return WasmPattern.__wrap(ret);
    }
    /**
     * @param {Function} p
     * @returns {WasmPattern}
     */
    when(p) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_when(ptr, p);
        return WasmPattern.__wrap(ret);
    }
    /**
     * Attach a within-bound (milliseconds) to the most recently added
     * step. Capped at `i32::MAX` (~24.8 days) so the JS-facing param is
     * `number`, not `bigint`.
     * @param {number} ms
     * @returns {WasmPattern}
     */
    within(ms) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.wasmpattern_within(ptr, ms);
        return WasmPattern.__wrap(ret);
    }
}
if (Symbol.dispose) WasmPattern.prototype[Symbol.dispose] = WasmPattern.prototype.free;

export class WasmPatternRuntime {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPatternRuntimeFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpatternruntime_free(ptr, 0);
    }
    /**
     * Total number of partial matches dropped over this runtime's lifetime
     * (both `max_in_flight` and `deadline` reasons). Monotonic.
     * @returns {number}
     */
    get droppedCount() {
        const ret = wasm.wasmpatternruntime_droppedCount(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Signal end of input. Drains any pending negative-step matches.
     * @returns {Array<any>}
     */
    flush() {
        const ret = wasm.wasmpatternruntime_flush(this.__wbg_ptr);
        return ret;
    }
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
     * @param {WasmCompiledPattern} pattern
     * @param {number | null} [max_lateness_ms]
     */
    constructor(pattern, max_lateness_ms) {
        _assertClass(pattern, WasmCompiledPattern);
        var ptr0 = pattern.__destroy_into_raw();
        const ret = wasm.wasmpatternruntime_new(ptr0, !isLikeNone(max_lateness_ms), isLikeNone(max_lateness_ms) ? 0 : max_lateness_ms);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        WasmPatternRuntimeFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * The earliest pending deadline (ms) across in-flight partials, or
     * `undefined` if no timer is pending. The host schedules its next
     * [`tick`](Self::tick) for this instant.
     * @returns {number | undefined}
     */
    get nextDeadline() {
        const ret = wasm.wasmpatternruntime_nextDeadline(this.__wbg_ptr);
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * Push one event through the runtime. Returns a JS array of any
     * signals emitted by this event.
     * @param {any} event
     * @returns {Array<any>}
     */
    push(event) {
        const ret = wasm.wasmpatternruntime_push(this.__wbg_ptr, event);
        return ret;
    }
    /**
     * Reset to the just-constructed state. The compiled pattern is kept;
     * in-flight partial matches are dropped.
     */
    reset() {
        wasm.wasmpatternruntime_reset(this.__wbg_ptr);
    }
    /**
     * Register a JS callback invoked once for every partial match the
     * runtime discards. The callback receives the drop reason as a string:
     * `"max_in_flight"` (the bounded in-flight set overflowed) or
     * `"deadline"` (a positive step's `within` window closed unmatched).
     * Replaces any previously-set handler.
     * @param {Function} handler
     */
    setDropHandler(handler) {
        wasm.wasmpatternruntime_setDropHandler(this.__wbg_ptr, handler);
    }
    /**
     * Advance logical time to `now` (ms) **without** consuming an event, firing
     * any deadline-reached matches — e.g. "A then no B within T" fires on
     * absence. Returns a JS array of emitted signals. The host drives this from
     * its clock (the browser provider schedules it at [`nextDeadline`]); the
     * engine reads no wall clock, so a tick-driven run stays byte-identical to an
     * event-driven one. `now` is a JS `number` (ms), matching the timestamp
     * convention.
     * @param {number} now
     * @returns {Array<any>}
     */
    tick(now) {
        const ret = wasm.wasmpatternruntime_tick(this.__wbg_ptr, now);
        return ret;
    }
}
if (Symbol.dispose) WasmPatternRuntime.prototype[Symbol.dispose] = WasmPatternRuntime.prototype.free;

/**
 * Initialize the panic hook for better error messages in the browser
 * console. Idempotent — safe to call multiple times.
 */
export function start() {
    wasm.start();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_ef53bc310eb298a0: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_is_falsy_d7ed49840e6d9abb: function(arg0) {
            const ret = !arg0;
            return ret;
        },
        __wbg___wbindgen_number_get_9bb1761122181af2: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_throw_1506f2235d1bdba0: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_40e4174f169eaca7: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_call_9c758de292015997: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_ce1ab61c1c2b300d: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_d90091b82fdf5b91: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_push_a6822215aa43e71c: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_set_6e30c9374c26414c: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [String], shim_idx: 17, ret: Externref, inner_ret: Some(Externref) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__heff3b4cc98a51c26);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 19, ret: Externref, inner_ret: Some(Externref) }, mutable: false }) -> Externref`.
            const ret = makeClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__hf26baf85b200020d);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./tflo_cep_wasm_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__hf26baf85b200020d(arg0, arg1) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__hf26baf85b200020d(arg0, arg1);
    return ret;
}

function wasm_bindgen__convert__closures_____invoke__heff3b4cc98a51c26(arg0, arg1, arg2) {
    const ptr0 = passStringToWasm0(arg2, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__heff3b4cc98a51c26(arg0, arg1, ptr0, len0);
    return ret;
}

const WasmCompiledPatternFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmcompiledpattern_free(ptr, 1));
const WasmPatternFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpattern_free(ptr, 1));
const WasmPatternRuntimeFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpatternruntime_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        try {
            return f(state.a, state.b, ...args);
        } finally {
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('tflo_cep_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
