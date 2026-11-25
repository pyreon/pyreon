---
title: Stability, Versioning & Direction
description: How Pyreon versions and releases, which packages the semver promise covers, the supported Node.js, Bun, browser, iOS and Android versions, the deprecation policy, what "device-proven" means for the native targets, which parts are mature versus experimental, and the directions under consideration for the app ecosystem.
---

Teams choosing a framework for a production app need to know how it changes, not just what it does today. This page states Pyreon's current guarantees and limits plainly. Nothing here is a dated commitment: where a direction is listed, it is a direction, not a promise.

## Versioning

- **One version for everything.** Every published `@pyreon/*` package is released as one **fixed version group**: each release publishes them all at the same version. An app can still end up with mismatched versions (a partial upgrade, a lockfile pinning one package); `pyreon info` lists the installed `@pyreon/*` versions and flags the skew, and `pyreon upgrade` aligns them. The current version is in any package's `package.json` and on npm.
- **From 1.0, Stable packages follow semantic versioning.** A breaking change to a Stable package ships only in a **major** release. A minor release adds features without breaking existing code, and a patch release fixes bugs. The promise covers Stable packages only; see [the two tiers](#two-tiers-stable-and-experimental).
- **Before 1.0 (`0.x`), breaking changes are `minor` bumps.** Patch releases do not intentionally break APIs. A changeset is required for every consumer-affecting source change in a published package.
- **Release notes** live in each package's `CHANGELOG.md` and are served by the MCP `get_changelog` tool, so an AI assistant can read what changed between the version you have and the latest. A release that breaks something says so in the changelog and, where a mechanical migration exists, ships a `pyreon upgrade` codemod for it.
- **Moving to 1.0.** [Upgrading to 1.0](/docs/upgrading-to-v1) lists every breaking change between 0.54 and the 1.0 release candidate, with before-and-after code and the `pyreon upgrade` codemod that handles it, or the step you take by hand.

## Support matrix

Pyreon supports the platforms below, from the 1.0 release candidate on. Versions older than these are not supported. CI runs on newer versions than the floors (the current Node.js LTS and the Bun version in `.bun-version`), so a floor is the oldest version Pyreon is written for, not one every CI run exercises.

| Platform | Supported versions | Where it is declared |
| --- | --- | --- |
| Node.js | Node.js 22 and later | `"engines": { "node": ">=22" }` in every published `@pyreon/*` package. Covers SSR, SSG, the Vite plugin, the CLIs and the compiler. |
| Bun | Bun 1.3 and later | Bun has no `engines` check, so this table is the declaration. |
| Browsers | Baseline 2024 | The browser versions that support every web feature that became [Baseline](https://web.dev/baseline) in 2024. browserslist (`baseline 2024`) resolves that to Chrome and Edge 130, Firefox 132, and Safari and iOS Safari 18.2, or later. |
| iOS | iOS 17 and later (macOS 14 for macOS builds) | `.iOS(.v17)` / `.macOS(.v14)` in the `Package.swift` of `@pyreon/native-runtime-swift` and `@pyreon/native-router-swift`, and the deployment target `create-multiplatform` scaffolds. |
| Android | minSdk 26 (Android 8.0) and later | `minSdk = 26` in the app `build.gradle.kts` that `create-multiplatform` scaffolds; the Kotlin runtime ships as source, so your app's `minSdk` applies. |

The browser floor is what Pyreon's own code relies on; it does not change your app's Vite `build.target`. The `check-support-matrix` gate keeps the declarations in the right-hand column, this table and [SECURITY.md](https://github.com/pyreon/pyreon/blob/main/SECURITY.md) in agreement. A change to a floor is announced in the changelog and on this page.

## Security

Report a vulnerability privately through [GitHub security advisories](https://github.com/pyreon/pyreon/security/advisories/new), never in a public issue. [SECURITY.md](https://github.com/pyreon/pyreon/blob/main/SECURITY.md) says which versions receive security fixes and how quickly a report is answered.

## Two tiers: Stable and Experimental

Every published package declares its tier in its own `package.json`:

```json
"pyreon": {
  "stability": "stable",
  "experimentalSubpaths": ["./native-plugin"]
}
```

- **Stable** packages carry the semver promise above.
- **Experimental** packages may break in a **minor** release. So may the **experimental subpaths** of a Stable package (`experimentalSubpaths`, for example every `./native-plugin` entry, `@pyreon/core/plain` and `@pyreon/charts/engine`). The changelog says when they break.
- An individual API inside a Stable entry point can also be marked experimental. Its reference page and the MCP reference label it experimental, and the same minor-release rule applies to it.
- An unpublished package (`"private": true` in its `package.json`) has no tier and makes no promise. Its badge reads "unpublished". It gets a tier when it is first published.

The tier is the single source of truth for the package README's status line and the badge at the top of each package page. The `check-stability-tier` gate, which runs on every pull request, also holds these rules:

- A Stable package never has a required dependency on an Experimental package, unless only its own experimental subpaths import it (the `./webview` subpaths of `@pyreon/code`, `@pyreon/flow` and `@pyreon/rich-text` use `@pyreon/primitives` this way). The one other exception is listed in the gate with its reason: `@pyreon/charts` depends on `@pyreon/primitives` so that the native toolchain finds the primitives plugin its `./native-plugin` relies on.
- `@pyreon/meta`, the Stable barrel, re-exports Stable packages only, and no `_`-prefixed names.

{/* gen:package-tiers:start */}

Of the 86 published packages (not counting the per-platform `@pyreon/compiler-*` binaries, which follow `@pyreon/compiler`), 56 are Stable and 30 are Experimental. This list is generated from each package's `package.json`.

**Experimental packages (30):** `@pyreon/ambient`, `@pyreon/atlas`, `@pyreon/auth`, `@pyreon/calendar`, `@pyreon/charts-maps`, `@pyreon/command`, `@pyreon/connector-document`, `@pyreon/create-multiplatform`, `@pyreon/document-primitives`, `@pyreon/format`, `@pyreon/loom`, `@pyreon/mcp`, `@pyreon/money`, `@pyreon/native-cli`, `@pyreon/native-compiler`, `@pyreon/native-router-kotlin`, `@pyreon/native-router-swift`, `@pyreon/native-runtime-kotlin`, `@pyreon/native-runtime-swift`, `@pyreon/preact-compat`, `@pyreon/primitives`, `@pyreon/react-compat`, `@pyreon/schedule`, `@pyreon/solid-compat`, `@pyreon/storybook`, `@pyreon/svelte-compat`, `@pyreon/sync`, `@pyreon/time`, `@pyreon/upload`, `@pyreon/vue-compat`.

**Stable packages with experimental subpaths:**

| Package | Experimental subpaths |
| --- | --- |
| `@pyreon/charts` | `./engine`, `./native-plugin` |
| `@pyreon/code` | `./webview`, `./native-plugin` |
| `@pyreon/compiler` | `./audits`, `./plain` |
| `@pyreon/core` | `./plain`, `./native-plugin` |
| `@pyreon/flow` | `./webview`, `./native-plugin` |
| `@pyreon/rich-text` | `./webview`, `./native-plugin` |
| 32 more packages | `./native-plugin` only: `@pyreon/a11y`, `@pyreon/attrs`, `@pyreon/coolgrid`, `@pyreon/dnd`, `@pyreon/elements`, `@pyreon/feature`, `@pyreon/form`, `@pyreon/head`, `@pyreon/hooks`, `@pyreon/hotkeys`, `@pyreon/http`, `@pyreon/i18n`, `@pyreon/kinetic`, `@pyreon/kinetic-presets`, `@pyreon/machine`, `@pyreon/permissions`, `@pyreon/query`, `@pyreon/reactivity`, `@pyreon/rocketstyle`, `@pyreon/router`, `@pyreon/rx`, `@pyreon/sized-map`, `@pyreon/state-tree`, `@pyreon/storage`, `@pyreon/store`, `@pyreon/styler`, `@pyreon/table`, `@pyreon/toast`, `@pyreon/ui-core`, `@pyreon/url-state`, `@pyreon/validate`, `@pyreon/validation` |

{/* gen:package-tiers:end */}

## What counts as public API

The semver promise covers what a Stable package exports from the entry points in its `package.json` `exports` map (except experimental subpaths and the internal subpaths below), the types of those exports, and the documented behaviour, CLI commands and flags, and configuration options.

Two kinds of `_`-prefixed export are treated differently:

- **Compiler-emitted runtime helpers are a stable ABI.** Compiled Pyreon code imports these helpers from the main entries, and a library compiled with Pyreon 1.0 ships that code prebuilt; under a caret range it can run against any later 1.x runtime. So within 1.x these helpers are **additive-only**: a release may add a helper, but it does not remove one or change an existing helper's signature or behaviour. Changes of that kind wait for 2.0. The ABI is exactly:
  - `@pyreon/core`: `_fuse`, `_lc`, `_pk`, `_pp`, `_rp`, `_rpd`, `_slot`, `_wrapSpread` (plus the public `cx` and `h`).
  - `@pyreon/reactivity`: `_bind` (plus the public `renderEffect`).
  - `@pyreon/runtime-dom`: `_tpl`, `_applyProps`, `_bindDirect`, `_bindProp`, `_bindSpread`, `_bindText`, `_dispose2`, `_dispose3`, `_dispose4`, `_disposeN`, `_mountChild`, `_mountSlot`, `_ref`, `_rsCollapse`, `_rsCollapseDyn`, `_rsCollapseDynH`, `_rsCollapseH`, `_setAttr`, `_setChild`, `_setChildAt`, `_setClass`, `_setHtml`, `_setProp`, `_setPropStatic`, `_setStyle`, `_setStyleOnce`, `_setValue`, `_textSlot` (plus the public `bindPolymorphicText`).
  - `@pyreon/runtime-server`: `_ssr`, `_ssrAttr`, `_ssrAttrGen`, `_ssrAttrUrl`, `_ssrChildren`, `_ssrDeferred`, `_ssrForKeyed`, `_ssrItem`, `_ssrNode`, `_esc`, `_escSole`.
- **Every other `_`-prefixed export is internal**, with no semver promise, and it is not on a public entry. Test-reset helpers (such as `_resetIdCounter`) and the internals packages share with each other live on each package's **`./internal`** subpath (`@pyreon/core/internal`, `@pyreon/toast/internal`, …); the Node-only ones of `@pyreon/zero` and `@pyreon/zero-content` live on `./internal-server`. The plumbing the compat layers use (`isNativeCompat`, `NATIVE_COMPAT_MARKER`, `mapCompatDomProps`, `shallowEqualProps`, `_compatProps`) lives on **`@pyreon/core/compat`**. These subpaths change in any release, in lockstep with the packages that import them; do not import them from application code. (`nativeCompat()`, which a component applies to itself, is public API on `@pyreon/core`.)

Internal helpers without a `_` prefix (test seams, plumbing one package shares with another) follow the same rule: their declaration carries a JSDoc `@internal` tag and they live on the package's `./internal` subpath. The `check-stability-tier` gate fails a `_`-prefixed runtime export on any public entry that is not in the ABI list above, fails an ABI entry the runtime no longer exports, and fails any public-entry export whose declaration is tagged `@internal`. For the 0.55 move, `pyreon upgrade` (codemod `internal-exports-subpath`) rewrites static imports of the `_` exports and the `@pyreon/core/compat` plumbing that left the public entries. The non-`_` `@internal` exports moved in the same release have no codemod: import them from the package's `./internal` (or `./internal-server`) subpath by hand.

Because internals change in any release, a package that imports another package's internal subpath must run against exactly the same version of it. The packages ship in lockstep (one version for all of them), and the gate enforces that too: when a package's shipped source imports `@pyreon/x/internal`, `@pyreon/x/internal-server` or `@pyreon/core/compat`, its `package.json` must declare `@pyreon/x` in `dependencies` or `peerDependencies` as `workspace:*`, which publishes as the exact version (`"@pyreon/core": "1.0.0"`), never a caret range.

## Deprecation policy

- A Stable API is deprecated before it is removed. The deprecation is a `@deprecated` JSDoc tag that names the replacement, so editors strike the symbol through, plus a manifest entry with `stability: 'deprecated'`, the version it was deprecated in, and `removeIn`. The generated reference and the MCP reference show the deprecation.
- A deprecated Stable API keeps working until the next major release at the earliest, so `removeIn` is always a major version.
- The `check-stability-tier` gate fails any `@deprecated` tag in a published package that has no manifest entry with `removeIn`. The only exceptions are listed in the gate with a reason each, for example a type-level guard with nothing to remove.
- Experimental APIs can be changed or removed in a minor release. They are usually deprecated first, but that is not guaranteed.

## What is mature and what is experimental

| Area | State |
| --- | --- |
| Reactivity, core, runtime-dom, router, head, server, vite-plugin | Stable. The core web framework; the surface most apps use. |
| `@pyreon/zero` (SSR, SSG, ISR, SPA, islands) | Stable. Web meta-framework with build-time mode verification (`verify-modes`) and real-browser end-to-end suites in CI. `mode: 'auto'` is an experimental option. |
| Fundamentals (`store`, `form`, `query`, `table`, `i18n`, `validation`, …) | Stable libraries for the web, apart from the Experimental ones listed above, among them `@pyreon/sync` and `@pyreon/auth`. Several also have native runtimes; see [PMTC Library Status & Authoring](/docs/multiplatform-libraries). |
| Compat layers (`react-compat`, `preact-compat`, `vue-compat`, `solid-compat`, `svelte-compat`) | Experimental. They track upstream APIs that keep moving. |
| **Native targets (iOS / Android via PMTC)** | **Experimental** overall; each area carries its own tier in [Maturity by area](/docs/multiplatform#maturity-by-area). See below. |

## What "device-proven" means

The native targets are measured, not described. The [Multi-Platform page](/docs/multiplatform) carries a **weighted capability matrix**: each category is credited only for behavior that is *asserted* on a real iOS Simulator or Android emulator (a user-visible effect checked by an XCUITest or Compose test), not for code that merely compiles. The headline percentage is recomputed from the table by a CI gate, so it cannot drift from the evidence.

Use the matrix as your decision tool: if the capabilities your app needs are credited at the device level, they are exercised in CI; if they are not, treat them as unproven. The matrix also shows the weakest rows (for example payments, crash reporting, store release and push), so you can see exactly where the risk is. The same rows set each area's tier — Beta at 0.8 or above, Experimental from 0.4, Not ready below — in [Maturity by area](/docs/multiplatform#maturity-by-area), and the CI gate checks the tiers against the fractions too.

## Compatibility promises you can rely on

- **Named failures over silent ones.** Code outside the native subset almost always produces a named compiler warning rather than a silent miscompile; the rare silent case is a bug, and gates in CI exist to keep it that way.
- **Honest comparisons.** Claims about other frameworks are kept in one place — [Pyreon vs Expo, React Native, Flutter](/docs/compare-app-frameworks) — including where Pyreon is behind.
- **Generated docs are checked.** API references, `llms.txt` and the MCP reference are generated from package manifests and verified in CI, so they do not silently describe an older API.

## Directions under consideration

These are not scheduled and may change. They are what the comparison page identifies as the biggest gaps relative to the leading app ecosystems:

1. **Native errors mapped back to the `.tsx` source, and a documented sign-and-submit path for TestFlight and Play.** The rebuild-and-relaunch loop already ships as [`pyreon-native dev`](/docs/native-dev-loop), and on-device flows are covered in [Native E2E Testing](/docs/native-e2e-testing).
2. **A stronger third-party native story** — more first-party service bindings (payments, push providers, analytics) and a documented way for packages to ship their own `native/` sources, building on `useNativeModule` and the existing native-source resolution in the CLI.
3. **A documented answer for updates between store releases** — data-driven remote configuration and WebView islands, stated honestly alongside what cannot be done within store rules.
4. **AI-agent readiness for native projects** — the multi-platform scaffold already writes `AGENTS.md`, `CLAUDE.md` and an `.mcp.json`; the editor-specific rules the web scaffold can generate are not included yet.
5. **End-to-end test recipes** for generated apps and a CI template for building them.

Progress on the native side is visible in the matrix; progress on everything else is visible in the changelogs. If a gap on this list blocks you, say so in a GitHub issue — it is the most useful input we can get.
