/**
 * Event capture layer.
 *
 * Wraps `addEventListener` (and observer APIs in v0.2) with a stable
 * shape: every captured event becomes an `EventRecord` with a `ts`
 * (from `performance.now()`), a `kind`, and a `fields` payload. The
 * caller decides what to capture; the SDK never auto-instruments the
 * page.
 *
 * Built-in helpers:
 *
 * - `capture({ target, type, kind, fields })` — generic listener.
 * - Throttling — optional `throttleMs` collapses repeated events
 *   (scroll, pointermove, wheel) to one per window.
 * - `unbind` — every `capture` returns a function that removes the
 *   listener.
 *
 * Pointer/touch/wheel/scroll-specific helpers will land in v0.2.
 * For v0.1, callers wire their own listeners through the generic
 * `capture(...)` API.
 */

import type { EventRecord } from "./types.js";

/**
 * Options for a single capture binding.
 *
 * `target` and `type` are the standard `addEventListener` arguments.
 * `kind` is the value that ends up in `EventRecord.kind` — defaults
 * to `type` if omitted. `fields` extracts the captured event's
 * meaningful payload; the SDK never reflects raw DOM objects.
 */
export interface CaptureOptions<E extends Event = Event> {
  target: EventTarget;
  type: string;
  /** Renamed `EventRecord.kind` — defaults to `type`. */
  kind?: string;
  /** Extract fields from the raw event. Defaults to `() => ({})`. */
  fields?: (event: E) => Record<string, unknown>;
  /** Throttle: collapse repeated events within N ms to one record.
   * Use for `scroll`, `pointermove`, `wheel`. */
  throttleMs?: number;
  /** Standard listener options. `passive: true` is the default for
   * scroll/wheel/touch types. */
  listenerOptions?: AddEventListenerOptions;
  /** Time source — defaults to `performance.now`. */
  now?: () => number;
}

/** Captured event handler — receives an EventRecord. */
export type CaptureHandler = (record: EventRecord) => void;

/**
 * Bind a capture. Returns an unbind function that removes the listener.
 *
 * The handler is invoked synchronously inside the DOM event handler
 * unless `throttleMs` is set, in which case it runs on a trailing
 * timer.
 */
export function capture<E extends Event = Event>(
  opts: CaptureOptions<E>,
  handler: CaptureHandler,
): () => void {
  const fields = opts.fields ?? (() => ({}));
  const kind = opts.kind ?? opts.type;
  const now = opts.now ?? (() => performance.now());
  const passiveByDefault =
    opts.type === "scroll" || opts.type === "wheel" || opts.type === "touchmove";
  const listenerOpts: AddEventListenerOptions = {
    passive: passiveByDefault,
    ...(opts.listenerOptions ?? {}),
  };

  let pending: EventRecord | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  const flushPending = () => {
    if (pending) {
      handler(pending);
      pending = null;
    }
    throttleTimer = null;
  };

  const listener = (event: Event) => {
    const record: EventRecord = {
      ts: now(),
      kind,
      fields: fields(event as E),
    };
    if (opts.throttleMs && opts.throttleMs > 0) {
      pending = record;
      if (throttleTimer === null) {
        throttleTimer = setTimeout(flushPending, opts.throttleMs);
      }
      return;
    }
    handler(record);
  };

  opts.target.addEventListener(opts.type, listener, listenerOpts);

  return () => {
    opts.target.removeEventListener(opts.type, listener, listenerOpts);
    if (throttleTimer !== null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    pending = null;
  };
}
