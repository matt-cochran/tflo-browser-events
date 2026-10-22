# Proposed Attestrack delivery contract

Status: review proposal only, October 22, 2026. No transport, public export,
site installation, publication or deployment is implemented by this document.
Preserve outbound/publication approvals and existing SHADOW configuration.

## Source evidence

- tflo-browser-events dev 16691cb0730736d092fde72a2688a4a5c526db58:
  src/adapters/attestrack.ts, src/types.ts, src/sinks/edge.ts, AGENTS.md,
  docs/AGENTS-integrating.md. Post-merge CI 39820583964 passed. The mapper
  alone has 89 fictional tests; full Node 18/20/22 CI runs 257 tests per job.
- Attestrack reviewed source 3aa0b1a3a4b2efe2f69960e5890416822d3e00b0:
  packages/worker-core/src/create-fetch-handler.ts (POST handler), cors.ts,
  packages/schema/src/tracking.schema.ts and
  packages/strategies/src/mandatory/consent.ts. This is reviewed source,
  not evidence of a deployed revision.
- Existing EdgeSink is a separate wire contract with Journeeze/Allumata.
  Its batching, retry and beacon semantics must remain unchanged. Changes
  require those product owners' signoff under AGENTS.md.

## Additive public interface for review

Export the existing pure mapper and its types through a reviewed package API.
Add a separately named Attestrack transport; do not silently reinterpret
EdgeSink batches. The host supplies a fixed deployment manifest containing
site ID, environment, same-origin collector URL, reviewed event allowlist,
privacy-safe field/route-template mappings and explicit timestamp mode/origin.
Never choose site, destination or environment from event payloads or query args.
One consent subscription and one transport instance belong to one site context.

A proposed consent source exposes a synchronous snapshot of effective local
permission and a monotonic revision, plus a change subscription. Unknown,
declined, withdrawn and applicable GPC-denied states deny optional event sends.
The snapshot is a local scheduling input, not a signed consent assertion.
The Worker remains authoritative for signed cookie verification and SHADOW
annotations. This transport may conservatively withhold optional events while
SHADOW stays configured; it must not change the server's mode.

## Send, withdrawal and retry contract

1. Recheck consent immediately before mapping/enqueueing. Do not buffer
   pre-consent raw payloads for later replay. Bound memory by count and bytes.
2. Associate any mapped record with the site and consent revision at capture.
   Reject a site-context change rather than retagging old records.
3. Before every actual request, retry, queued microtask or page-end send,
   recheck permission and revision. If either changed, drop the queued record.
   A later grant must not revive records captured under an earlier revision.
4. Withdrawal synchronously increments the revision, clears queued events and
   retry timers, and aborts in-flight fetches where possible. Unsubscribe on
   disposal. Recheck revision after any asynchronous scheduling boundary.
5. Aborting cannot retract an already transmitted request. Record that limit
   explicitly; do not claim retroactive deletion. Server consent evaluation
   and any separately authorized deletion policy remain independent controls.
6. Initial implementation should have no beacon path and no background/persistent
   storage. Beacons cannot be recalled after submission, so adding them needs
   a separate consent/ordering contract and tests. Existing EdgeSink is untouched.
7. Retry only reviewed transient failures with a fixed cap/backoff and stable
   fictional-tested event ID. Recheck consent before each attempt. Do not
   retry client validation/auth failures, retag events, or promise exactly-once
   delivery without a verified server deduplication contract.

## Endpoint, body and authority

The inspected Worker accepts POST /t/event with ONE JSON trackingEventV1 object,
not {batch:[...]}. The transport must send one closed mapped record per request
unless a separately reviewed server batch endpoint is introduced.

Prefer a same-origin collector path with fixed routing to the correct Worker.
No warehouse, query, Access service or OPV/provider credential belongs in browser
headers or source. Signed first-party at_consent cookies are verified server-side;
consentDecision:'granted' in a JSON body is not authentication. If cross-origin
subdomains are required, first prove credentials-included fetch, the explicit
configured trusted origin, credentialed CORS and actual cookie-domain/SameSite
behavior. Never use wildcard credentialed CORS or assume CORS is authorization.

The current handler validates the event schema and returns {ok:true,accepted:true}
before its scheduled background pipeline finishes. HTTP acceptance therefore
proves neither a warehouse write nor dashboard visibility. The inspected consent
strategy verifies its token against configured site ID, but this inspection does
not prove rejection of a mismatched event body's siteId. Require an explicit
server-side configured-site/event-site rejection test and fix if absent before
claiming cohort isolation; browser configuration alone is insufficient.

Portal and query API authentication must be separately demonstrated. Public
consent/event paths must not inherit a portal login redirect accidentally.
Actual database identities require separate site/environment INSERT grants and
read-only query grants, tested for forbidden operations and cross-site access.

## Privacy-safe routing

Callers map dynamic pages to reviewed templates such as /products/:product,
not raw user paths. Identifier syntax and query/fragment removal do not detect
all personal data. No raw text, form values, error stacks, arbitrary params,
referrers or marketing tags are copied as a fallback. A mapping/schema change
requires reviewed site configuration and new fictional negative fixtures.

## Acceptance tests before transport merge

| Boundary | Required fictional proof |
| --- | --- |
| Public API | Published package import resolves the mapper/types; existing API unchanged |
| Timestamp | Epoch and monotonic origins retain intended ISO times; invalid/overflow denied |
| Consent | Unknown/declined/withdrawn/GPC deny mapping and network sends |
| Race | Withdrawal between enqueue, microtask and retry yields zero subsequent sends |
| Regrant | Previously queued events never revive after a later grant |
| In flight | Abort called, queue cleared; already-sent limitation remains explicit |
| Disposal | No timers, subscription callbacks or late sends after dispose |
| Wire | One v1 body per request; no EdgeSink mutation or batch-to-single confusion |
| Site | Payload cannot change destination/site; server rejects forged/mismatched site |
| Origin | Untrusted origin denied, same-origin works; subdomain credentials tested if selected |
| Privacy | Route templates replace dynamic identifiers; raw fields/query/fragment never forwarded |
| Retry | Stable ID/capped transient retries, consent rechecked; no exactly-once claim |
| Server | Invalid token, expired token, wrong-site token and absent token exercised with actual mode |
| Portal | Anonymous/cross-site access denied on portal AND query API |

## Live event-to-dashboard acceptance per site/environment

Inventory the intended sites and their exact deployed revisions first; repository
names or a health endpoint are not installation evidence. For each chosen
staging site, produce a unique fictional event ID and a nonpersonal reviewed
route template after explicit test consent. Retain a scrubbed evidence chain:

1. Exact site/config/Worker/image revisions and consent/mode context.
2. Browser request showing fixed endpoint and one closed v1 body, with no cookie
   values, tokens, customer data or personal browser state in artifacts.
3. Server processing evidence correlated by that fictional event ID, then an
   actual warehouse row using the qualified query identity.
4. The SAME ID/time/site visible in the authenticated real dashboard/Explore;
   no fixture, mock response or unrelated aggregate substitutes for this check.
5. Negative runs after withdrawal and under another site/environment, proving
   no new row/visible event in the wrong cohort over a defined observation window.
6. Worker error/retry recovery, persistent restart readback and isolated restore
   qualification before production acceptance, with explicit retention objectives.

A successful staged OPV credential receipt is already available, but no running
warehouse or dashboard is established by that receipt. Provider authentication,
image publication, authenticated inventory projection/execution, connectivity and
recovery remain separate rollout gates. OPV issue #234 is a dependency, not
permission for manual token export or a provider-auth workaround.

## Release gates still open

The mapper package currently rebuilds source on main CI and tag publication.
Issue #16 tracks trusted retained-result/artifact promotion. This proposal does
not authorize main promotion, tagging, npm publication, site installation or
provider applies. Obtain interface review, implement and qualify the selected
transport, resolve release provenance, then obtain the existing operator and
publication approvals. Dashboard acceptance remains open until the live chain
above is observed for each intended site/environment.