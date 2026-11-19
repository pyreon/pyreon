---
title: Stability, Versioning & Direction
description: How Pyreon versions and releases, which packages the semver promise covers, the deprecation policy, what "device-proven" means for the native targets, which parts are mature versus experimental, and the directions under consideration for the app ecosystem.
---

Teams choosing a framework for a production app need to know how it changes, not just what it does today. This page states Pyreon's current guarantees and limits plainly. Nothing here is a dated commitment: where a direction is listed, it is a direction, not a promise.

## Versioning

- **One version for everything.** Every published `@pyreon/*` package is released as one **fixed version group**: each release publishes them all at the same version. An app can still end up with mismatched versions (a partial upgrade, a lockfile pinning one package); `pyreon info` lists the installed `@pyreon/*` versions and flags the skew, and `pyreon upgrade` aligns them. The current version is in any package's `package.json` and on npm.
- **From 1.0, Stable packages follow semantic versioning.** A breaking change to a Stable package ships only in a **major** release. A minor release adds features without breaking existing code, and a patch release fixes bugs. The promise covers Stable packages only; see [the two tiers](#two-tiers-stable-and-experimental).
- **Before 1.0 (`0.x`), breaking changes are `minor` bumps.** Patch releases do not intentionally break APIs. A changeset is required for every consumer-affecting source change in a published package.
- **Release notes** live in each package's `CHANGELOG.md` and are served by the MCP `get_changelog` tool, so an AI assistant can read what changed between the version you have and the latest. A release that breaks something says so in the changelog and, where a mechanical migration exists, ships a `pyreon upgrade` codemod for it.

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
- An unpublished package (`"private": true` in its `package.json`, currently `@pyreon/auth`) has no tier and makes no promise. Its badge reads "unpublished". It gets a tier when it is first published.

The tier is the single source of truth for the package README's status line and the badge at the top of each package page. The `check-stability-tier` gate, which runs on every pull request, also holds these rules:

- A Stable package never has a required dependency on an Experimental package, unless only its own experimental subpaths import it (the `./webview` subpaths of `@pyreon/code`, `@pyreon/flow` and `@pyreon/rich-text` use `@pyreon/primitives` this way). The one other exception is listed in the gate with its reason: `@pyreon/charts` depends on `@pyreon/primitives` so that the native toolchain finds the primitives plugin its `./native-plugin` relies on.
- `@pyreon/meta`, the Stable barrel, re-exports Stable packages only, and no `_`-prefixed names.

{/* gen:package-tiers:start */}

Of the 76 published packages (not counting the per-platform `@pyreon/compiler-*` binaries, which follow `@pyreon/compiler`), 56 are Stable and 20 are Experimental. This list is generated from each package's `package.json`.

**Experimental packages (20):** `@pyreon/atlas`, `@pyreon/connector-document`, `@pyreon/create-multiplatform`, `@pyreon/document-primitives`, `@pyreon/loom`, `@pyreon/mcp`, `@pyreon/native-cli`, `@pyreon/native-compiler`, `@pyreon/native-router-kotlin`, `@pyreon/native-router-swift`, `@pyreon/native-runtime-kotlin`, `@pyreon/native-runtime-swift`, `@pyreon/preact-compat`, `@pyreon/primitives`, `@pyreon/react-compat`, `@pyreon/solid-compat`, `@pyreon/storybook`, `@pyreon/svelte-compat`, `@pyreon/sync`, `@pyreon/vue-compat`.

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

The semver promise covers what a Stable package exports from the entry points in its `package.json` `exports` map (except experimental subpaths), the types of those exports, and the documented behaviour, CLI commands and flags, and configuration options.

Two kinds of `_`-prefixed export are treated differently:

- **Compiler-emitted runtime helpers are a stable ABI.** Compiled Pyreon code imports helpers such as `_rp` and `_pp` from `@pyreon/core`, `_tpl` and `_bind` from `@pyreon/runtime-dom`, and the `_ssr*` helpers from `@pyreon/runtime-server`. A library compiled with Pyreon 1.0 ships that code prebuilt, and under a caret range it can run against any later 1.x runtime. So within 1.x these helpers are **additive-only**: a release may add a helper, but it does not remove one or change an existing helper's signature or behaviour. Changes of that kind wait for 2.0.
- **Every other `_`-prefixed export is internal**, with no semver promise. That covers test-reset helpers such as `_resetIdCounter`, and the internals packages share with each other. Do not import them from application code.

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
| Fundamentals (`store`, `form`, `query`, `table`, `i18n`, `validation`, …) | Stable libraries for the web, apart from `@pyreon/sync` (Experimental) and `@pyreon/auth` (not published yet, so it has no tier). Several also have native runtimes; see [PMTC Library Status & Authoring](/docs/multiplatform-libraries). |
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
