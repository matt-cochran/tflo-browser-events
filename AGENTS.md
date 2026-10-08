# tflo-browser-events: notes for contributor agents

Browser capture plus WASM pattern matching (`tflo-cep`) that derives typed signals and routes
them to sinks (GA4, Edge, Console). Published to npm as the **unscoped** `tflo-browser-events`.
Agents building a host app that uses this package: read
[docs/AGENTS-integrating.md](docs/AGENTS-integrating.md) instead.

## Build and test
- **WASM:** `npm run build:wasm` runs `wasm-pack` against the companion
  [tflo](https://github.com/matt-cochran/tflo) repo at `../tflo` (override with `TFLO_PATH`).
  Check it out at the revision pinned as `TFLO_REF` in `.github/workflows/publish.yml`.
  `wasm-pack` must be installed.
- **Generated, never committed:** `src/wasm/` and `dist/` are gitignored. The tag workflow
  builds both from source.
- **Commands:** `npm ci`, `npm run build:wasm`, `npm run build:ts` (or `npm run build` for both
  plus the WASM copy), `npm run lint`, `npm test`, `npm run verify:pack`.
- Tests run locally (there is no devbox wrapper). The pattern-runtime tests need the WASM
  build.

## Branches, PRs and releases
- **Gitflow** per [docs/git-workflow.md](docs/git-workflow.md): feature → `dev` → `main`.
  `dev → main` and `main → dev` always use a **merge commit, never squash**.
- **One PR per release.** Aggregate changes so CI runs once; don't open a stream of small PRs.
- **Releases are tag-driven:** `vX.Y.Z` on `main` publishes stable (`latest`), and
  `vX.Y.Z-rc.N` on `dev` publishes an rc (`rc`). The tag version must equal `package.json`.
- **Publishing** uses the npm trusted publisher (OIDC). `NPM_TOKEN` is only a temporary
  fallback. No secrets in the repo.

## Privacy
Capture never records input values, never records element text unless a click opts in with
`captureText`, never sends `document.title` unless `page.captureTitle`, and keeps URLs read
from the page to origin + path unless `page.captureFullUrls`. Even then, `src/privacy.ts` skips form fields, editable regions and
`[data-tflo-mask]` / `[data-jz-mask]` subtrees. Any new capture of page text goes through
`capturableText` (text) or `pathOnlyUrl` / `stripUrlQueries` (URLs) and needs its own opt-in.

## EdgeSink is a contract
`src/sinks/edge.ts` is consumed by Journeeze:
`matt-cochran-products/journeeze-saas` `docs/contract/direct-mode-v1.md` §4.1 and
`docs/contract/signals-v1.md`. Any change to its wire shape (`event_id`, `seq`, the batch
body), the page-end beacon rules or the retry rules needs sign-off from that repo's owner and
from Allumata before it merges. Keep `CHANGELOG.md` and the README's EdgeSink section in step
with the code.
