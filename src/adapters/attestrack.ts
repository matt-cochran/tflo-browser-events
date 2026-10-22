/**
 * Attestrack v1 adapter: a pure mapper from derived signals to closed
 * `AttestrackV1` records.
 *
 * It does no I/O. It reads no clock, cookie, storage, environment or
 * secret, keeps no buffer and never mutates its arguments. The host owns
 * transport and must:
 *
 * - re-check consent at the moment it actually sends, not only when it
 *   maps. Consent can change between the two.
 * - purge any queued or buffered records when consent is withdrawn.
 *
 * Trust model:
 *
 * - `consent` is the caller's assertion of the visitor's current decision.
 *   The adapter cannot authenticate it. Only `"granted"` produces records;
 *   anything else returns `[]` before the input is read. Records carry
 *   `consentDecision: "granted"` and nothing else about consent: shadow
 *   evaluation (consent mode, would-allow, jurisdiction, policy) is owned
 *   by the server and is never stamped here.
 * - `siteId` comes from options only. Payload `siteId`, `environment` and
 *   `consent` fields are never read.
 * - `source` (`expectedAppId` + `expectedEnvironment`) is a consistency
 *   check, not authentication. Payloads are produced in the browser and can
 *   be forged. When configured, every signal must carry matching
 *   `payload.app_id` and `payload.environment`, or the whole batch is
 *   rejected. Payload identity is never copied to the output.
 * - Output from this adapter alone does not prove a site has the tracker
 *   installed, nor that a dashboard reflects real traffic.
 *
 * Privacy: only the fields listed in `AttestrackV1` are copied, each from a
 * closed pattern or range. No raw payload, params, visitor, referrer, UTM,
 * error text or form values. Paths keep the path only (no query, fragment
 * or origin). Allowed identifiers and path segments can still contain personal
 * data; hosts must supply reviewed privacy-safe identifiers and route templates.
 * These shape checks are not a general PII detector or redactor.
 * Error messages name the index and field, never the value.
 *
 * Atomicity: any malformed signal fails the whole batch with an
 * `AttestrackAdapterError`. Nothing is returned for a failed batch.
 */

import { pathOnlyUrl } from "../privacy.js";

/** Most signals accepted in one batch. */
export const ATTESTRACK_MAX_BATCH = 50;
/** Most event names in the reviewed allowlist. */
export const ATTESTRACK_MAX_ALLOWED_EVENTS = 64;
/** Longest identifier (`siteId`, `sessionId`, `eventId`, `section`, ...). */
export const ATTESTRACK_MAX_IDENTIFIER = 128;
/** Longest `pagePath`, after the query and fragment are removed. */
export const ATTESTRACK_MAX_PATH = 512;
/** Largest `dwellMs` (24 hours). */
export const ATTESTRACK_MAX_DWELL_MS = 86_400_000;
/** Largest `webVitalValue`. Covers millisecond vitals and unitless CLS. */
export const ATTESTRACK_MAX_WEB_VITAL = 600_000;

/** Web vitals accepted in `webVitalName`. */
export const ATTESTRACK_WEB_VITALS = ["CLS", "FCP", "INP", "LCP", "TTFB"] as const;
export type AttestrackWebVital = (typeof ATTESTRACK_WEB_VITALS)[number];

/** The visitor's current consent decision, as asserted by the trusted caller. */
export type AttestrackConsent = "granted" | "declined" | "withdrawn" | null;

/**
 * How `DerivedSignal.ts` becomes `occurredAt`. There is no guessing:
 * - `epoch`: `ts` is already Unix epoch milliseconds.
 * - `monotonic`: `ts` is milliseconds since `timeOriginMs` (e.g.
 *   `performance.now()` with `performance.timeOrigin`). The caller reads
 *   the origin; the adapter never does.
 */
export type AttestrackTimeMode =
    | { mode: "epoch" }
    | { mode: "monotonic"; timeOriginMs: number };

/** Expected source identity. A consistency check, not authentication. */
export interface AttestrackSourceBinding {
    expectedAppId: string;
    expectedEnvironment: string;
}

/** Trusted configuration. Never taken from the payload. */
export interface AttestrackAdapterOptions {
    /** Site identifier stamped on every record. */
    siteId: string;
    /** Reviewed signal names that may become records (1 to 64). Signals
     * with any other name are dropped. */
    allowedEvents: readonly string[];
    /** How to read `DerivedSignal.ts`. */
    time: AttestrackTimeMode;
    /** Current consent decision. Only `"granted"` produces records. */
    consent: AttestrackConsent;
    /** Optional source binding; see the module comment. */
    source?: AttestrackSourceBinding;
}

/** One Attestrack v1 record. Closed: no other keys are ever present. */
export interface AttestrackV1 {
    v: 1;
    eventName: string;
    siteId: string;
    /** ISO 8601 UTC. */
    occurredAt: string;
    consentDecision: "granted";
    sessionId?: string;
    pagePath?: string;
    ctaType?: string;
    section?: string;
    scrollDepthPct?: number;
    dwellMs?: number;
    webVitalName?: AttestrackWebVital;
    webVitalValue?: number;
    eventId?: string;
}

export type AttestrackAdapterErrorCode =
    | "invalid_options"
    | "invalid_input"
    | "batch_too_large"
    | "invalid_signal"
    | "invalid_timestamp"
    | "invalid_field"
    | "source_mismatch";

/** Thrown when options or a batch are rejected. The message never
 * contains input values. */
export class AttestrackAdapterError extends Error {
    readonly code: AttestrackAdapterErrorCode;
    /** Index of the offending signal, when there is one. */
    readonly index?: number;
    /** Name of the offending field, when there is one. */
    readonly field?: string;

    constructor(code: AttestrackAdapterErrorCode, detail: string, index?: number, field?: string) {
        const where = index === undefined ? "" : ` at batch[${index}]${field ? `.${field}` : ""}`;
        super(`attestrack: ${code}${where}: ${detail}`);
        this.name = "AttestrackAdapterError";
        this.code = code;
        this.index = index;
        this.field = field;
    }
}

const CONSENT_VALUES: readonly unknown[] = ["granted", "declined", "withdrawn", null];

/** Opaque identifiers only: no spaces, so no free text. */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** An origin-relative path of RFC 3986 path characters. Rules out
 * `//host` and `/\host`, which browsers treat as another origin. */
const PATH = /^\/(?!\/)[A-Za-z0-9\-._~!$&'()*+,;=:@%/]*$/;

/** Earliest and latest instants a JS `Date` can hold. */
const MAX_DATE_MS = 8.64e15;

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isIdentifier(value: unknown): value is string {
    return (
        typeof value === "string" &&
        value.length <= ATTESTRACK_MAX_IDENTIFIER &&
        IDENTIFIER.test(value)
    );
}

/** Own property `key` of `obj`, or `undefined`. Never reads the prototype chain. */
function own(obj: Record<string, unknown>, key: string): unknown {
    return hasOwn(obj, key) ? obj[key] : undefined;
}

interface ResolvedOptions {
    siteId: string;
    allowed: ReadonlySet<string>;
    timeOriginMs: number;
    source?: AttestrackSourceBinding;
}

function resolveOptions(options: Record<string, unknown>): ResolvedOptions {
    const bad = (detail: string): never => {
        throw new AttestrackAdapterError("invalid_options", detail);
    };

    const siteId = own(options, "siteId");
    if (!isIdentifier(siteId)) bad("siteId must be an identifier");

    const allowedEvents = own(options, "allowedEvents");
    if (!Array.isArray(allowedEvents) || allowedEvents.length === 0) {
        bad("allowedEvents must be a non-empty array");
    }
    const events = allowedEvents as unknown[];
    if (events.length > ATTESTRACK_MAX_ALLOWED_EVENTS) {
        bad(`allowedEvents holds at most ${ATTESTRACK_MAX_ALLOWED_EVENTS} names`);
    }
    for (const name of events) {
        if (!isIdentifier(name)) bad("allowedEvents entries must be identifiers");
    }

    const time = own(options, "time");
    if (!isPlainObject(time)) bad("time must be { mode: 'epoch' } or { mode: 'monotonic', timeOriginMs }");
    const t = time as Record<string, unknown>;
    let timeOriginMs = 0;
    const mode = own(t, "mode");
    if (mode === "monotonic") {
        const origin = own(t, "timeOriginMs");
        if (typeof origin !== "number" || !Number.isFinite(origin) || origin < 0 || origin > MAX_DATE_MS) {
            bad("time.timeOriginMs must be finite non-negative epoch milliseconds");
        }
        timeOriginMs = origin as number;
    } else if (mode !== "epoch") {
        bad("time.mode must be 'epoch' or 'monotonic'");
    }

    let source: AttestrackSourceBinding | undefined;
    const rawSource = own(options, "source");
    if (rawSource !== undefined) {
        if (!isPlainObject(rawSource)) bad("source must be { expectedAppId, expectedEnvironment }");
        const s = rawSource as Record<string, unknown>;
        const expectedAppId = own(s, "expectedAppId");
        const expectedEnvironment = own(s, "expectedEnvironment");
        if (!isIdentifier(expectedAppId) || !isIdentifier(expectedEnvironment)) {
            bad("source needs both expectedAppId and expectedEnvironment as identifiers");
        }
        source = {
            expectedAppId: expectedAppId as string,
            expectedEnvironment: expectedEnvironment as string,
        };
    }

    return { siteId: siteId as string, allowed: new Set(events as string[]), timeOriginMs, source };
}

function toOccurredAt(ts: unknown, timeOriginMs: number, index: number): string {
    if (typeof ts !== "number" || !Number.isFinite(ts) || ts < 0) {
        throw new AttestrackAdapterError("invalid_timestamp", "ts must be a finite non-negative number", index, "ts");
    }
    const ms = timeOriginMs + ts;
    if (!Number.isFinite(ms) || ms > MAX_DATE_MS) {
        throw new AttestrackAdapterError("invalid_timestamp", "ts is outside the valid date range", index, "ts");
    }
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
        throw new AttestrackAdapterError("invalid_timestamp", "ts is not a valid date", index, "ts");
    }
    return date.toISOString();
}

type FieldReader = (value: unknown) => string | number | undefined;

const identifierField: FieldReader = (v) => (isIdentifier(v) ? v : undefined);

const SEMANTIC_FIELDS: ReadonlyArray<readonly [keyof AttestrackV1, FieldReader]> = [
    ["sessionId", identifierField],
    [
        "pagePath",
        (v) => {
            if (typeof v !== "string") return undefined;
            const path = pathOnlyUrl(v);
            return path.length <= ATTESTRACK_MAX_PATH && PATH.test(path) ? path : undefined;
        },
    ],
    ["ctaType", identifierField],
    ["section", identifierField],
    [
        "scrollDepthPct",
        (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100 ? v : undefined),
    ],
    [
        "dwellMs",
        (v) =>
            typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= ATTESTRACK_MAX_DWELL_MS
                ? v
                : undefined,
    ],
    [
        "webVitalName",
        (v) => ((ATTESTRACK_WEB_VITALS as readonly unknown[]).includes(v) ? (v as string) : undefined),
    ],
    [
        "webVitalValue",
        (v) =>
            typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= ATTESTRACK_MAX_WEB_VITAL
                ? v
                : undefined,
    ],
    ["eventId", identifierField],
];

/**
 * Map `input` (`{ batch: DerivedSignal[] }`, validated at runtime) to
 * Attestrack v1 records.
 *
 * Returns `[]` without reading `input` unless `options.consent` is
 * `"granted"`. Signals whose name is not in `options.allowedEvents` are
 * dropped. Any malformed signal, option or source mismatch throws
 * `AttestrackAdapterError` and nothing is returned.
 */
export function toAttestrackV1(input: unknown, options: AttestrackAdapterOptions): AttestrackV1[] {
    if (!isPlainObject(options)) {
        throw new AttestrackAdapterError("invalid_options", "options must be an object");
    }
    const consent = own(options, "consent");
    if (!CONSENT_VALUES.includes(consent)) {
        throw new AttestrackAdapterError(
            "invalid_options",
            "consent must be 'granted', 'declined', 'withdrawn' or null",
        );
    }
    if (consent !== "granted") return [];

    const opts = resolveOptions(options);

    if (!isPlainObject(input) || !Array.isArray(own(input, "batch"))) {
        throw new AttestrackAdapterError("invalid_input", "input must be { batch: DerivedSignal[] }");
    }
    const batch = own(input, "batch") as unknown[];
    if (batch.length > ATTESTRACK_MAX_BATCH) {
        throw new AttestrackAdapterError("batch_too_large", `batch holds at most ${ATTESTRACK_MAX_BATCH} signals`);
    }

    const out: AttestrackV1[] = [];
    for (let i = 0; i < batch.length; i++) {
        const signal = batch[i];
        if (!isPlainObject(signal)) {
            throw new AttestrackAdapterError("invalid_signal", "signal must be an object", i);
        }
        const name = own(signal, "name");
        if (typeof name !== "string") {
            throw new AttestrackAdapterError("invalid_signal", "name must be a string", i, "name");
        }
        const payload = own(signal, "payload");
        if (!isPlainObject(payload)) {
            throw new AttestrackAdapterError("invalid_signal", "payload must be an object", i, "payload");
        }
        const occurredAt = toOccurredAt(own(signal, "ts"), opts.timeOriginMs, i);

        // Checked for every signal, allowlisted or not: a batch that mixes
        // sources is suspect as a whole.
        if (opts.source) {
            if (own(payload, "app_id") !== opts.source.expectedAppId) {
                throw new AttestrackAdapterError("source_mismatch", "app_id is missing or unexpected", i, "payload.app_id");
            }
            if (own(payload, "environment") !== opts.source.expectedEnvironment) {
                throw new AttestrackAdapterError(
                    "source_mismatch",
                    "environment is missing or unexpected",
                    i,
                    "payload.environment",
                );
            }
        }

        if (!opts.allowed.has(name)) continue;

        const record: AttestrackV1 = {
            v: 1,
            eventName: name,
            siteId: opts.siteId,
            occurredAt,
            consentDecision: "granted",
        };
        for (const [field, read] of SEMANTIC_FIELDS) {
            const raw = own(payload, field);
            if (raw === undefined) continue;
            const value = read(raw);
            if (value === undefined) {
                throw new AttestrackAdapterError("invalid_field", "value is outside its allowed shape", i, `payload.${field}`);
            }
            (record as unknown as Record<string, unknown>)[field] = value;
        }
        if ((record.webVitalName === undefined) !== (record.webVitalValue === undefined)) {
            throw new AttestrackAdapterError(
                "invalid_field",
                "webVitalName and webVitalValue come together",
                i,
                "payload.webVitalName",
            );
        }
        out.push(record);
    }
    return out;
}
