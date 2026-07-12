/**
 * Identity stamping for browser telemetry.
 *
 * `stableSessionId()` mints (or reuses) a session id that persists across
 * SPA route changes within the same browser tab, backed by
 * `sessionStorage` so it survives client-side navigation but resets per
 * tab/session (never persisted to disk, never cross-tab).
 *
 * `withIdentity(id)` returns a mapper that stamps identity fields onto a
 * signal's payload. It NEVER adds PII — only app/environment/session
 * context plus caller-supplied *hashed* user/tenant ids.
 */
export type Identity = {
    appId: string;
    environment: string;
    userIdHash?: string;
    tenantIdHash?: string;
    sessionId: string;
};
export type Signal = {
    name: string;
    ts: number;
    payload: Record<string, unknown>;
};
/**
 * Returns a session id that is stable across calls within the same
 * browser session (tab), minting a new one on first use and persisting
 * it in `sessionStorage`.
 */
export declare function stableSessionId(): string;
/** Returns a mapper that stamps identity onto every signal payload. Never adds PII. */
export declare function withIdentity(id: Identity): (s: Signal) => Signal;
//# sourceMappingURL=identity.d.ts.map