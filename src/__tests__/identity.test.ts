// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { stableSessionId, withIdentity } from "../identity";

describe("identity", () => {
  it("stable session id persists across calls", () => {
    const a = stableSessionId(); const b = stableSessionId();
    expect(a).toBe(b);
  });
  it("stamps app/env/hashed ids into signal payload", () => {
    const stamp = withIdentity({ appId: "simuli", environment: "dev", userIdHash: "h_abc", tenantIdHash: "h_t", sessionId: "s1" });
    const out = stamp({ name: "cta_click", ts: 1, payload: { cta_type: "invite" } });
    expect(out.payload.app_id).toBe("simuli");
    expect(out.payload.user_id_hash).toBe("h_abc");
    expect(out.payload).not.toHaveProperty("email");
  });
});
