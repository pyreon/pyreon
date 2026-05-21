# @pyreon/native-runtime-swift

> **PRIVATE / EXPERIMENTAL.** SwiftPM package that compiler-emitted Swift code links against on iOS. Phase 0 scaffold; see [`native-platforms-phase0-roadmap.md`](../../../.claude/plans/native-platforms-phase0-roadmap.md) PR 1 for scope + acceptance criteria.

## What lives here

Three Swift source files at the moment, all under `Sources/PyreonRuntime/`:

| File | Purpose | Status |
|---|---|---|
| `PyreonTokens.swift` | Design-system token tables (spacing, colors, typography). Compiler emits the real table in PR 7a alongside this stub. | Stub |
| `PyreonReactivity.swift` | Adapter helpers between Pyreon's `signal()`/`computed()`/`effect()` and SwiftUI's `@State`/computed properties/`.onChange(of:)`. **Intentionally near-empty** — SwiftUI's primitives ARE the reactive primitives; the compiler emits onto them directly. | Stub |
| `PyreonViewModifier.swift` | `PyreonStylable` marker protocol for the styler emitter's output (PR 7b). | Stub |

Each carries the FUTURE API surface (namespace + placeholder symbol) so downstream PRs reference the right shape early without blocking on full implementation.

## Smoke tests

`Tests/PyreonRuntimeTests/PyreonRuntimeTests.swift` exercises every public symbol — proves the package builds, links, and tests cleanly. Real functional tests land per-feature alongside the implementations.

## Build / test locally

Requires macOS with Xcode 15+ (Swift 5.9, iOS 17 target).

```bash
cd packages/native/runtime-swift
swift build
swift test
```

The npm scripts gracefully skip when `swift` isn't on PATH (Linux dev machines, CI runners without the Swift toolchain), so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups.

## Why so empty?

Per the PMTC strategic plan ([`#764`](https://github.com/pyreon/pyreon/pull/764)) and the Phase 0 roadmap ([`#797`](https://github.com/pyreon/pyreon/pull/797)):

> SwiftUI's `@State` IS the reactive primitive — Pyreon doesn't ship its own observable wrapper layer in production. The compiler emits onto SwiftUI's primitives directly. The runtime exists only for the FEW cases where the structural mapping needs a small helper (effect-with-dep-list tracking, signal-to-Combine bridging for legacy consumers).

The Phase 0 risk register flags: if this package grows past ~500 LOC of Swift, that's a signal the compiler emit shape is wrong and we should regroup. **Current size: ~80 LOC of stubs.**

## Phase 0 dependencies

This package is the foundation for **PRs 2, 3, 4, 7a, 7b, 7c, 8** per the roadmap. Every PR that touches iOS output needs this package to exist.

## Privacy

Marked `"private": true`; not published to npm. Internal-only until PMTC reaches a state worth publishing.
