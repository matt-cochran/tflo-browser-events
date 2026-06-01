/**
 * `EdgeSink` — POSTs derived signals to a first-party HTTP endpoint.
 *
 * The recommended deployment pattern for analytics: derive signals in
 * the browser, ship them to *your* edge collector, and let that edge
 * collector fan out to ClickHouse, GA4 Measurement Protocol, vendor
 * APIs, etc. Keeps shared secrets server-side.
 *
 * Batches by default — signals are buffered and flushed either when
 * the buffer hits `batchSize` or after `batchIntervalMs` has elapsed
 * since the last flush. Use `flush()` to force delivery (the SDK
 * calls this on shutdown / visibility transitions).
 *
 * On page unload, uses `navigator.sendBeacon` when available (more
 * reliable than `fetch` mid-tear-down), falling back to
 * `fetch(..., { keepalive: true })`.
 */

import type { DerivedSignal, Sink } from "../types.js";

export interface EdgeSinkOptions {
  /** Sink identifier — defaults to `"edge"`. */
  name?: string;
  /** HTTP endpoint that accepts a JSON-encoded `{ batch: DerivedSignal[] }`
   * payload. */
  endpoint: string;
  /** Max signals to buffer before forcing a flush. Defaults to 20. */
  batchSize?: number;
  /** Max time (ms) to wait before flushing a non-empty buffer. Defaults to 1000. */
  batchIntervalMs?: number;
  /** Custom headers to add to each POST. */
  headers?: Record<string, string>;
  /** Override the fetch implementation — useful for tests. Defaults
   * to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Override `sendBeacon` resolution — useful for tests. */
  sendBeacon?: (url: string, body: BodyInit) => boolean;
}

export class EdgeSink implements Sink {
  readonly name: string;
  private buffer: DerivedSignal[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly endpoint: string;
  private readonly batchSize: number;
  private readonly batchIntervalMs: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;
  private readonly sendBeacon?: (url: string, body: BodyInit) => boolean;

  constructor(opts: EdgeSinkOptions) {
    this.name = opts.name ?? "edge";
    this.endpoint = opts.endpoint;
    this.batchSize = opts.batchSize ?? 20;
    this.batchIntervalMs = opts.batchIntervalMs ?? 1000;
    this.headers = opts.headers ?? {};
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sendBeacon = opts.sendBeacon ?? this.resolveSendBeacon();
  }

  send(signal: DerivedSignal): void {
    this.buffer.push(signal);
    if (this.buffer.length >= this.batchSize) {
      void this.flush();
      return;
    }
    this.scheduleFlush();
  }

  async flush(opts: { unloading?: boolean } = {}): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    const body = JSON.stringify({ batch });

    if (opts.unloading && this.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const ok = this.sendBeacon(this.endpoint, blob);
      if (ok) return;
      // Fall through to fetch keepalive if sendBeacon refused (e.g., too large).
    }

    await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body,
      keepalive: opts.unloading,
    });
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.batchIntervalMs);
  }

  private resolveSendBeacon(): ((url: string, body: BodyInit) => boolean) | undefined {
    const nav: { sendBeacon?: (url: string, data?: BodyInit | null) => boolean } | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (!nav?.sendBeacon) return undefined;
    return (url, body) => nav.sendBeacon!(url, body);
  }
}
