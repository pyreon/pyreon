# @pyreon/native-runtime-swift

> **EXPERIMENTAL.** The Swift Package Manager runtime that compiler-emitted SwiftUI code links against on iOS. Published to npm — see [Native Packages](https://pyreon.dev/docs/native-packages) for why a Swift package ships through npm and how a scaffolded Xcode project resolves it.

## Installation

You don't install this directly. `@pyreon/create-multiplatform` (`pyreon new --native`) scaffolds a `package.json` dependency on it, and `pyreon-native wire --ios-out` symlinks the resolved install into the Xcode project's `PyreonPackages/` directory, where `project.yml` references it as a local SwiftPM package:

```yaml
packages:
  PyreonRuntime:
    path: PyreonPackages/native-runtime-swift
```

`import PyreonRuntime` in emitted (or hand-written) Swift then resolves against it. See [Native Packages](https://pyreon.dev/docs/native-packages#ios--resolved-symlinks-staged-sources) for the full wiring mechanism.

## What's here

Seven source files under `Sources/PyreonRuntime/`, plus their tests under `Tests/PyreonRuntimeTests/`:

| File | What it is |
|---|---|
| `PyreonReactivity.swift` | A namespace for the FEW cases that need a small helper the compiler emits onto directly — SwiftUI's `@State` IS the reactive primitive Pyreon compiles onto, so there's no separate observable layer here. Deliberately kept small. |
| `PyreonTokens.swift` | Namespace for compiler-generated design tokens (spacing, color, typography) from `@pyreon/ui-theme`. |
| `PyreonViewModifier.swift` | `PyreonStylable` — a marker protocol the styler emitter's generated `ViewModifier` types conform to, so devtools can distinguish Pyreon-emitted style modifiers from hand-written ones without runtime reflection. |
| `PyreonHttp.swift` | A real HTTP client: `PyreonHttpRequest` / `PyreonHttpResponse` builders (pure, unit-testable — no network), `PyreonHttp.send(_:)` (a real `URLSession` round trip), and `PyreonURL.encodePathParam` — a path-segment percent-encoder that matches JavaScript's `encodeURIComponent` exactly, so a `useQuery`/`useFetch` path parameter resolves to the same URL on web and iOS. |
| `PyreonJSON.swift` | `PyreonJSON.encode(_:)` — the serialization helper PMTC emits for `<WebView data={signal}>`, encoding any `Encodable` value to the JSON string a hosted web page reads as `window.__pyreonData`. |
| `PyreonChartCanvas.swift` | The hand-written SwiftUI `Canvas`-based renderer for Pyreon's native charts: the `PyreonDrawCmd` draw-list contract, a `Canvas` view that paints one, tween/mirror/transpose helpers for animated transitions between two draw lists, plus `PyreonPieChart`, `PyreonGaugeChart`, and image-export helpers. |
| `PyreonChartEngine.swift` | **Generated**, not hand-written — a line-for-line Swift port of `@pyreon/charts`' pure-geometry TypeScript engine (64 modules: scales, layouts, the Sankey/Gantt/tree/geo/etc. algorithms), produced by `packages/native/compiler/scripts/gen-chart-engine.ts`. It computes the SAME `PyreonDrawCmd` draw list on iOS that the web engine computes in JS — one geometry implementation, ported rather than re-derived, so chart layout logic can't drift between platforms. |

## Usage

Hand-written Swift can use any of this directly — the compiler is the primary consumer, but nothing requires going through it:

```swift
import PyreonRuntime

// HTTP
let res = try await PyreonHttp.send(.post("https://api.example.com/users", jsonBody: body))
let user = try res.decode(User.self)

// <WebView data={…}> bridge
let json = PyreonJSON.encode(myCodableValue)
```

## Not here: per-feature runtimes

`useStorage`, `useSecureStorage`, `useDatabase`, `useFieldArray`, camera/geolocation/bluetooth/…, `<Flow>`, `<Table>`, sync — none of that lives in this package. Each lives inside the `@pyreon/*` fundamentals package that owns the feature, under its own `native/swift/` directory (e.g. `packages/fundamentals/storage/native/swift/PyreonStorage.swift`), and is wired into the Xcode project by `pyreon-native wire` alongside this one. See [Native Packages](https://pyreon.dev/docs/native-packages) for why the split, and [PMTC Library Status & Authoring](https://pyreon.dev/docs/multiplatform-libraries) for which packages cross to native.

## Build / test locally

Requires macOS with Xcode 15+ (Swift 5.9, iOS 17 deployment target).

```bash
cd packages/native/runtime-swift
swift build
swift test
```

The npm `test` script gracefully skips when `swift` isn't on `PATH` (Linux dev machines, CI runners without the Swift toolchain), so `bun run --filter='*' test` from the repo root doesn't break on cross-platform setups.

## What to read next

- [Native Packages](https://pyreon.dev/docs/native-packages) — this package's place among the other five, and how the Xcode/Gradle wiring actually works.
- [Multi-Platform (PMTC)](https://pyreon.dev/docs/multiplatform) — the compiler that emits code against this runtime.
