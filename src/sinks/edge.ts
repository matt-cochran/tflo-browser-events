/**
 * `EdgeSink` — POSTs derived signals to a first-party HTTP endpoint.
 *
 * The recommended deployment pattern for analytics: derive signals in
 * the browser, ship them to *your* edge collector, and let that edge
 * collector fan out to ClickHouse, GA4 Measurement Protocol, vendor
 * APIs, etc. Keeps shared secrets server-side.
 *
 * Transport rules follow the Journeeze direct-mode contract v1 (C0b)
 * §4 (batching and page end), §6 (retry) and §7 (ids):
 *
 * - **Batches** hold at most `batchSize` (≤ 50) events and
 *   `maxBatchBytes` (32 KiB) of encoded body. A full batch goes at once;
 *   a partial one after `batchIntervalMs`. One request is in flight at a
 *   time, oldest events first.
 * - **`contentType: "text/plain"`** sends a CORS-simple request (no
 *   preflight): `text/plain;charset=UTF-8` and no other headers. Custom
 *   headers are refused in that mode because they would force a
 *   preflight.
 * - **Ids:** every event gets an `event_id` (UUIDv7) and a per-instance
 *   `seq` when it is queued; both stay the same across retries and
 *   beacons so the collector can de-duplicate.
 * - **Retry:** network failures and 408/429/500/502/503/504 keep the
 *   batch at the head of the queue and retry with exponential backoff
 *   (1 s base, 60 s cap, ±50% jitter), waiting at least `Retry-After`
 *   (capped at 60 s). At most 5 retries (3 for network failures);
 *   offline pauses retries until `online`. Other statuses drop the batch.
 * - **Bounded memory:** the queue holds at most `maxQueueEvents` events
 *   and `maxQueueBytes` bytes; the oldest are dropped first. Nothing is
 *   ever persisted.
 * - **Page end** (`visibilitychange` to hidden, `pagehide`, or
 *   `flush({ unloading: true })`): one `sendBeacon` of at most one batch.
 *   If the beacon is accepted, anything that did not fit is dropped. If
 *   it is refused or unavailable, nothing is dropped and **no keepalive
 *   fetch** is attempted (the beacon and keepalive share one quota); the
 *   queue is sent when the page is shown again. `unload`/`beforeunload`
 *   are never used, and normal sends never set `keepalive`.
 *
 * **Journeeze collectors** (per Allumata review on #77/#102, items B3 and
 * B4): `profile: "journeeze"` forces `text/plain`, refuses custom
 * headers and defaults to 50 events / 5 s. The page-end beacon shares one
 * budget with every other Journeeze sender on the page: pass the SDK's
 * `pageEndBudget`, or the sink keeps to 16 KiB on its own. `encode` lets
 * the SDK wrap a batch in its request message (C0d `RecordSignalsRequest`)
 * and `transform` maps or filters each signal before it is queued.
 */

import type { DerivedSignal, Sink } from "../types.js";

/** Why the sink dropped events (reported through `onDrop`). */
export type EdgeDropReason =
  | "queue_full"
  | "non_retriable"
  | "retries_exhausted"
  | "oversize"
  | "page_end_overflow";

export interface EdgeSinkStats {
  /** Events waiting to be sent (including a batch awaiting retry). */
  readonly queued: number;
  /** Events dropped for any `EdgeDropReason`. */
  readonly dropped: number;
  /** Events acknowledged by a 2xx response or an accepted beacon. */
  readonly sent: number;
}

/** One event as queued: the (transformed) signal plus `event_id` and `seq`. */
export type EdgeWireEvent = Record<string, unknown> & { event_id: string; seq: number };

/** Context passed to `encode`. */
export interface EdgeEncodeMeta {
  /** Events this sink dropped since its last delivered request (aggregate, no ids). */
  readonly droppedSinceLastSend: number;
}

/**
 * A page-end beacon budget shared by every sender on the page (Allumata
 * review B3). `available()` is what this sender may still beacon now;
 * `commit(bytes)` records an accepted beacon.
 */
export interface PageEndBudget {
  available(): number;
  commit(bytes: number): void;
}

export interface EdgeSinkOptions {
  /** Sink identifier — defaults to `"edge"`. */
  name?: string;
  /** HTTP endpoint that accepts a JSON-encoded `{ batch: [...] }` payload. */
  endpoint: string;
  /** Max events per request (1–50). Defaults to 20. */
  batchSize?: number;
  /** Max encoded body bytes per request. Defaults to 32768 (C0b §4). */
  maxBatchBytes?: number;
  /** Max time (ms) to wait before sending a partial batch. Defaults to 1000. */
  batchIntervalMs?: number;
  /**
   * Request body content type. `"text/plain"` makes every request a CORS
   * simple request (no preflight); the body is still JSON. Defaults to
   * `"application/json"`.
   */
  contentType?: "application/json" | "text/plain";
  /** Custom headers (only with `contentType: "application/json"`). */
  headers?: Record<string, string>;
  /** Max events held in memory, including batches awaiting retry. Defaults to 200. */
  maxQueueEvents?: number;
  /** Max encoded bytes held in memory. Defaults to 262144. */
  maxQueueBytes?: number;
  /** Override the fetch implementation — useful for tests. */
  fetchImpl?: typeof fetch;
  /** Override `sendBeacon` resolution — useful for tests. */
  sendBeacon?: (url: string, body: BodyInit) => boolean;
  /** Clock (ms since the epoch). Defaults to `Date.now`. */
  now?: () => number;
  /** Jitter source in [0, 1). Defaults to `Math.random`. */
  random?: () => number;
  /** Random bytes for event ids. Defaults to `crypto.getRandomValues`. */
  randomBytes?: (length: number) => Uint8Array;
  /**
   * Listen to `visibilitychange`, `pagehide`, `pageshow` and `online`
   * when a DOM is present. Defaults to true.
   */
  bindPageLifecycle?: boolean;
  /** Called whenever events are dropped. */
  onDrop?: (reason: EdgeDropReason, count: number) => void;
  /**
   * `"journeeze"` applies the Journeeze collector profile: `text/plain`
   * only (custom headers are refused), 50 events per batch, 5 s cadence
   * and a 16 KiB page-end beacon unless `pageEndBudget` is given.
   * Defaults to `"generic"`.
   */
  profile?: "generic" | "journeeze";
  /** Request body for a batch. Defaults to `{"batch":[...]}`. */
  encode?: (events: readonly EdgeWireEvent[], meta: EdgeEncodeMeta) => string;
  /** Maps a signal to its wire fields, or returns null to drop it in the browser. */
  transform?: (signal: DerivedSignal) => Record<string, unknown> | null;
  /** Shared page-end budget (Allumata review B3). */
  pageEndBudget?: PageEndBudget;
}

/** One queued event: the wire object and its encoded size. */
interface Queued {
  readonly wire: EdgeWireEvent;
  readonly bytes: number;
}

type PostOutcome =
  | { kind: "ok" }
  | { kind: "drop" }
  | { kind: "retry"; network: boolean; retryAfterMs: number };

const MAX_BATCH_EVENTS = 50;
const RETRY_BASE_MS = 1000;
const RETRY_CAP_MS = 60_000;
const MAX_HTTP_RETRIES = 5;
const MAX_NETWORK_RETRIES = 3;
const RETRIABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const SEQ_MAX = 0xffff_ffff;
/** Page-end cap for a Journeeze sender without a shared budget (Allumata review B3). */
const SOLO_PAGE_END_BYTES = 16_384;
const encoder = new TextEncoder();

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

function defaultEncode(events: readonly EdgeWireEvent[]): string {
  return JSON.stringify({ batch: events });
}

function positiveInt(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`EdgeSink: ${label} must be a positive number`);
  }
  return Math.max(1, Math.floor(value));
}

function defaultRandomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

/** RFC 9562 UUIDv7: 48-bit unix-ms timestamp, version 7, variant 10. */
export function uuidv7(nowMs: number, randomBytes: (length: number) => Uint8Array): string {
  const bytes = new Uint8Array(16);
  bytes.set(randomBytes(16).subarray(0, 16));
  let ts = Math.max(0, Math.floor(nowMs));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = 0x70 | (bytes[6]! & 0x0f);
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** `Retry-After` in ms (seconds or HTTP-date), capped at 60 s; 0 when absent or invalid. */
export function retryAfterMs(header: string | null, nowMs: number): number {
  if (header === null) return 0;
  const value = header.trim();
  if (value === "") return 0;
  let ms: number;
  if (/^\d+$/.test(value)) {
    ms = Number(value) * 1000;
  } else {
    const date = Date.parse(value);
    if (Number.isNaN(date)) return 0;
    ms = date - nowMs;
  }
  return Math.min(RETRY_CAP_MS, Math.max(0, ms));
}

export class EdgeSink implements Sink {
  readonly name: string;
  private readonly endpoint: string;
  private readonly batchSize: number;
  private readonly maxBatchBytes: number;
  private readonly batchIntervalMs: number;
  private readonly contentType: "application/json" | "text/plain";
  private readonly headers: Record<string, string>;
  private readonly maxQueueEvents: number;
  private readonly maxQueueBytes: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sendBeacon?: (url: string, body: BodyInit) => boolean;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly randomBytes: (length: number) => Uint8Array;
  private readonly onDrop?: (reason: EdgeDropReason, count: number) => void;
  private readonly encodeBody: (events: readonly EdgeWireEvent[], meta: EdgeEncodeMeta) => string;
  private readonly transform?: (signal: DerivedSignal) => Record<string, unknown> | null;
  private readonly pageEndBudget?: PageEndBudget;
  private readonly pageEndBytes: number;
  private droppedSinceLastSend = 0;

  private queue: Queued[] = [];
  private queueBytes = 0;
  private seq = 0;
  private dropped = 0;
  private sent = 0;
  /** Events at the head of the queue that the in-flight request carries. */
  private inFlight = 0;
  private sending: Promise<void> | null = null;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while a retry waits for its timer or for `online`. */
  private retryPending = false;
  private waitingForOnline = false;
  /** Failed attempts of the batch at the head of the queue. */
  private attempts = 0;
  private closed = false;
  private readonly unbinders: Array<() => void> = [];

  constructor(opts: EdgeSinkOptions) {
    const journeeze = opts.profile === "journeeze";
    this.name = opts.name ?? "edge";
    this.endpoint = opts.endpoint;
    this.batchSize = Math.min(
      MAX_BATCH_EVENTS,
      positiveInt(opts.batchSize, journeeze ? MAX_BATCH_EVENTS : 20, "batchSize"),
    );
    this.maxBatchBytes = positiveInt(opts.maxBatchBytes, 32_768, "maxBatchBytes");
    this.batchIntervalMs = positiveInt(opts.batchIntervalMs, journeeze ? 5000 : 1000, "batchIntervalMs");
    if (journeeze && opts.contentType === "application/json") {
      throw new TypeError('EdgeSink: the "journeeze" profile sends text/plain only (no preflight)');
    }
    this.contentType = journeeze ? "text/plain" : (opts.contentType ?? "application/json");
    this.headers = opts.headers ?? {};
    if (this.contentType === "text/plain" && Object.keys(this.headers).length > 0) {
      throw new TypeError(
        'EdgeSink: custom headers force a CORS preflight; they are not allowed with contentType "text/plain"',
      );
    }
    this.maxQueueEvents = positiveInt(opts.maxQueueEvents, 200, "maxQueueEvents");
    this.maxQueueBytes = positiveInt(opts.maxQueueBytes, 262_144, "maxQueueBytes");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.sendBeacon = opts.sendBeacon ?? this.resolveSendBeacon();
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.randomBytes = opts.randomBytes ?? defaultRandomBytes;
    this.onDrop = opts.onDrop;
    this.encodeBody = opts.encode ?? defaultEncode;
    this.transform = opts.transform;
    this.pageEndBudget = opts.pageEndBudget;
    this.pageEndBytes = journeeze ? Math.min(SOLO_PAGE_END_BYTES, this.maxBatchBytes) : this.maxBatchBytes;
    if (opts.bindPageLifecycle ?? true) this.bindPageLifecycle();
  }

  /** Counters for observability. */
  stats(): EdgeSinkStats {
    return { queued: this.queue.length, dropped: this.dropped, sent: this.sent };
  }

  send(signal: DerivedSignal): void {
    if (this.closed) return;
    const fields = this.transform ? this.transform(signal) : { ...signal };
    if (fields === null) return;
    this.seq = this.seq >= SEQ_MAX ? 1 : this.seq + 1;
    const wire: EdgeWireEvent = {
      ...fields,
      event_id: uuidv7(this.now(), this.randomBytes),
      seq: this.seq,
    };
    const bytes = byteLength(JSON.stringify(wire));
    if (this.encodedBytes([{ wire, bytes }]) > this.maxBatchBytes) {
      this.drop("oversize", 1);
      return;
    }
    this.queue.push({ wire, bytes });
    this.queueBytes += bytes;
    this.enforceQueueCap();
    if (this.retryPending || this.sending) return;
    if (this.queue.length >= this.batchSize) {
      void this.pump();
      return;
    }
    this.scheduleBatch();
  }

  /**
   * Send what is queued now. At page end (`unloading`, or the document is
   * hidden) this sends one beacon instead. A pending retry wait is
   * respected. Never rejects.
   */
  async flush(opts: { unloading?: boolean } = {}): Promise<void> {
    if (this.closed) return;
    if (opts.unloading || this.documentHidden()) {
      this.pageEnd();
      return;
    }
    this.clearBatchTimer();
    if (this.retryPending) return;
    await this.pump();
  }

  /** Remove every listener and timer. Idempotent; later sends are ignored. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clearBatchTimer();
    this.clearRetryTimer();
    for (const unbind of this.unbinders.splice(0)) unbind();
  }

  /** Sends batches until the queue is empty or a retry is scheduled. */
  private pump(): Promise<void> {
    if (this.sending) return this.sending;
    this.sending = this.drain().finally(() => {
      this.sending = null;
    });
    return this.sending;
  }

  private async drain(): Promise<void> {
    this.clearBatchTimer();
    while (!this.closed && !this.retryPending && this.queue.length > 0) {
      const batch = this.takeBatch(this.maxBatchBytes);
      this.inFlight = batch.length;
      const outcome = await this.post(batch);
      if (this.closed) return;
      // A page-end beacon may have delivered (and removed) these events meanwhile.
      const stillQueued = this.inFlight === batch.length && this.queue[0] === batch[0];
      this.inFlight = 0;
      if (!stillQueued) continue;
      if (outcome.kind === "ok") {
        this.removeHead(batch.length);
        this.sent += batch.length;
        this.droppedSinceLastSend = 0;
        this.attempts = 0;
        continue;
      }
      if (outcome.kind === "drop") {
        this.removeHead(batch.length);
        this.drop("non_retriable", batch.length);
        this.attempts = 0;
        continue;
      }
      this.attempts += 1;
      const limit = outcome.network ? MAX_NETWORK_RETRIES : MAX_HTTP_RETRIES;
      if (this.attempts > limit) {
        this.removeHead(batch.length);
        this.drop("retries_exhausted", batch.length);
        this.attempts = 0;
        continue;
      }
      this.scheduleRetry(outcome.retryAfterMs);
      return;
    }
  }

  private async post(batch: Queued[]): Promise<PostOutcome> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: this.requestHeaders(),
        body: this.encode(batch),
      });
    } catch {
      return { kind: "retry", network: true, retryAfterMs: 0 };
    }
    if (response.ok) return { kind: "ok" };
    if (RETRIABLE_STATUSES.has(response.status)) {
      return {
        kind: "retry",
        network: false,
        retryAfterMs: retryAfterMs(response.headers.get("retry-after"), this.now()),
      };
    }
    return { kind: "drop" };
  }

  private scheduleRetry(retryAfter: number): void {
    this.retryPending = true;
    if (this.isOffline()) {
      this.waitingForOnline = true;
      return;
    }
    const backoff =
      Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (this.attempts - 1)) * (0.5 + this.random());
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.resumeAfterRetryWait();
    }, Math.max(backoff, retryAfter));
  }

  private resumeAfterRetryWait(): void {
    this.retryPending = false;
    this.waitingForOnline = false;
    void this.pump();
  }

  /** Page end: one beacon with the oldest events that fit; never keepalive. */
  private pageEnd(): void {
    this.clearBatchTimer();
    if (this.queue.length === 0 || !this.sendBeacon) return;
    const limit = this.pageEndBudget
      ? Math.min(this.maxBatchBytes, Math.max(0, this.pageEndBudget.available()))
      : this.pageEndBytes;
    const batch = this.takeBatch(limit);
    if (batch.length === 0) {
      // No budget left on this page: keep the events; they go if the page is shown again.
      return;
    }
    const body = this.encode(batch);
    const type =
      this.contentType === "text/plain" ? "text/plain;charset=UTF-8" : "application/json";
    let accepted = false;
    try {
      accepted = this.sendBeacon(this.endpoint, new Blob([body], { type }));
    } catch {
      accepted = false;
    }
    if (!accepted) return;
    this.pageEndBudget?.commit(byteLength(body));
    // A fetch may still be in flight for the head of the queue; the beacon
    // carries the same event_ids, so the collector counts them once.
    this.removeHead(batch.length);
    this.sent += batch.length;
    this.droppedSinceLastSend = 0;
    const overflow = this.queue.length;
    if (overflow > 0) {
      this.queue = [];
      this.queueBytes = 0;
      this.drop("page_end_overflow", overflow);
    }
    this.inFlight = 0;
    this.attempts = 0;
    this.clearRetryTimer();
    this.retryPending = false;
    this.waitingForOnline = false;
  }

  /** The oldest events whose encoded request fits in `limitBytes`. */
  private takeBatch(limitBytes: number): Queued[] {
    const batch: Queued[] = [];
    let estimate = 0;
    for (const item of this.queue) {
      if (batch.length >= this.batchSize) break;
      if (estimate + item.bytes + 1 > limitBytes) break;
      batch.push(item);
      estimate += item.bytes + 1;
    }
    // The estimate ignores the envelope `encode` adds; trim until the real body fits.
    while (batch.length > 0 && this.encodedBytes(batch) > limitBytes) batch.pop();
    return batch;
  }

  private encodedBytes(batch: readonly Queued[]): number {
    return byteLength(this.encode(batch));
  }

  private removeHead(count: number): void {
    const removed = this.queue.splice(0, count);
    for (const item of removed) this.queueBytes -= item.bytes;
  }

  /** Drops the oldest events (never the batch in flight) until under both caps. */
  private enforceQueueCap(): void {
    let count = 0;
    while (
      this.queue.length > this.inFlight &&
      (this.queue.length > this.maxQueueEvents || this.queueBytes > this.maxQueueBytes)
    ) {
      const [item] = this.queue.splice(this.inFlight, 1);
      this.queueBytes -= item!.bytes;
      count += 1;
    }
    if (count > 0) this.drop("queue_full", count);
  }

  private encode(batch: readonly Queued[]): string {
    return this.encodeBody(
      batch.map((item) => item.wire),
      { droppedSinceLastSend: this.droppedSinceLastSend },
    );
  }

  private requestHeaders(): Record<string, string> {
    if (this.contentType === "text/plain") return { "content-type": "text/plain;charset=UTF-8" };
    return { "content-type": "application/json", ...this.headers };
  }

  private drop(reason: EdgeDropReason, count: number): void {
    this.dropped += count;
    this.droppedSinceLastSend += count;
    try {
      this.onDrop?.(reason, count);
    } catch {
      // An observer must never break delivery.
    }
  }

  private scheduleBatch(): void {
    if (this.batchTimer !== null) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      void this.pump();
    }, this.batchIntervalMs);
  }

  private clearBatchTimer(): void {
    if (this.batchTimer === null) return;
    clearTimeout(this.batchTimer);
    this.batchTimer = null;
  }

  private clearRetryTimer(): void {
    if (this.retryTimer === null) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private documentHidden(): boolean {
    return typeof document !== "undefined" && document.visibilityState === "hidden";
  }

  private isOffline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  private bindPageLifecycle(): void {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const listen = (target: EventTarget, type: string, handler: () => void) => {
      target.addEventListener(type, handler);
      this.unbinders.push(() => target.removeEventListener(type, handler));
    };
    listen(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") this.pageEnd();
      else this.resend();
    });
    listen(window, "pagehide", () => this.pageEnd());
    listen(window, "pageshow", () => this.resend());
    listen(window, "online", () => {
      if (this.waitingForOnline) this.resumeAfterRetryWait();
    });
  }

  /** The page is visible again: send what a refused beacon left behind. */
  private resend(): void {
    if (this.closed || this.retryPending || this.queue.length === 0) return;
    void this.pump();
  }

  private resolveSendBeacon(): ((url: string, body: BodyInit) => boolean) | undefined {
    const nav: { sendBeacon?: (url: string, data?: BodyInit | null) => boolean } | undefined =
      typeof navigator !== "undefined" ? navigator : undefined;
    if (!nav?.sendBeacon) return undefined;
    return (url, body) => nav.sendBeacon!(url, body);
  }
}
