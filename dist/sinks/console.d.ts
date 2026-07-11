/**
 * `ConsoleSink` — prints derived signals to the console.
 *
 * Useful as the default in development and as a fallback when other
 * sinks are misconfigured. Works in any JS environment.
 */
import type { DerivedSignal, Sink } from "../types.js";
export declare class ConsoleSink implements Sink {
    readonly name: string;
    private readonly level;
    constructor(opts?: {
        name?: string;
        level?: "log" | "info" | "debug";
    });
    send(signal: DerivedSignal): void;
}
//# sourceMappingURL=console.d.ts.map