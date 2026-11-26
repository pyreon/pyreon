# @pyreon/compiler-darwin-x64

## 0.55.0

### Patch Changes

- [#4858](https://github.com/pyreon/pyreon/pull/4858) [`aee634a`](https://github.com/pyreon/pyreon/commit/aee634aac159f80ead617e32fe105b34b1b8cc9d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every published package declares the supported Node.js floor: `"engines": { "node": ">=22" }`. 73 packages declared no `engines`, 13 said `>= 22` and the seven `@pyreon/compiler-*` binaries still said `>=18`. Node.js 22 is the floor of the support matrix (Node.js 22+, Bun 1.3+, browsers at Baseline 2024, iOS 17+, Android minSdk 26+), now stated on the stability page and in SECURITY.md; the new `check-support-matrix` gate keeps every package, the native platform floors and both documents in agreement, so a new package cannot ship without the field.

  Upgrade: manual — run on Node.js 22 or later (or Bun 1.3 or later); npm warns on an older Node.js

## 0.54.0

### Patch Changes

- [#4563](https://github.com/pyreon/pyreon/pull/4563) [`327771b`](https://github.com/pyreon/pyreon/commit/327771b3abd8513416f324aa7b202bcca800463c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Every published package now declares its tier in `package.json`: `"pyreon": { "stability": "stable" | "experimental", "experimentalSubpaths"?: [...] }`. From 1.0 the semver promise covers Stable packages only; Experimental packages, and the experimental subpaths of Stable packages (every `./native-plugin`, `@pyreon/core/plain`, `@pyreon/compiler/audits` and `/plain`, `@pyreon/charts/engine`, and the `./webview` subpaths of code, flow and rich-text), may break in a minor release. Each README opens with a status line generated from the field. The policy, including the compiler-helper ABI rule and deprecations, is at https://pyreon.dev/docs/stability-and-direction.

  The `@pyreon/http` and `@pyreon/loom` READMEs no longer claim the packages are unpublished.

  **Breaking (`@pyreon/meta`):** the barrel no longer re-exports `@pyreon/document-primitives` (the `Doc*` components, `createDocumentExport`, `documentTheme`, `extractDocNode`, `DocumentPreview`) or `@pyreon/connector-document` (`extractDocumentTree`, `resolveStyles`), because both are Experimental and meta is Stable. Upgrade: install those packages and import from them directly.

  The ui-core, unistyle, rocketstyle, coolgrid and elements manifests no longer claim that the low-level `Provider` logs a dev warning; it has not warned for some time.

## 0.53.0

No changes in this release.

## 0.52.0

No changes in this release.

## 0.51.0

## 0.50.0

## 0.49.0

## 0.48.0

## 0.47.0

## 0.46.0

## 0.45.0

## 0.44.0

## 0.43.1

## 0.43.0

## 0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

## 0.40.0

## 0.39.0

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

## 0.32.0

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.1

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2

## 0.26.1

## 0.26.0

## 0.25.1

## 0.25.0

## 0.24.6

## 0.24.5

## 0.24.4

## 0.24.3

## 0.24.2

## 0.24.1

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0
