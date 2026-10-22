---
title: Stability, Versioning & Direction
description: How Pyreon versions and releases, what "device-proven" means for the native targets, which parts are mature versus experimental, and the directions under consideration for the app ecosystem.
---

Teams choosing a framework for a production app need to know how it changes, not just what it does today. This page states Pyreon's current guarantees and limits plainly. Nothing here is a dated commitment: where a direction is listed, it is a direction, not a promise.

## Versioning

- **Pre-1.0 (`0.x`).** Every published `@pyreon/*` package is released as one **fixed version group**, so installed packages always match each other. The current version is in any package's `package.json` and on npm.
- **Breaking changes are `minor` bumps** while the version is `0.x`; patch releases do not intentionally break APIs. A changeset is required for every consumer-affecting source change in a published package, and CI refuses a changeset that declares a major bump.
- **Release notes** live in each package's `CHANGELOG.md` and are served by the MCP `get_changelog` tool, so an AI assistant can read what changed between the version you have and the latest.
- **Version-skew check.** `pyreon info` reports the installed `@pyreon/*` versions and flags skew; `pyreon upgrade` aligns them.

## What is mature and what is experimental

| Area | State |
| --- | --- |
| Reactivity, core, runtime-dom, router, head, server, vite-plugin | Core web framework; the surface most apps use. Pre-1.0 versioning rules above apply. |
| `@pyreon/zero` (SSR, SSG, ISR, SPA, islands) | Web meta-framework with build-time mode verification (`verify-modes`) and real-browser end-to-end suites in CI. |
| Fundamentals (`store`, `form`, `query`, `table`, `i18n`, `validation`, …) | Libraries for the web; several also have native runtimes — see [PMTC Library Status & Authoring](/docs/multiplatform-libraries). |
| **Native targets (iOS / Android via PMTC)** | **Experimental.** See below. |

## What "device-proven" means

The native targets are measured, not described. The [Multi-Platform page](/docs/multiplatform) carries a **weighted capability matrix**: each category is credited only for behavior that is *asserted* on a real iOS Simulator or Android emulator (a user-visible effect checked by an XCUITest or Compose test), not for code that merely compiles. The headline percentage is recomputed from the table by a CI gate, so it cannot drift from the evidence.

Use the matrix as your decision tool: if the capabilities your app needs are credited at the device level, they are exercised in CI; if they are not, treat them as unproven. The matrix also shows the weakest rows (for example payments, crash reporting, store release and push), so you can see exactly where the risk is.

## Compatibility promises you can rely on

- **Named failures over silent ones.** Code outside the native subset produces a named compiler warning rather than a silent miscompile; gates in CI exist specifically to keep it that way.
- **Honest comparisons.** Claims about other frameworks are kept in one place — [Pyreon vs Expo, React Native, Flutter](/docs/compare-app-frameworks) — including where Pyreon is behind.
- **Generated docs are checked.** API references, `llms.txt` and the MCP reference are generated from package manifests and verified in CI, so they do not silently describe an older API.

## Directions under consideration

These are not scheduled and may change. They are what the comparison page identifies as the biggest gaps relative to the leading app ecosystems:

1. **A native dev loop and release pipeline** — faster rebuild-and-relaunch on device, native errors mapped back to the `.tsx` source, and a documented sign-and-submit path for TestFlight and Play.
2. **A stronger third-party native story** — more first-party service bindings (payments, push providers, analytics) and a documented way for packages to ship their own `native/` sources, building on `useNativeModule` and the existing native-source resolution in the CLI.
3. **A documented answer for updates between store releases** — data-driven remote configuration and WebView islands, stated honestly alongside what cannot be done within store rules.
4. **AI-agent readiness for native projects** — the web scaffold already ships `AGENTS.md`, `CLAUDE.md`, MCP configuration and editor rules; bringing the same to the multi-platform scaffold.
5. **End-to-end test recipes** for generated apps and a CI template for building them.

Progress on the native side is visible in the matrix; progress on everything else is visible in the changelogs. If a gap on this list blocks you, say so in a GitHub issue — it is the most useful input we can get.
