# Pyreon entry for krausest/js-framework-benchmark

This directory is the `frameworks/keyed/pyreon` implementation staged for the independent [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark). It has not been submitted, and no official number exists.

It builds from published npm packages only: exact versions in `package.json`, and a `package-lock.json` written by npm. `package.json` is the one place the pinned version is written; `bun scripts/sync-krausest-pin.ts` moves it and regenerates the lockfile, and `bun scripts/check-krausest-entry.ts` (part of `validate-fast`) fails when the entry drifts from upstream's rules.

Upstream's rules, the commands that run upstream's own keyed, CSP and smoke checks against this entry, and the submission steps are in [`.agents/guides/benchmarks/references/krausest-submission.md`](../../../.agents/guides/benchmarks/references/krausest-submission.md).

**Opening the upstream pull request is the maintainer's decision.** This file is not copied upstream.

## Build it here

```sh
npm ci --ignore-scripts
npm run build-prod
bun ../smoke.mjs        # from this directory: drives the built page in Chromium
```

## Implementation notes

- State is `signal()`; the list is `<For each={rows} by={(row) => row.id}>`.
- Selection is one `selected` signal read through `createSelector`, so a click updates two rows.
- Each row's label is its own signal, so "update every 10th row" patches only the changed text nodes.
- Handlers are written per row with `onClick`; the code calls no DOM API other than `document.getElementById('main')` for the mount target.
- The build is `@pyreon/vite-plugin`, the compiler every Pyreon app uses. Nothing in the entry exists only for the benchmark, and it declares no upstream issue flag because none applies.
