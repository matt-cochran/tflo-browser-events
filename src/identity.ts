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

export type Signal = { name: string; ts: number; payload: Record<string, unknown> };

const KEY = "tflo_session_id";

/**
 * Returns a session id that is stable across calls within the same
 * browser session (tab), minting a new one on first use and persisting
 * it in `sessionStorage`.
 */
export function stableSessionId(): string {
  let id = sessionStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
  }
  return id;
}

/** Returns a mapper that stamps identity onto every signal payload. Never adds PII. */
export function withIdentity(id: Identity) {
  return (s: Signal): Signal => ({
    ...s,
    payload: {
      ...s.payload,
      app_id: id.appId,
      environment: id.environment,
      session_id: id.sessionId,
      ...(id.userIdHash ? { user_id_hash: id.userIdHash } : {}),
      ...(id.tenantIdHash ? { tenant_id_hash: id.tenantIdHash } : {}),
    },
  });
}
