/**
 * `TFloBrowser` — the top-level SDK class.
 *
 * Wires three independent layers together:
 *
 * - **Capture**: the user binds events via `tflo.capture(...)`. Captured
 *   events flow into the runtimes.
 * - **Patterns**: the user attaches one or more compiled patterns via
 *   `addPattern(...)`. Each pattern owns its own `PatternRuntime`.
 * - **Sinks**: registered at construction or via `router.register(...)`.
 *
 * The three are decoupled. Tests can run any layer in isolation:
 * patterns + sinks without DOM (just call `ingest(...)`); capture
 * without patterns (just observe the recorded events); sinks alone.
 *
 * The class is browser-friendly but DOM-agnostic — it only touches the
 * DOM when the user calls `capture(...)`, and gracefully no-ops on
 * `visibilitychange` flush when `document` is absent.
 */

import { capture as bindCapture, type CaptureOptions, type CaptureHandler } from "./capture.js";
import init from "./wasm/tflo_cep_wasm.js";
import {
  captureViewport as bindCaptureViewport,
  type CaptureViewportOptions,
} from "./observers/viewport.js";
import { CompiledPattern, PatternRuntime } from "./pattern.js";
import { SinkRouter } from "./sinks/index.js";
import type { DerivedSignal, EventRecord, Sink } from "./types.js";

export interface TFloBrowserOptions {
  /** Sinks to route emitted signals to. */
  sinks?: Sink[];
  /** Optional consent gate. When set and returning `false`, signals are
   * captured and matched but **not** routed to sinks. */
  consent?: () => boolean;
  /** Path to the WASM file. Defaults to relative to the JS bundle. Some
   * bundlers (Vite, Webpack 5) handle this automatically; for others,
   * pass an absolute URL or a `URL` object. */
  wasmUrl?: string | URL;
  /** Error sink — receives delivery errors from individual sinks. */
  onSinkError?: (sinkName: string, err: unknown) => void;
}

/**
 * The default page-context hooks. When `document` is absent (Node tests,
 * non-DOM workers), these gracefully no-op.
 */
function bindVisibilityChange(onHidden: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const handler = () => {
    if (document.visibilityState === "hidden") onHidden();
  };
  document.addEventListener("visibilitychange", handler);
  return () => document.removeEventListener("visibilitychange", handler);
}

export class TFloBrowser {
  readonly router: SinkRouter;
  private readonly runtimes = new Map<string, PatternRuntime>();
  private readonly unbinders: Array<() => void> = [];
  private readonly consent?: () => boolean;
  private readonly opts: TFloBrowserOptions;
  private initialized: Promise<void> | null = null;

  constructor(opts: TFloBrowserOptions = {}) {
    this.opts = opts;
    this.consent = opts.consent;
    this.router = new SinkRouter({
      sinks: opts.sinks,
      onError: opts.onSinkError,
    });
    this.unbinders.push(
      bindVisibilityChange(() => {
        void this.router.flushAll();
      }),
    );
  }

  /**
   * Initialize WASM. Must be awaited before pushing events.
   * Idempotent — calling it more than once returns the same promise.
   */
  async init(): Promise<void> {
    if (!this.initialized) {
      const wasmUrl = this.opts.wasmUrl;
      this.initialized = wasmUrl ? init({ module_or_path: wasmUrl }).then(() => {}) : init().then(() => {});
    }
    await this.initialized;
  }

  /**
   * Attach a compiled pattern. The SDK creates a runtime for it.
   * Returns the runtime so the caller can `.reset()` or inspect it.
   */
  addPattern<E extends { ts: number } = EventRecord>(
    compiled: CompiledPattern<E>,
  ): PatternRuntime<E> {
    const runtime = new PatternRuntime<E>(compiled);
    this.runtimes.set(compiled.name, runtime as unknown as PatternRuntime);
    return runtime;
  }

  /**
   * Remove an attached pattern by name. Frees its runtime.
   */
  removePattern(name: string): void {
    const r = this.runtimes.get(name);
    if (!r) return;
    r.destroy();
    this.runtimes.delete(name);
  }

  /**
   * Push an event through every attached pattern. Signals emitted are
   * routed to sinks (gated by `consent()`).
   *
   * Returns an array of all signals emitted by all patterns — useful
   * for tests; production callers typically ignore the return value
   * and rely on sink delivery.
   */
  ingest(event: EventRecord): DerivedSignal[] {
    const emitted: DerivedSignal[] = [];
    for (const runtime of this.runtimes.values()) {
      for (const signal of runtime.push(event)) emitted.push(signal);
    }
    this.routeAll(emitted);
    return emitted;
  }

  /**
   * Convenience: bind a capture and route its events into `ingest`.
   * Returns the unbind function so callers can selectively detach.
   */
  capture<E extends Event = Event>(opts: CaptureOptions<E>): () => void {
    const handler: CaptureHandler = (record) => {
      this.ingest(record);
    };
    const unbind = bindCapture(opts, handler);
    this.unbinders.push(unbind);
    return unbind;
  }

  /**
   * Convenience: bind a viewport tracker (IntersectionObserver) and
   * route its `viewport:enter` / `viewport:exit` / `viewport:dwell`
   * events into `ingest`. The dwell event is what most callers want for
   * "time on section" — it includes `durationMs` directly.
   */
  captureViewport(opts: CaptureViewportOptions): () => void {
    const unbind = bindCaptureViewport(opts, (record) => {
      this.ingest(record);
    });
    this.unbinders.push(unbind);
    return unbind;
  }

  /**
   * End-of-stream / page-unload flush. Drains pending negative-step
   * matches across all runtimes and flushes batched sinks.
   */
  async flush(): Promise<void> {
    const drained: DerivedSignal[] = [];
    for (const runtime of this.runtimes.values()) {
      for (const signal of runtime.flush()) drained.push(signal);
    }
    this.routeAll(drained);
    await this.router.flushAll();
  }

  /**
   * Detach all listeners, free all runtimes, clear sinks. Idempotent.
   */
  destroy(): void {
    for (const unbind of this.unbinders) unbind();
    this.unbinders.length = 0;
    for (const runtime of this.runtimes.values()) runtime.destroy();
    this.runtimes.clear();
  }

  private routeAll(signals: DerivedSignal[]): void {
    if (signals.length === 0) return;
    if (this.consent && !this.consent()) return;
    for (const signal of signals) {
      void this.router.route(signal);
    }
  }
}
