# @pyreon/native-cli

## 0.52.0

### Minor Changes

- feat(native): `JSON.stringify(x)` lowers to native serialization (1abcaef)

  `JSON.stringify(x)` — the SAFE half of the JSON gap — now lowers to SwiftUI + Compose instead of warning: Swift `String(data: try! JSONEncoder().encode(x), encoding: .utf8) ?? ""`, Kotlin `Json.encodeToString(x)`. Emitted structs are already `Codable` / `@Serializable`, and scalars/arrays conform too, so serialization has a target on both platforms; `try!` is safe because a Codable value never throws on encode. The native-cli adds `import kotlinx.serialization.encodeToString` for the real device build (the kotlinc stub fakes it as a `Json` member, so the validate gate passed without it — the classic stub-masks-a-missing-import case).

  `JSON.parse` still emits a named warning: it throws on malformed input, which needs a native error model (`try`/`throw` lowering) PMTC does not carry yet — a tracked follow-up. Decode typed API responses via `useFetch<T>` instead.

  Verified end-to-end against real swiftc + kotlinc (object and array-of-structs); bisect-verified.

- Native-source resolve-and-scan toolchain — the monorepo Gap-1 fix, and the keystone for per-package native co-location. (ff73c97)

  The scaffold hard-coded the native runtime location into the app build (iOS `project.yml` `packages:` and Android Gradle `srcDir` both pointed at a fixed `../node_modules/@pyreon/native-runtime-*` path). npm/yarn HOISTING and pnpm's symlinked store both break that: in a monorepo the runtime is usually installed at the workspace root, not the app's local `node_modules`, so the fixed path dangles and the build cannot find the runtime sources.

  `@pyreon/native-cli` gains a `wire` command and a resolver:

  - `resolveNativeSources(appDir)` walks the app's declared `@pyreon/*` deps and resolves each one's install location by walking `node_modules` upward — the same algorithm Node's resolver uses, so it is hoisting- and pnpm-symlink-safe.
  - Each package declares its native sources via a `pyreon.native` field in `package.json`, or the zero-config default dirs `native/swift/` and `native/kotlin/`. The four base runtime/router packages now declare the field pointing at their existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` / `src/main/kotlin` layout, so they resolve through the SAME convention as a co-located feature package — no name-based special-casing. This is what makes per-package native co-location possible: a feature package can ship `native/{swift,kotlin}/` and it aggregates into the app build with zero config, and a third-party package opts in by declaring the field.
  - `pyreon-native wire [--app=<dir>] [--android-out=<file>] [--json]` emits the resolved build wiring: the Gradle srcDirs list (base runtime/router + every co-located feature `native/kotlin/`, deduped, absolute), the iOS SwiftPM package paths (resolved absolute), and the co-located Swift target sources grouped by module. A DECLARED-but-missing native dir is surfaced as a broken declaration (exit 2).

  Scaffolded Android apps now resolve their Kotlin source roots through this: `scripts/build-android.sh` runs `pyreon-native wire --android-out=android/app/pyreon-native.srcdirs` after the emit (before Gradle configures), and `build.gradle.kts` prefers that resolved list, falling back to the legacy fixed `node_modules` paths for a flat layout. Existing flat apps are unaffected; monorepo apps now build.

  iOS co-location target wiring (compiling co-located feature `native/swift/` into the runtime target) is a follow-up that pairs with relocating the first feature runtime; the base Swift packages already resolve through `wire` today.

- `<Text truncate>` lowers to iOS + Android; four inert props now say they are (cce02b3)

  Three documented props on the canonical primitives reached the native emit and
  produced NOTHING, on either target, with no diagnostic:

  - `<Text truncate>` → a plain `Text`, so a label that should ellipsize wrapped
    instead and reflowed the layout around it.
  - `<Stack justify="between">` → a bare `VStack` / `Column`.
  - `<Inline wrap>` → a plain `HStack` / `Row`.
  - `<Link external>` → an ordinary in-app route push, so a link to an external
    site is matched as an app route instead of opening the browser.
  - `<Button variant="danger">` → the default style, so a destructive button is
    indistinguishable from a confirm button.

  `truncate` now lowers exactly on both — `.lineLimit(1).truncationMode(.tail)`
  on SwiftUI, `maxLines = 1, overflow = TextOverflow.Ellipsis` on Compose (both
  halves are required on each: a line bound alone clips mid-glyph).

  The other four now WARN. `<Link external>` is the sharp one — not a layout
  nicety but a link that silently does the wrong thing. Compose could express `justify` on its own
  (`Arrangement.SpaceBetween`), but SwiftUI's stacks have no equivalent, and
  shipping one platform's half would put the two out of agreement — the failure
  `<Transition name>` already taught us to avoid. The warning names the tag the
  author wrote and points at the escape hatches that do lower.

### Patch Changes

- Lower `useDebouncedValue` — a debounced field never updated on device (f0146a8)

  The call emitted verbatim, so a debounced search field compiled clean and
  never updated.

  The web contract was **measured before this emit was written**, because
  "leading or trailing edge?" is exactly the question two native ports would
  answer the same wrong way and agree with each other. Four properties, all
  now asserted on the web side:

  - the value is available IMMEDIATELY — no first-delay gap
  - updates are TRAILING-edge
  - a burst collapses to the LAST value
  - the timer RESTARTS on each change rather than firing on a fixed cadence

  That last one is what makes the lowering exact rather than approximate:
  `.task(id:)` and `LaunchedEffect(key)` both cancel and restart when their key
  changes, which IS a restarting trailing-edge debounce. No runtime, no stored
  timer handle.

  Two details that took a compile to find:

  - The seed comes from the SOURCE SIGNAL's own initial, not the source
    property. A `@State` initializer runs before `self` exists, so
    `@State var d = query` is "cannot use instance member within property
    initializer" — and a type-default seed would leave the field empty for the
    whole delay on every mount, which the measured immediate-seed contract
    forbids.
  - The element type is inferred at EMIT time, where the component's inference
    context knows the source signal's type. Parse-time inference produced
    `Any`, which breaks every use site.

  The Swift stubs gained the id-keyed `task` overload — without it the stub
  matched the un-keyed one and reported "extra trailing closure", rejecting a
  correct emit. That is the stub-narrower-than-reality trap again.

  Non-literal delays and block-body getters decline by name.

  Note: the `kotlinx.coroutines.delay` stub and its conditional import also
  appear in the `useInterval`/`useTimeout` PR. Either merge order resolves
  trivially — both add the same three lines.

- Lower `useInterval` and `useTimeout` — a ticking clock did nothing on device (06c618f)

  Both are pure timing over a callback, with no platform capability behind
  them. Neither lowered: they are called at STATEMENT position, and the
  component walker's bare-statement arm DROPPED them. So a ticking clock or a
  delayed action compiled clean and did nothing on device.

  They lower to the idiom that already carries each target's
  auto-cancellation — SwiftUI's `.task`, Compose's `LaunchedEffect(Unit)` —
  which is what reproduces the web hooks' `onUnmount` cleanup with no runtime
  and no stored handle.

  Two details that are load-bearing rather than stylistic:

  - The Swift interval loop consults `Task.isCancelled` instead of `while
true`. A cancelled sleep returns immediately, so an unguarded loop would
    SPIN rather than stop.
  - The `.task` attaches to the ZStack-wrapped body, not a transparent Group.
    A modifier on a Group is redistributed onto the conditional branches inside
    it, so it would be cancelled and restarted on every state flip — the
    device-found bug the fetch harness already guards against.

  What cannot be baked declines BY NAME: a `null` (paused) delay, a reactive
  getter delay, and a non-inline callback. Silently treating a paused timer as
  a running one would be worse than declining it.

  `delay` is emitted unqualified, because the Kotlin stub file is a single
  default-package unit and cannot declare `package kotlinx.coroutines`. The
  real build gets it from a conditional import in `@pyreon/native-cli`, with
  specs in both directions — without that, the device build would fail on
  `unresolved reference 'delay'` while the stub gate stayed green.

- Add the `repository` field npm provenance requires. All six packages were (2b5be05)
  rejected from the 0.51.0 release with a 422 (`"repository.url" is "",
expected to match "https://github.com/pyreon/pyreon"`) — `--provenance`
  publishing validates the field against the OIDC attestation, so its absence
  is a publish blocker, not cosmetic metadata.
- Updated dependencies:
  - @pyreon/native-compiler@0.52.0

## 0.51.0

### Patch Changes

- Make the native stack publishable — it was `private: true` while `pyreon new --native` shipped and advertised it. (6378982)

  A scaffolded multiplatform app declares five `@pyreon/native-*` packages and
  resolves the Swift/Kotlin runtimes **out of `node_modules`** — XcodeGen consumes
  `../node_modules/@pyreon/native-runtime-swift` as a local SPM package, Gradle
  adds `../../node_modules/@pyreon/native-runtime-kotlin/src/main/kotlin` as a
  source set. So npm is not an incidental channel, it is the required one. With
  every package private, `npm install` could never fetch them: the paths did not
  exist and the native build could not run. That is why multiplatform was
  unusable outside a workspace checkout, regardless of compiler capability.

  Two of the six needed real work, not just a manifest flag:

  **`@pyreon/native-cli` shipped a `.ts` bin.** `bin` pointed at `./src/cli.ts`,
  and the scaffolded builds invoke it as `npx pyreon-native build …` — i.e. under
  **node**. Measured: node cannot execute it even on v26's type-stripping path,
  because the source uses extensionless relative imports (`./build`) that bun
  accepts and node's ESM resolver rejects. Now builds to `lib/` and ships a
  hand-written `bin/pyreon-native.js` that calls `main()` **explicitly** rather
  than relying on `cli.ts`'s `import.meta.main` guard — that guard is Bun-only
  (undefined on Node < 24.2) _and_ is dropped by the bundler, the exact
  combination that shipped `pyreon-lint` as a silent no-op in every published
  version.

  **`@pyreon/native-compiler` had no build at all** — its exports pointed straight
  at `src/index.ts`, so publishing would have shipped raw TypeScript to a
  consumer resolving `import`. Now builds to `lib/` with proper types.

  The four runtime/router packages ship SOURCE by design (Swift files for SPM,
  Kotlin for Gradle) and needed only `publishConfig.access` + `sideEffects`;
  tarball contents verified (Package.swift + Sources; 65 `.kt` files).

  Also fixes `--help`, which exited **1** and printed to **stderr**. For a
  published CLI that breaks any script or CI step checking exit codes, and hides
  usage from a plain `| grep`. Now exit 0 on stdout; error paths unchanged.

  Verified end to end: the built bin runs under **both node and bun**, produces
  byte-identical Swift and Kotlin for both targets, and `check-bin-liveness` now
  covers it — the gate caught the new bin as uncovered and failed closed, which is
  what it exists to do. `publish.ts --dry-run` completes with all six included.

  Nothing is published by this change; it only makes publishing possible.

- `<Transition>` gains configurable `duration` (ms, static literal) + `easing` (9154c8a)
  (`linear | ease-in | ease-out | ease-in-out`) on both native targets:
  `.animation(.linear(duration: 2.5), value:)` on SwiftUI,
  `AnimatedVisibility(enter/exit = fadeIn/fadeOut(tween(ms, easing)))` on
  Compose, with the CSS easings mapped to the canonical curves. Absent props
  emit byte-identically to the previous default shape (spec-locked); a
  non-literal duration warns + falls back. The CLI's conditional-import table
  learns the animation sub-package symbols (fadeIn/fadeOut/tween/easings) —
  the stub-masked-symbol class, caught by the real gradle build.
- Updated dependencies:
  - @pyreon/native-compiler@0.51.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`7c47672`](https://github.com/pyreon/pyreon/commit/7c47672dd27274ba39fcca2d8d54740db6376f66)]:
  - @pyreon/native-compiler@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`099f574`](https://github.com/pyreon/pyreon/commit/099f5746a8069326e9dccf5c46c405afa2220e46)]:
  - @pyreon/native-compiler@0.1.0

## 0.1.0

### Minor Changes

- [#1268](https://github.com/pyreon/pyreon/pull/1268) [`33642a8`](https://github.com/pyreon/pyreon/commit/33642a8ed8ffbbfaed1509fdbf4e4cd6cc1d8253) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Emit import preamble in build output — the `pyreon-native build`
  command now prepends a per-target import block to each emitted file
  (`import SwiftUI` / `import PyreonRuntime` / `import PyreonRouter` on
  Swift; the full Compose + Pyreon-runtime wildcard set on Kotlin).

  Pre-fix every emitted file failed to compile standalone — the user
  had to wrap each output in a hand-written file that supplied the
  missing imports. Generated code now compiles directly against the
  real SwiftUI / Compose toolchain.

  Unused imports are harmless on both targets.

### Patch Changes

- Updated dependencies []:
  - @pyreon/native-compiler@0.0.0
