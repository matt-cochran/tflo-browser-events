/**
 * Sink router — dispatches derived signals to registered sinks based on
 * the signal's optional `sinks` hint, or to all registered sinks when
 * the hint is absent.
 *
 * The router is intentionally minimal. It is the seam where users plug
 * in their own destinations (one-off `Sink` implementations) without
 * touching the matching engine or the capture layer. The SDK ships
 * `ConsoleSink`, `EdgeSink`, and `GA4Sink` as ready-to-use options; GA4
 * is one option among many, not the default.
 */

import type { DerivedSignal, Sink } from "../types.js";

export { ConsoleSink } from "./console.js";
export { EdgeSink, type EdgeSinkOptions } from "./edge.js";
export { GA4Sink, type GA4SinkOptions } from "./ga4.js";

/**
 * A registry of sinks plus the dispatch logic.
 *
 * Construct with the sinks you want to route to. Send a signal with
 * `route(signal)` — the router decides who receives it based on the
 * `sinks` field, then awaits delivery for any async sinks.
 *
 * Failures are isolated per sink: a thrown error from one sink does
 * not stop delivery to the others. Errors are exposed via the optional
 * `onError` callback for downstream metrics/observability.
 */
export class SinkRouter {
  private readonly sinks = new Map<string, Sink>();
  private readonly onError?: (sinkName: string, err: unknown) => void;

  constructor(opts: { sinks?: Sink[]; onError?: (sink: string, err: unknown) => void } = {}) {
    this.onError = opts.onError;
    for (const sink of opts.sinks ?? []) {
      this.register(sink);
    }
  }

  /** Register a sink. Replacing an existing sink with the same name is
   * allowed — useful for hot-swapping endpoints. */
  register(sink: Sink): void {
    this.sinks.set(sink.name, sink);
  }

  /** Remove a sink by name. */
  unregister(name: string): void {
    this.sinks.delete(name);
  }

  /** Total number of registered sinks. */
  get size(): number {
    return this.sinks.size;
  }

  /** Dispatch a signal. Returns a Promise that resolves when every
   * targeted sink has finished delivery (or thrown). Synchronous sinks
   * return immediately; the Promise still resolves on the next
   * microtask. */
  async route(signal: DerivedSignal): Promise<void> {
    const targets = this.resolveTargets(signal);
    const promises: Array<Promise<void>> = [];
    for (const sink of targets) {
      try {
        const result = sink.send(signal);
        if (result instanceof Promise) {
          promises.push(
            result.catch((err) => {
              this.onError?.(sink.name, err);
            }),
          );
        }
      } catch (err) {
        this.onError?.(sink.name, err);
      }
    }
    await Promise.all(promises);
  }

  /** Flush all sinks that have a `flush` method. Errors are isolated
   * per sink. */
  async flushAll(): Promise<void> {
    const promises: Array<Promise<void>> = [];
    for (const sink of this.sinks.values()) {
      const flush = sink.flush;
      if (!flush) continue;
      try {
        const result = flush.call(sink);
        if (result instanceof Promise) {
          promises.push(
            result.catch((err) => {
              this.onError?.(sink.name, err);
            }),
          );
        }
      } catch (err) {
        this.onError?.(sink.name, err);
      }
    }
    await Promise.all(promises);
  }

  private resolveTargets(signal: DerivedSignal): Sink[] {
    if (!signal.sinks || signal.sinks.length === 0) {
      return Array.from(this.sinks.values());
    }
    const out: Sink[] = [];
    for (const name of signal.sinks) {
      const sink = this.sinks.get(name);
      if (sink) out.push(sink);
    }
    return out;
  }
}
