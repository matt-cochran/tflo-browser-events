/**
 * `ConsoleSink` — prints derived signals to the console.
 *
 * Useful as the default in development and as a fallback when other
 * sinks are misconfigured. Works in any JS environment.
 */
export class ConsoleSink {
    name;
    level;
    constructor(opts = {}) {
        this.name = opts.name ?? "console";
        this.level = opts.level ?? "log";
    }
    send(signal) {
        // eslint-disable-next-line no-console
        console[this.level]("[tflo]", signal.name, signal.payload, `ts=${signal.ts}`);
    }
}
//# sourceMappingURL=console.js.map