# LLM Codegen Prompt — `@tflo/browser-events` Tracking Plan

You are generating a `TrackingPlan` for `@tflo/browser-events`, a
declarative browser interaction tracking SDK. The plan is a single
TypeScript object that auto-wires DOM observers, CEL derivation rules,
and sink routing.

## What you generate

A single `TrackingPlan` object:

```ts
import { type TrackingPlan } from "@tflo/browser-events";

const plan: TrackingPlan = {
  page: { id: "..." },
  track: { ... },
  presets?: [ ... ],
  rules?: [ ... ],
  sinks?: { ... },
};
```

## Step 1 — Identify the page type

Determine the page ID from the route / component name:

| Page type | page.id |
|---|---|
| Product listing | `product-listing` |
| Product detail | `product-detail` |
| Checkout | `checkout` |
| Cart | `cart` |
| Landing | `landing` |
| Blog article | `article` |
| Form page | `form-<purpose>` |
| Settings | `settings` |

Set `page.attrs` for key attributes (productId, category, etc.).

## Step 2 — Scan for sections

Sections are the main content zones users scroll through. Use these
selectors (in priority order):

1. Elements with `data-tflow-section` attribute
2. `<section>` elements with `id` attributes
3. Elements matching `[data-section-id]`
4. Major content landmarks: `main > div[id]`, `article > section`

For each section found, produce:

```ts
{ id: "<kebab-case-semantic-name>", selector: "<CSS selector>" }
```

If a section has a `data-tflow-section` attribute, use its value as the
`id` and `[data-tflow-section="value"]` as the selector.

Rules of thumb:
- 3–8 sections is a healthy range. Under 3 = page may be too simple to
  benefit from section tracking. Over 8 = consider merging minor sections.
- Prefer `id`-based selectors over class-based (they're stable).
- Don't generate sections for `<nav>`, `<footer>`, or `<header>` unless
  they are content-bearing.

## Step 3 — Identify click targets

Click targets use `data-tflow-id` attributes. This is the durable
analytics contract — CSS classes will drift, but `data-tflow-id` won't.

Find every element with `data-tflow-id` and produce:

```ts
{ id: "<the data-tflow-id value>" }
```

Also look for:
- Buttons in key CTAs: `<button>`, `<a class="cta">`, `<a class="btn">`
- Submit buttons in forms
- Navigation links that represent meaningful user choices
- If an element lacks `data-tflow-id` but is clearly trackable (e.g.
  a prominent CTA button), include it with a `selector` fallback and
  suggest adding `data-tflow-id`.

## Step 4 — Identify forms (if any)

Forms are matched by:

1. `[data-track-form]` attribute
2. `<form>` elements with `id` attributes

For each form, produce:

```ts
{ id: "<kebab-case-purpose>", selector: "<CSS selector>" }
```

## Step 5 — Identify visibility targets

Elements that appear/disappear dynamically:

1. Elements with `[data-track-visibility]` attribute
2. Modal dialogs (`.modal`, `[role="dialog"]`)
3. Toast notifications (`.toast`, `[role="alert"]`)
4. Loading spinners (`.spinner`, `[aria-busy="true"]`)
5. Error/info banners (`.alert`, `.banner`)

For each, produce:

```ts
{ id: "<kebab-case-purpose>", selector: "<CSS selector>" }
```

Only include elements that actually toggle — static elements don't
need visibility tracking.

## Step 6 — Choose presets

| Preset | When to use |
|---|---|
| `section_engagement` | Always — every page with sections needs this |
| `error_hunting` | Always — JS errors are universal |
| `scroll_tracking` | Pages with content below the fold |
| `bounce_detection` | Landing pages, marketing pages |
| `cta_performance` | Pages with tracked CTA buttons |
| `form_validation` | Pages with forms |
| `page_value` | Content sites, blogs, docs |
| `diagnostics` | Always in development; production if you want tflo health signals |

Recommended default: `["section_engagement", "error_hunting", "diagnostics"]`

Add others based on page type.

## Step 7 — Write custom rules (only if needed)

Presets cover the common cases. Write custom CEL rules for domain-specific
signals the presets don't cover.

CEL expression syntax:

| Expression | Meaning |
|---|---|
| `event.kind == "value"` | Kind equals a string |
| `event.target.id == "buy_now"` | Target id equals a string |
| `event.fieldName >= 3000` | Numeric comparison (>=, >, <=, <) |
| `expr1 && expr2` | AND compound |

Parameter paths for `emit.params`:

| Path | Resolves to |
|---|---|
| `event.target.id` | The tracked element's id |
| `event.page.id` | The page id |
| `event.fieldName` | Any field in the event's fields payload |
| `event.kind` | The event kind string |
| `event.ts` | The timestamp |

Example custom rule:

```ts
{
  id: "high_value_interaction",
  when: 'event.kind == "click" && event.target.id == "buy_now"',
  emit: {
    name: "high_value_interaction",
    params: {
      action: "event.target.id",
      page: "event.page.id",
    },
    sinks: ["ga4", "edge"],
  },
}
```

## Step 8 — Configure sinks

```ts
sinks: {
  // GA4: just supply your measurement ID
  ga4: { measurementId: "G-XXXXXXXX" },

  // Edge: your own collector for ClickHouse / data warehouse
  edge: { endpoint: "/collect/signals", batchSize: 10 },

  // Console: debug in development
  console: true,
}
```

If you don't know the GA4 measurement ID, ask the user.

## Step 9 — Validate the plan

After generating the plan, call `validatePlan(plan)` and read the
report. Fix any errors (missing selectors, bad CEL), then re-validate.

```ts
import { validatePlan } from "@tflo/browser-events";

const report = validatePlan(plan);
if (!report.valid) {
  console.table(report.issues);
  // Fix errors and re-validate
}
```

A valid plan has zero `level: "error"` issues.

## Common mistakes to avoid

1. **Using CSS classes as click IDs.** Always use `data-tflow-id`.
   Classes change; `data-tflow-id` is the analytics contract.

2. **Missing page.id.** Every plan must have a stable page identifier.

3. **Over-specifying selectors.** `#hero` is better than
   `div.container > section.hero-section:nth-child(2)`.

4. **CEL in capture, not derivation.** The `track` config generates
   raw events. CEL rules derive domain signals from them. Don't try
   to put CEL in the track config.

5. **Forgetting `diagnostics` preset.** Without it, you won't know
   when selectors rot or sinks fail.

6. **Not scoping sections.** `section[id]` is a good generic selector
   but likely picks up nav/footer. Be specific.

## Output format

Return ONLY the `TrackingPlan` object as valid TypeScript. No
explanations, no markdown wrapping. The object will be fed directly
to `tflo(plan)`.