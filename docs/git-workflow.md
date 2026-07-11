# Git workflow — feature → dev → main

This repo uses a gitflow-style branching model. **`dev` is the default branch**
(integration); **`main` is release-only** (matches what's published to npm).

```
feature/*  ──PR──▶  dev  ──release PR──▶  main
hotfix/*   ─────────────────────────────▶  main  (then back-merge to dev)
```

## Day-to-day (features)

1. Branch off `dev`:  `git switch dev && git pull && git switch -c feat/<name>`
2. Open a PR into **`dev`** (the default base).
3. Merge once CI is green.

## Releasing (dev → main)

1. Open a PR from **`dev`** into **`main`**.
2. The **`flow-guard`** check verifies the source is `dev`/`release/*`/`hotfix/*`.
3. Merge once `Build & Test (Node 18/20/22)` and `flow-guard` are green.
4. Tag the release (`git tag vX.Y.Z && git push origin vX.Y.Z`) — the OIDC
   `release.yml` publishes to npm tokenlessly (see the trusted-publisher note in
   that workflow).

## Hotfixes

Urgent fixes may branch from `main` as `hotfix/<name>` and PR directly into
`main` (allowed by the flow guard). **Back-merge `main` → `dev`** afterward.

## Enforcement (configured on GitHub)

- **`main`**: PR required · no direct pushes · no force-push · no deletion ·
  admin-enforced · required checks: `Build & Test (Node 18/20/22)`, `flow-guard` ·
  PRs may only come from `dev`/`release/*`/`hotfix/*`.
- **`dev`**: PR required · no direct pushes · no force-push · no deletion ·
  admin-enforced.

`main` must never be ahead of `dev`. After any hotfix, back-merge `main → dev`.
