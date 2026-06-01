/**
 * `ConsoleSink` — prints derived signals to the console.
 *
 * Useful as the default in development and as a fallback when other
 * sinks are misconfigured. Works in any JS environment.
 */

import type { DerivedSignal, Sink } from "../types.js";

export class ConsoleSink implements Sink {
  readonly name: string;
  private readonly level: "log" | "info" | "debug";

  constructor(opts: { name?: string; level?: "log" | "info" | "debug" } = {}) {
    this.name = opts.name ?? "console";
    this.level = opts.level ?? "log";
  }

  send(signal: DerivedSignal): void {
    // eslint-disable-next-line no-console
    console[this.level]("[tflo]", signal.name, signal.payload, `ts=${signal.ts}`);
  }
}
