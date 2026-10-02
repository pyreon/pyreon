# @pyreon/native-cli

## 0.52.0

### Minor Changes

- [#2930](https://github.com/pyreon/pyreon/pull/2930) [`1abcaef`](https://github.com/pyreon/pyreon/commit/1abcaef257b9f33b266bde3527ba1c34fcd1ba77) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(native): `JSON.stringify(x)` lowers to native serialization

  `JSON.stringify(x)` — the SAFE half of the JSON gap — now lowers to SwiftUI + Compose instead of warning: Swift `String(data: try! JSONEncoder().encode(x), encoding: .utf8) ?? ""`, Kotlin `Json.encodeToString(x)`. Emitted structs are already `Codable` / `@Serializable`, and scalars/arrays conform too, so serialization has a target on both platforms; `try!` is safe because a Codable value never throws on encode. The native-cli adds `import kotlinx.serialization.encodeToString` for the real device build (the kotlinc stub fakes it as a `Json` member, so the validate gate passed without it — the classic stub-masks-a-missing-import case).

  `JSON.parse` still emits a named warning: it throws on malformed input, which needs a native error model (`try`/`throw` lowering) PMTC does not carry yet — a tracked follow-up. Decode typed API responses via `useFetch<T>` instead.

  Verified end-to-end against real swiftc + kotlinc (object and array-of-structs); bisect-verified.

- [#2778](https://github.com/pyreon/pyreon/pull/2778) [`ff73c97`](https://github.com/pyreon/pyreon/commit/ff73c97c74a8d668acc7b6a8ad74aa2484c77c49) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Native-source resolve-and-scan toolchain — the monorepo Gap-1 fix, and the keystone for per-package native co-location.

  The scaffold hard-coded the native runtime location into the app build (iOS `project.yml` `packages:` and Android Gradle `srcDir` both pointed at a fixed `../node_modules/@pyreon/native-runtime-*` path). npm/yarn HOISTING and pnpm's symlinked store both break that: in a monorepo the runtime is usually installed at the workspace root, not the app's local `node_modules`, so the fixed path dangles and the build cannot find the runtime sources.

  `@pyreon/native-cli` gains a `wire` command and a resolver:

  - `resolveNativeSources(appDir)` walks the app's declared `@pyreon/*` deps and resolves each one's install location by walking `node_modules` upward — the same algorithm Node's resolver uses, so it is hoisting- and pnpm-symlink-safe.
  - Each package declares its native sources via a `pyreon.native` field in `package.json`, or the zero-config default dirs `native/swift/` and `native/kotlin/`. The four base runtime/router packages now declare the field pointing at their existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` / `src/main/kotlin` layout, so they resolve through the SAME convention as a co-located feature package — no name-based special-casing. This is what makes per-package native co-location possible: a feature package can ship `native/{swift,kotlin}/` and it aggregates into the app build with zero config, and a third-party package opts in by declaring the field.
  - `pyreon-native wire [--app=<dir>] [--android-out=<file>] [--json]` emits the resolved build wiring: the Gradle srcDirs list (base runtime/router + every co-located feature `native/kotlin/`, deduped, absolute), the iOS SwiftPM package paths (resolved absolute), and the co-located Swift target sources grouped by module. A DECLARED-but-missing native dir is surfaced as a broken declaration (exit 2).

  Scaffolded Android apps now resolve their Kotlin source roots through this: `scripts/build-android.sh` runs `pyreon-native wire --android-out=android/app/pyreon-native.srcdirs` after the emit (before Gradle configures), and `build.gradle.kts` prefers that resolved list, falling back to the legacy fixed `node_modules` paths for a flat layout. Existing flat apps are unaffected; monorepo apps now build.

  iOS co-location target wiring (compiling co-located feature `native/swift/` into the runtime target) is a follow-up that pairs with relocating the first feature runtime; the base Swift packages already resolve through `wire` today.

- [#2866](https://github.com/pyreon/pyreon/pull/2866) [`cce02b3`](https://github.com/pyreon/pyreon/commit/cce02b3a351cc70939b73756715fd1d165aa3580) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<Text truncate>` lowers to iOS + Android; four inert props now say they are

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

- [#3093](https://github.com/pyreon/pyreon/pull/3093) [`31f09b3`](https://github.com/pyreon/pyreon/commit/31f09b35659b395a0a0fa8adc33bc39e141910b3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<WebView src="page.html">` can finally be given a file

  Both native runtimes have always resolved a `<WebView src>` as a BUNDLED file —
  `Bundle.main` on iOS, `file:///android_asset/<src>` on Android — and nothing
  could put a file there. The assets pipeline handled images and fonts only, so
  the runtimes advertised a capability the build had no way to feed, and every
  `<WebView>` in shared source had to inline its whole page as a string.

  `assets/webhost/*.{html,js,css}` now materializes to the place each target's
  resolver actually reads. The filename is preserved verbatim on every target,
  because it IS the contract: `src="chart.html"` must find `chart.html`.

  This is the missing route for the three webview-hosted packages (code / flow /
  rich-text), whose host page is produced at BUILD time and so cannot
  appear in lowered source.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#3293](https://github.com/pyreon/pyreon/pull/3293) [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `onSelectIndex` — selection on the family hosts in the form that crosses to native. Every lowered host (`<SankeyChart>`, `<GraphChart>`, `<TreemapChart>`, `<SunburstChart>`, `<TreeChart>`, `<RiverChart>`, `<GanttChart>`, `<PolarChart>`) takes `onSelectIndex`, which receives the engine's INDEX hit (`SankeyHitIndex` `{ node, link }`, `PolarHitIndex`, or a plain index with -1 for a miss) beside the web-shaped `onSelect`. On the web it fires from the same click; on iOS/Android the compiler lowers it to a tap gesture (`DragGesture(minimumDistance: 0)` / `detectTapGestures`) that hit-tests the same layout the canvas painted — the tap position divided by the display density on Android, where the draw list is laid out in dp. New engine exports `hitTreemapIndex`, `hitSunburstIndex`, `hitTreeIndex`, `hitRiverIndex` (the existing object-returning hits now wrap them); `@pyreon/native-cli` adds the `detectTapGestures` / `LocalDensity` Kotlin imports when the emit uses them.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart navigator>` — the slider dataZoom — lowers natively. The strip is now an engine module (`navigator.ts`: `renderNavigator` over the first series across every row, `navigatorHit` for what a press grabs — band, left or right handle — and `navigatorDrag` for the window a drag produces) that the web host consumes unchanged and that generates into `PyreonChartEngine.swift/.kt`. On iOS and Android the drag rides a dedicated overlay above the strip (a clear SwiftUI layer / a Compose Box with `detectDragGestures`), so it never competes with the plot's pinch and pan, and it writes the same host window the pinch, the presets and the row slice read. The Android build now imports `detectDragGestures` (and `detectTransformGestures` for the pinch) for the real Gradle build — both live outside the star-imported packages and the stub gate could not see them missing.

- [#3709](https://github.com/pyreon/pyreon/pull/3709) [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/charts` no longer carries an ECharts-compatibility layer. It is Pyreon's own engine only: `<Chart>` with mark children, the family components, `/svg` and `/engine`.

  - The chart engine drops every `Series` / `ChartSpec` field and helper that only an ECharts option could set: the ECharts bar layout and nice-domain algorithm, label placement and rich text, emphasis/select/blur states, extra and secondary x axes, axis-line / tick / minor-tick / split-area options, grid insets, inverse axes, pictorial symbol layout and the `lines` series. None of them was reachable from `<Chart>`; the generated native engines shrink by the same amount.
  - `<FunnelChart echarts>` is removed; `funnel` covers sorting and alignment.
  - `<GaugeChart dial>` takes a spec built with the new `gaugeDial({ data, … })`, every part defaulted. On iOS and Android `dial` now warns and draws the half-circle track.
  - `visualMap` on `<HeatmapChart>`, `<CalendarChart>` and `<MapChart>` takes a spec built with the new `visualMap({ domain, … })`, which also lowers to native.
  - `<CandlestickChart zoom>` takes a `CandlestickZoom` whose fields are all optional (`inside`, `slider`, `window`, `lock`, `minSpan`, `maxSpan`).
  - `ChartHandle` loses the timeline (`step`, `playing`, `timelineChange`, `timelinePlayChange`), which only an option chart had; the native `PyreonChartHandle` follows.
  - `tweenCmds` passes `clip` / `unclip` through instead of dropping them.

  The native compiler drops the `<OptionChart>` and `<ChartWebView>` lowering. `pyreon/no-web-only-import-in-portable` no longer flags `@pyreon/charts`, which draws natively.

- [#3691](https://github.com/pyreon/pyreon/pull/3691) [`99ed841`](https://github.com/pyreon/pyreon/commit/99ed8417ee2541158b92ff6c105ce96d9a959524) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation accuracy pass over the five CLI packages — no runtime changes. `@pyreon/cli`'s README was missing the `check`/`plain`/`add`/`new`/`mcp`/`atlas`/`loom`/`lathe` commands entirely and undercounted `doctor`'s gates (8/10 instead of 13/15); rewritten against the current source, and the docs site gained `pyreon plain`/`pyreon loom`/`pyreon lathe` sections plus the `dependency-fabric` gate that two reference tables had dropped. `@pyreon/zero-cli`'s docs described `zero create` as a broken, prompt-less "copy the default template" shortcut (its actual pre-fix behavior, per the source's own history comment) instead of the full `@pyreon/create-zero` delegate it is today, and were missing `zero doctor --full` / `zero dev --routes`. `@pyreon/create-zero`'s README was missing the `monorepo` template, the `isr` render mode, `--preset`, the `--with-<feature>`/`--no-<feature>` flags, and `--typed-routes`. `@pyreon/create-multiplatform`'s docs never mentioned `--dir`/`--help`, the kebab-case project-name validation, the non-empty-target-dir refusal, or the generated `lint`/`release:keystore`/`release:android` scripts. `@pyreon/native-cli`'s README still claimed `"private": true` and "not published to npm", which stopped being true when the package started publishing; rewritten to document its full `build`/`check`/`assets`/`stage-web`/`wire` command surface.

- [#3631](https://github.com/pyreon/pyreon/pull/3631) [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A literal `<ColorModeProvider mode="light" | "dark">` now pins the platform colour scheme for its subtree on iOS and Android. On iOS it adds SwiftUI's `.environment(\.colorScheme, …)`; on Android it provides a `LocalConfiguration` whose night bit is set. A component's own `useColorMode()` below it, and every system control, now agree with the pinned mode, as on the web; before, they read the device's setting. `'system'` and a reactive mode pin nothing. The Android build imports `android.content.res.Configuration` when the emit needs it.

- [#3003](https://github.com/pyreon/pyreon/pull/3003) [`5f9c82c`](https://github.com/pyreon/pyreon/commit/5f9c82c34ac43870d1f768050174ca46139a898a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useHotkey` now lowers to a real keyboard shortcut on iOS and Android

  The manifest used to say touch platforms have no hardware-shortcut surface.
  That was false — iPads with keyboards, Chromebooks, DeX and keyboard-equipped
  tablets all reach one, and both toolkits expose it. What was missing was the
  lowering.

  ```tsx
  useHotkey('mod+s', () => save())
  ```

  ```swift
  .background(Button("") { save() }.keyboardShortcut(KeyEquivalent("s"), modifiers: [.command])…)
  ```

  ```kotlin
  Box(modifier = Modifier.focusRequester(__hkFocus).focusable().onPreviewKeyEvent { e -> … })
  ```

  The two emits are structurally different because the toolkits are: SwiftUI's
  `.keyboardShortcut` attaches to a CONTROL and fires its action, so the handler
  becomes a hidden zero-size Button's action; Compose delivers key events only to
  a FOCUSED node, so the root is wrapped focusable with a FocusRequester that
  actually requests focus.

  `mod` stays symbolic in the IR and resolves per platform — Command on iOS, Ctrl
  on Android.

  Three shapes are refused BY NAME rather than emitted wrong: a computed shortcut
  (neither toolkit can bake one in), a handler taking the KeyboardEvent (no native
  equivalent — silently ignoring it would run event-dependent logic wrongly), and
  a comma-separated combo list (one binding cannot carry two).

  Every Compose `Key` constant and SwiftUI `KeyEquivalent` in the mapping was
  verified to resolve against the real artifacts, with negative controls: Compose
  spells it `Key.Spacebar` not `Key.Space`, digits are `Key.Zero`…`Key.Nine`, and
  `Key.Home` is the Android home BUTTON — `MoveHome`/`MoveEnd` are the caret pair.

  Native app-runtime coverage: 35/37 → 36/37.

- [#3294](https://github.com/pyreon/pyreon/pull/3294) [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `<PlotChart navigator>` and `<PlotChart brush>` on Android now classify the gesture from the touch-DOWN point. Compose's `detectDragGestures` reports the point where touch slop was crossed, and slop (8dp) is wider than the navigator handle's grab (6dp), so dragging the left handle was read as a band drag and the brush anchored one slop past the press. Both surfaces are emitted as `awaitEachGesture { awaitFirstDown(); drag(id) { … } }`; the CLI adds the matching imports. Inside the drag the movement is read from `positionChange()` BEFORE `consume()` — Compose reports the unconsumed movement, so the other order reads zero on every step and the window never moves.

- [#3585](https://github.com/pyreon/pyreon/pull/3585) [`465b906`](https://github.com/pyreon/pyreon/commit/465b90663d7da27de61ade349d94b79fcce58d42) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon-native check` no longer backtracks polynomially when parsing a diagnostic's source position. A message containing `[` followed by a long run of spaces took ~13 s to scan; the position parser now takes each bracket group in one linear pass, with the same result for every real compiler/oxc message (CodeQL js/polynomial-redos).

- [#3291](https://github.com/pyreon/pyreon/pull/3291) [`6b54a0c`](https://github.com/pyreon/pyreon/commit/6b54a0c1b326facbe5a6cf65922958305aaaae3d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Derive the androidx import for every `detect*Gestures` detector rather than
  enumerating them. The hand-maintained arm covered `detectHorizontalDragGestures`
  and neither `detectTapGestures` nor `detectTransformGestures`, so a chart host
  emitting a tap handler failed the real Android build with `Unresolved reference
'detectTapGestures'` — invisible to the kotlinc stub gate, which concatenates
  its stubs into one compilation unit where a symbol resolves with or without an
  import.

- [#3019](https://github.com/pyreon/pyreon/pull/3019) [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `useStorage` now builds on Android — `rememberSaveable` was missing its import

  The hook lowers to `rememberSaveable { … }`, which lives in
  `androidx.compose.runtime.saveable` — a SUB-package the unconditional
  `androidx.compose.runtime.*` star import cannot reach, since Kotlin star imports
  are single-package. So `useStorage` had never built in a real Android app.

  The kotlinc stub declares `rememberSaveable`, so every validate-loop check
  resolved it, and no gated example used the hook — the device gate was the only
  thing that could catch it, and did:
  `Unresolved reference 'rememberSaveable'`.

- [#2839](https://github.com/pyreon/pyreon/pull/2839) [`f0146a8`](https://github.com/pyreon/pyreon/commit/f0146a8398649999a6ddceab5deea64eda99a18a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lower `useDebouncedValue` — a debounced field never updated on device

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

- [#2832](https://github.com/pyreon/pyreon/pull/2832) [`06c618f`](https://github.com/pyreon/pyreon/commit/06c618f4c871f00bdc0258aac87fb8bd0932cd0b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lower `useInterval` and `useTimeout` — a ticking clock did nothing on device

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

- [#3395](https://github.com/pyreon/pyreon/pull/3395) [`9dc1fd4`](https://github.com/pyreon/pyreon/commit/9dc1fd49eea29ff7bcadb3890b353fbec3a8117e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - A scaffolded iOS app can now reach its native Swift runtimes under any install layout. `pyreon-native wire --ios-out=<dir>` stages every co-located `native/swift` source into one directory that the Xcode project lists as a static source group, and the scaffold runs it on each build before the TSX compile. Previously 16 packages shipping Swift — including `PyreonForm`, `PyreonAuth` and `PyreonDatabase` — were wired on Android and unreachable on iOS, so the same shared source built on one platform and failed on the other with `cannot find 'PyreonForm' in scope`. The same command also links the two SwiftPM runtimes to wherever the install actually put them; the previous hardcoded `../node_modules/@pyreon/native-runtime-swift` exists only in a flat install, and under hoisting or pnpm `xcodegen generate` failed the spec outright with `Invalid local package`.

- [#3694](https://github.com/pyreon/pyreon/pull/3694) [`6250032`](https://github.com/pyreon/pyreon/commit/6250032a88299dbf1208904ac7596afa0cd0be83) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Rewrote all six READMEs against current source. Every one still described a Phase-0/A4/C1/C2 implementation state and claimed `PRIVATE / EXPERIMENTAL, not published to npm` — false since the native stack was made publishable. No runtime changes.

- [#3454](https://github.com/pyreon/pyreon/pull/3454) [`2a7ece1`](https://github.com/pyreon/pyreon/commit/2a7ece1be0b6de20a1762383ce5885c8733ee6e0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix two silent failures in the native toolchain: a syntax error passing `check`, and the LSP dropping any non-ASCII document.

  **A file that does not parse no longer lowers to nothing.** `parseSync` reports
  syntax errors in `ast.errors` and PMTC ignored that array, so an unparseable
  file produced an EMPTY program that every pass below walked without complaint —
  `transform` returned `{ code: '', warnings: [] }`, a _successful_ result. Empty
  output is legitimate for other reasons (a types-only module, a re-export
  barrel), so nothing downstream could tell "there was nothing to emit" from
  "this is not TypeScript", and both tools reported success: `pyreon-native
check` exited 0 on a file with a syntax error, and `pyreon-native build` wrote
  an empty `.swift`/`.kt` and exited 0, so the failure surfaced later as a
  missing symbol in Xcode or Gradle with nothing pointing back at the file.
  Parse errors now throw as `file:line:col: message` — the form `extractPosition`
  already parses — so `check` records an error finding and exits 2.

  `EmitOptions` gains an optional `filename`, used only in diagnostics; without
  it the message named the compiler's in-memory default (`input.tsx`), a path
  that does not exist.

  **The LSP server no longer drops documents containing non-ASCII characters.**
  Its stdio frame parser accumulated a string and compared `buffer.length` —
  UTF-16 code units — against `Content-Length`, which is a count of BYTES. Any
  multi-byte character made the two disagree, the body slice came up short,
  `JSON.parse` threw into a catch that swallows malformed frames, and the
  document was dropped with no error. In practice diagnostics stopped working
  for any file containing an accent, a curly quote or an emoji. The parser now
  buffers bytes and decodes once a whole body is in hand.

- [#2727](https://github.com/pyreon/pyreon/pull/2727) [`2b5be05`](https://github.com/pyreon/pyreon/commit/2b5be059737e000aa8ccd7d481242816f235075e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the `repository` field npm provenance requires. All six packages were
  rejected from the 0.51.0 release with a 422 (`"repository.url" is "",
expected to match "https://github.com/pyreon/pyreon"`) — `--provenance`
  publishing validates the field against the OIDC attestation, so its absence
  is a publish blocker, not cosmetic metadata.

- [#3051](https://github.com/pyreon/pyreon/pull/3051) [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Gate an example's Gradle srcDirs against what `pyreon-native wire` resolves

  The CLI resolves native co-source by walking an app's dependencies — the
  mechanism a scaffolded consumer app uses. The repo's own examples instead
  hardcode a `srcDir(...)` list, so the two can drift, and **no gate ran `wire` at
  all**: the path consumers depend on shipped unproven.

  Drift in the missing direction fails a real `gradle assembleDebug` with an
  unresolved reference, which no stub, unit test or coverage check can see — that
  happened for real with `PyreonSizedMap` and `PyreonCrdtDoc`, ~50 minutes into CI.

  The new gate found drift in the other direction immediately: seven stale
  `srcDir`s across two examples, for packages those apps no longer import or
  declare. Removed.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- [#3051](https://github.com/pyreon/pyreon/pull/3051) [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `pyreon-native wire` never followed a re-export chain

  `resolveNativeSources` has a `transitiveScope: 'first-party'` option, documented
  as the thing that makes a re-export chain aggregate. **No caller ever passed
  it**, so the transitive walk never ran — a declared, dead option.

  The consequence is a consumer-facing build failure. `useSecureStorage` is
  exported by `@pyreon/hooks`, but its Kotlin runtime `PyreonSecureStorage` lives
  in `@pyreon/storage`. An app that declares hooks (and not storage) wired only
  hooks and failed a real `gradle assembleDebug` with
  `Unresolved reference 'PyreonSecureStorage'`.

  `wireApp` now passes it, which fixes the class rather than that one pair. It
  immediately resolved two more genuinely-missing wirings in the repo's own
  examples.

  `@pyreon/hooks` also now declares `@pyreon/storage`, which is the honest
  dependency: it re-exports a hook whose native runtime lives there.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`fdd4dc2`](https://github.com/pyreon/pyreon/commit/fdd4dc2aef317b1c177f9751fcffb6d88554ff92), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b), [`4cae873`](https://github.com/pyreon/pyreon/commit/4cae873e6e08f785b4d7616611325e14c7421fb1), [`c12635c`](https://github.com/pyreon/pyreon/commit/c12635c3a9c423ac7b860293b0397583970235dd), [`81e52fb`](https://github.com/pyreon/pyreon/commit/81e52fb2c2c92596497f741cedb2398b426e2df7), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`e83a9bf`](https://github.com/pyreon/pyreon/commit/e83a9bfd2ce0d1697ee25618ba01d9840a1e6415), [`7b1351b`](https://github.com/pyreon/pyreon/commit/7b1351b7b774b6caeb7bf2d4f406f6306e146981), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`fbb41d9`](https://github.com/pyreon/pyreon/commit/fbb41d9c02351d6986cc579034a3290d2b37cc2e), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`6f79b9d`](https://github.com/pyreon/pyreon/commit/6f79b9d8ed021ec4f069009b95e26cb1a647d922), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`81e52fb`](https://github.com/pyreon/pyreon/commit/81e52fb2c2c92596497f741cedb2398b426e2df7), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9f271ae`](https://github.com/pyreon/pyreon/commit/9f271aeb2c28c58a04d443c945d30c8114a355ff), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`e669817`](https://github.com/pyreon/pyreon/commit/e6698175ffe21651057be52086b2706177e854d0), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`6c32d06`](https://github.com/pyreon/pyreon/commit/6c32d06f66afbb7fd50613e757c0b7c8dcaff957), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`61fea37`](https://github.com/pyreon/pyreon/commit/61fea37ff48712bad92baa5a0ff4deaa6afad1db), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`d4e3a2f`](https://github.com/pyreon/pyreon/commit/d4e3a2ff77159bdfffb386313c4a7854fd07f7dd), [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`0295aaa`](https://github.com/pyreon/pyreon/commit/0295aaaac118b3f8716a09b2549179be3110e8a0), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`c6bcb95`](https://github.com/pyreon/pyreon/commit/c6bcb955d3d93745b8cb9dfe9b188bcf53f58f8b), [`8e098c3`](https://github.com/pyreon/pyreon/commit/8e098c347a9670b083261cfabf67dc04b251f641), [`50a5cea`](https://github.com/pyreon/pyreon/commit/50a5cea0e2594a6335dd1fd2324e65ed756a137c), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`8d1ff30`](https://github.com/pyreon/pyreon/commit/8d1ff300e0a0904a29cec4160a2c3a75da091019), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`37e05d6`](https://github.com/pyreon/pyreon/commit/37e05d686f157a30d4839e4d168270a441e49f1f), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`9a323c2`](https://github.com/pyreon/pyreon/commit/9a323c2a9b5e5cde271b1e69cec84b002a774d39), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`f22774f`](https://github.com/pyreon/pyreon/commit/f22774ffe70af6d7be01313b27eefdbb97bd0a8f), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`5c5c0c7`](https://github.com/pyreon/pyreon/commit/5c5c0c72b1e10e03908c3d9dfc5fd729579b806c), [`7e489de`](https://github.com/pyreon/pyreon/commit/7e489de122f59b4e4e8db032a61a254ed0e10019), [`74e9151`](https://github.com/pyreon/pyreon/commit/74e9151bd2ee24171e3239f0e187842521c0e582), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95), [`c19fb0d`](https://github.com/pyreon/pyreon/commit/c19fb0d9ca1b5457ecefd9e4d99473214468dfec), [`52b0b60`](https://github.com/pyreon/pyreon/commit/52b0b60e4a7739b8811aeaa75425326e59630ae6), [`02255a2`](https://github.com/pyreon/pyreon/commit/02255a26ad0c83244633436858a178441d061b95), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`244fe91`](https://github.com/pyreon/pyreon/commit/244fe91356cda4076d0b4900c8e61bc6b013c8d1), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`69391bd`](https://github.com/pyreon/pyreon/commit/69391bd7d96e11996b67f9f679efc1ff8e3dacc3), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`59123f2`](https://github.com/pyreon/pyreon/commit/59123f278a88563c81ce781282d650bfe311879f), [`fee8cf9`](https://github.com/pyreon/pyreon/commit/fee8cf96d1f28457a8cad768d304b151f42f9dd0), [`da12179`](https://github.com/pyreon/pyreon/commit/da12179167ebedb7058462e5261a4efc6b2d2435), [`c4c2d52`](https://github.com/pyreon/pyreon/commit/c4c2d5232856e31b733dbc992ea8cbb37201f53f), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`26e1837`](https://github.com/pyreon/pyreon/commit/26e1837c562b35887a5b3866fc0251f086f32063), [`5ff6d4a`](https://github.com/pyreon/pyreon/commit/5ff6d4a1ea651d28b262a0b1250faaee71027c3c), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`8b8e2c3`](https://github.com/pyreon/pyreon/commit/8b8e2c331fb62690360254e720b05e256ca2850b), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`faeb942`](https://github.com/pyreon/pyreon/commit/faeb942b9d87b67d0510faf894974cd123b1ce35), [`2ff475b`](https://github.com/pyreon/pyreon/commit/2ff475baccb91654ad541a444269b452e6443142), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`9e2d7e5`](https://github.com/pyreon/pyreon/commit/9e2d7e5f78cbef41b19675e0c9dad27e36cb2e7c), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`cce5404`](https://github.com/pyreon/pyreon/commit/cce54042e9c2a953ffcc2a774cc42abf2b08f5ef), [`8b8e2c3`](https://github.com/pyreon/pyreon/commit/8b8e2c331fb62690360254e720b05e256ca2850b), [`1e03f8b`](https://github.com/pyreon/pyreon/commit/1e03f8bb4428acd88166d7d4dd0cc429048c211e), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`9e2d7e5`](https://github.com/pyreon/pyreon/commit/9e2d7e5f78cbef41b19675e0c9dad27e36cb2e7c), [`9e2d7e5`](https://github.com/pyreon/pyreon/commit/9e2d7e5f78cbef41b19675e0c9dad27e36cb2e7c), [`8b8e2c3`](https://github.com/pyreon/pyreon/commit/8b8e2c331fb62690360254e720b05e256ca2850b), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`a39f457`](https://github.com/pyreon/pyreon/commit/a39f45733c464f908ddb05108d738b430ea82a84), [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c), [`4e8a34d`](https://github.com/pyreon/pyreon/commit/4e8a34d62a644b7449f62ff853853a96812b2170), [`5f9c82c`](https://github.com/pyreon/pyreon/commit/5f9c82c34ac43870d1f768050174ca46139a898a), [`8abff03`](https://github.com/pyreon/pyreon/commit/8abff031996482ce254217d84370b2ec5e0d89a2), [`2eb07b2`](https://github.com/pyreon/pyreon/commit/2eb07b28dc0f64f5c65a809edc4ffcf2befe703f), [`b5bbce2`](https://github.com/pyreon/pyreon/commit/b5bbce23dcda3b05c17ba7a97eb596b97a10c2de), [`b7b499e`](https://github.com/pyreon/pyreon/commit/b7b499e61d65cdaedeea977a2a1d5daf278353ae), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`b976aa0`](https://github.com/pyreon/pyreon/commit/b976aa02bd47feceb8c3fe574edf676dc190ae37), [`a9fe413`](https://github.com/pyreon/pyreon/commit/a9fe41379e385c6b1fdddeedea62891d29108398), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`1275e17`](https://github.com/pyreon/pyreon/commit/1275e1726fed67b467377db956fda44827161589), [`ae94355`](https://github.com/pyreon/pyreon/commit/ae94355b40dc371a558c7d923eee646c20148a62), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`02c2bd9`](https://github.com/pyreon/pyreon/commit/02c2bd9140968826fb1251f818dc5bb919e5ba78), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`9ef58ed`](https://github.com/pyreon/pyreon/commit/9ef58ed9100edd53ff54a7a2ea277ea51bcfc7cc), [`cce02b3`](https://github.com/pyreon/pyreon/commit/cce02b3a351cc70939b73756715fd1d165aa3580), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`6888c29`](https://github.com/pyreon/pyreon/commit/6888c2982adcfd0fe333255efeae3cfc1107304d), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`39db4ce`](https://github.com/pyreon/pyreon/commit/39db4ce30422821ac781e72d7cc27f43ac523e17), [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f), [`dfdb7f4`](https://github.com/pyreon/pyreon/commit/dfdb7f4952d6f61dfe22fadab1e7bc31175d619f), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`dfc7231`](https://github.com/pyreon/pyreon/commit/dfc7231c48b58fb2fcd90f066d847f2c0d4faf36), [`a73f4e1`](https://github.com/pyreon/pyreon/commit/a73f4e1c992d3e5b801fdef4f7c2a69226c5f175), [`1265d08`](https://github.com/pyreon/pyreon/commit/1265d080ca5abec0702682ffc6b8967eb6f41cef), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e1161d6`](https://github.com/pyreon/pyreon/commit/e1161d6ec1446d826c0c46108376a27fe34831aa), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`5228a4f`](https://github.com/pyreon/pyreon/commit/5228a4ffcec534f2aa81197c30fecaa3b3e5632d), [`2d2a0f5`](https://github.com/pyreon/pyreon/commit/2d2a0f5d5df6816c7996012ab1535e05ffd17b4f), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`fc67b63`](https://github.com/pyreon/pyreon/commit/fc67b6322a2e15a7dc8ad464370109c1218ef35a), [`f0146a8`](https://github.com/pyreon/pyreon/commit/f0146a8398649999a6ddceab5deea64eda99a18a), [`8b49de2`](https://github.com/pyreon/pyreon/commit/8b49de2f440c9e4be30402a499b91e53bf7705f1), [`cc2467b`](https://github.com/pyreon/pyreon/commit/cc2467bc24af0bab7821e96188ac6d35bc50e5b1), [`6dc4d21`](https://github.com/pyreon/pyreon/commit/6dc4d21d337a53d6da54c8ce0026fc9b98e1d348), [`cb67b5f`](https://github.com/pyreon/pyreon/commit/cb67b5f40aabf2f585d8285784122ec7584dbc1c), [`9b1f957`](https://github.com/pyreon/pyreon/commit/9b1f9570a0f6cefb5844db9db53b1a2da4935f05), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`0f89399`](https://github.com/pyreon/pyreon/commit/0f89399bace3aced249b79a5d1bd8bfde76b19db), [`cbb7c29`](https://github.com/pyreon/pyreon/commit/cbb7c29bcec79e45be426d95c72f2f4f5556a89c), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`d873013`](https://github.com/pyreon/pyreon/commit/d873013b7c3ba8f4e2bc5984b974e684009a287d), [`5a31e4e`](https://github.com/pyreon/pyreon/commit/5a31e4e42c420fbeb5c61ea6455df721c4f7d66b), [`33388e8`](https://github.com/pyreon/pyreon/commit/33388e8ded998f953e864ed863e0bff42de2ac8f), [`06c618f`](https://github.com/pyreon/pyreon/commit/06c618f4c871f00bdc0258aac87fb8bd0932cd0b), [`411a373`](https://github.com/pyreon/pyreon/commit/411a3735a340bae20370de806eb3650b153b05ce), [`1abcaef`](https://github.com/pyreon/pyreon/commit/1abcaef257b9f33b266bde3527ba1c34fcd1ba77), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`7b1351b`](https://github.com/pyreon/pyreon/commit/7b1351b7b774b6caeb7bf2d4f406f6306e146981), [`3d22293`](https://github.com/pyreon/pyreon/commit/3d22293f162c78920fcdc7cd898c19859152ba53), [`83983ab`](https://github.com/pyreon/pyreon/commit/83983ab52f0c44acf902cc70167a5eb860231b47), [`cbb7c29`](https://github.com/pyreon/pyreon/commit/cbb7c29bcec79e45be426d95c72f2f4f5556a89c), [`70f069f`](https://github.com/pyreon/pyreon/commit/70f069f9828deb0f55699d3638bc5087e06a8950), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`ab42b2c`](https://github.com/pyreon/pyreon/commit/ab42b2c82195ad8a875a3a639454a7d836926489), [`6250032`](https://github.com/pyreon/pyreon/commit/6250032a88299dbf1208904ac7596afa0cd0be83), [`2a7ece1`](https://github.com/pyreon/pyreon/commit/2a7ece1be0b6de20a1762383ce5885c8733ee6e0), [`a0611c4`](https://github.com/pyreon/pyreon/commit/a0611c4d5a9afa2472502f5d932e1ac152861e1e), [`4be7791`](https://github.com/pyreon/pyreon/commit/4be7791afaf86864ce03a4548c30b295292e7833), [`1a64907`](https://github.com/pyreon/pyreon/commit/1a64907717ca2734bedaceceda00d368e0c0f2a9), [`f2b1d43`](https://github.com/pyreon/pyreon/commit/f2b1d433b0f833c56b173d300144436dcdcd53ae), [`ce75e18`](https://github.com/pyreon/pyreon/commit/ce75e187df03a33ae92f151dd17c8a8023eeb90a), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`290a386`](https://github.com/pyreon/pyreon/commit/290a38675f6363ac6f8f8d24cab47a70ca081af9), [`ab42b2c`](https://github.com/pyreon/pyreon/commit/ab42b2c82195ad8a875a3a639454a7d836926489), [`2b5be05`](https://github.com/pyreon/pyreon/commit/2b5be059737e000aa8ccd7d481242816f235075e), [`eed8fe9`](https://github.com/pyreon/pyreon/commit/eed8fe99d184bdb0695085e5ec06d17310d4593a), [`27bffa7`](https://github.com/pyreon/pyreon/commit/27bffa76e7d83da12f9c76b4285d88737e8c4640), [`35bd5ae`](https://github.com/pyreon/pyreon/commit/35bd5ae1a62642d0a7c1f51152ff51fcd034afb8), [`f109aea`](https://github.com/pyreon/pyreon/commit/f109aea0486d04500a3d5914ad48563b5c4803bf), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`f26322a`](https://github.com/pyreon/pyreon/commit/f26322ac0220016834d52176c2c5c3d352471601), [`1ac1477`](https://github.com/pyreon/pyreon/commit/1ac1477fdebad50d3ba15acebbf123ed6dda6339), [`1ac1477`](https://github.com/pyreon/pyreon/commit/1ac1477fdebad50d3ba15acebbf123ed6dda6339), [`896d747`](https://github.com/pyreon/pyreon/commit/896d7478d732a06345f48dc5c57a476d7578a013), [`71c4409`](https://github.com/pyreon/pyreon/commit/71c440942f4befc60b3abd74c503cc6c4b5d80eb), [`408b9b5`](https://github.com/pyreon/pyreon/commit/408b9b5324bb06acd528abf9d21642bb93beb732), [`7c69228`](https://github.com/pyreon/pyreon/commit/7c6922838c8c05695b320c62d5758e3379840560), [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c), [`45a04fb`](https://github.com/pyreon/pyreon/commit/45a04fb6e95af5b6d0dad9d3e76d5d756a218f02), [`7ee508e`](https://github.com/pyreon/pyreon/commit/7ee508efc3f5ed559a5ecfd7bbbefd8bb6785fc2), [`2eb6540`](https://github.com/pyreon/pyreon/commit/2eb6540c024529b2b26bd1bd9d97aeda64a48323), [`cce02b3`](https://github.com/pyreon/pyreon/commit/cce02b3a351cc70939b73756715fd1d165aa3580), [`5fc3b9f`](https://github.com/pyreon/pyreon/commit/5fc3b9fda70b8d96a412b08f7e58e6e0df35e8fe), [`8f53bc7`](https://github.com/pyreon/pyreon/commit/8f53bc76c600458ad950b29c6c7929f5f30225e2), [`bcb04bd`](https://github.com/pyreon/pyreon/commit/bcb04bd844bd46bb8f30760e269f38746e911b5e), [`0dbf4ac`](https://github.com/pyreon/pyreon/commit/0dbf4ac9e16589dca6d6090fb2787992f019f190), [`b1f9914`](https://github.com/pyreon/pyreon/commit/b1f991412dbd53cb2e943678aadbe89a6dfdb513), [`a4ad301`](https://github.com/pyreon/pyreon/commit/a4ad3015e4e949466969175d5a2f9533dc2b9b67), [`1373888`](https://github.com/pyreon/pyreon/commit/13738883a6c9f98398f2d31cd631adf41a5e9f5f), [`2d4cbfc`](https://github.com/pyreon/pyreon/commit/2d4cbfc1ad7c2943699765d9682dec6fb4b011f9), [`2d7a108`](https://github.com/pyreon/pyreon/commit/2d7a1089c6afb3d4dbdbbc4a2434e12ade317449), [`5b93f4c`](https://github.com/pyreon/pyreon/commit/5b93f4cb70a6e210325aca3c79678b62383bc773), [`e56b865`](https://github.com/pyreon/pyreon/commit/e56b865f08946b7f848906bf2562911fa7f95066), [`1612ed1`](https://github.com/pyreon/pyreon/commit/1612ed15b80c220d049212b0f62dabccb45aa9e9), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`14978a9`](https://github.com/pyreon/pyreon/commit/14978a9c423dbd96570ca3a8f31d108ca47e6734), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`1025315`](https://github.com/pyreon/pyreon/commit/1025315701d7eb0a2bea2958252c3a0efda34b29), [`e6ef4e3`](https://github.com/pyreon/pyreon/commit/e6ef4e33cc2556346f4a8a790e14272a7baf225d), [`41abe4d`](https://github.com/pyreon/pyreon/commit/41abe4d2eb07b2440ada7ae236fe8c8146888000), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`67a41a6`](https://github.com/pyreon/pyreon/commit/67a41a62260183c93c1b77de8713650e600ccb0d), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`9ae3ff0`](https://github.com/pyreon/pyreon/commit/9ae3ff0d972bb7525671d49c63a1e50a4aaa9a53), [`e87159b`](https://github.com/pyreon/pyreon/commit/e87159b0724e41d7bf41856f7bf877e49bab1379), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`fc30001`](https://github.com/pyreon/pyreon/commit/fc3000145376beb855a3caa659fdaa260f0b15b2), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`79bffbc`](https://github.com/pyreon/pyreon/commit/79bffbc7795aba43950760146152105dec2b389c), [`e290d40`](https://github.com/pyreon/pyreon/commit/e290d404b0f571dd2eb0179056811b19933e7842), [`000ab87`](https://github.com/pyreon/pyreon/commit/000ab8774394bcb25b1d9d7d1ea6f57c48aa0a0f), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`9ae3ff0`](https://github.com/pyreon/pyreon/commit/9ae3ff0d972bb7525671d49c63a1e50a4aaa9a53), [`49f9787`](https://github.com/pyreon/pyreon/commit/49f97872fd338519f91b7860643f77e757a224ba), [`eac9382`](https://github.com/pyreon/pyreon/commit/eac9382537578805a6550eb78370e13e1ed66574), [`2eb07b2`](https://github.com/pyreon/pyreon/commit/2eb07b28dc0f64f5c65a809edc4ffcf2befe703f), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`d191e35`](https://github.com/pyreon/pyreon/commit/d191e35e4cca3e11bd38cff2ab39ecd3d2cf2651), [`6ff12da`](https://github.com/pyreon/pyreon/commit/6ff12daac8f97c36ddc5c083810718a551a588f5), [`2a05853`](https://github.com/pyreon/pyreon/commit/2a05853c4e1e2e6a6c5b95b4fdbc7fbf8bf5c9f8), [`5f5bedf`](https://github.com/pyreon/pyreon/commit/5f5bedf81133dc6128486b083cdf59b8496c7c29), [`8637009`](https://github.com/pyreon/pyreon/commit/863700940660cacfe517bdb57db2e0dc3ce69da3), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`e224194`](https://github.com/pyreon/pyreon/commit/e224194a911b96d9a758edf86f53d38b87ec2052), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`af19db0`](https://github.com/pyreon/pyreon/commit/af19db0cdb402d1b95f7b3c04c44fd465f107b80), [`51e5d80`](https://github.com/pyreon/pyreon/commit/51e5d8023751a9e97f9fc376f49263ab45fa378e), [`8ffcd44`](https://github.com/pyreon/pyreon/commit/8ffcd4407b4ec02c33d011e2be7d1a3710a91155), [`20110e3`](https://github.com/pyreon/pyreon/commit/20110e389a3816098272d125be1ac8544fe65044), [`78f9652`](https://github.com/pyreon/pyreon/commit/78f965269befa8060db6661e9ce586f3d10c5337), [`b5bbce2`](https://github.com/pyreon/pyreon/commit/b5bbce23dcda3b05c17ba7a97eb596b97a10c2de), [`88fe476`](https://github.com/pyreon/pyreon/commit/88fe47672df01382e43a11df50adf579fac16a1a), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`da12179`](https://github.com/pyreon/pyreon/commit/da12179167ebedb7058462e5261a4efc6b2d2435), [`44e0a17`](https://github.com/pyreon/pyreon/commit/44e0a17cc2d11e5ec19c5f34a64fd6a5452facc2), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`8ab41a7`](https://github.com/pyreon/pyreon/commit/8ab41a79dda725f7ab4b68b3bd65e91893e4864a), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`62417b9`](https://github.com/pyreon/pyreon/commit/62417b9cf49986e0d35f071a8ce562896eda6706), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`e506bcf`](https://github.com/pyreon/pyreon/commit/e506bcf796a930094e5f5665b72e7efa4967a62c), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`c12635c`](https://github.com/pyreon/pyreon/commit/c12635c3a9c423ac7b860293b0397583970235dd), [`080752b`](https://github.com/pyreon/pyreon/commit/080752b16be8a67bd0ed51eb25bbe8b3dd134f80), [`33c8eae`](https://github.com/pyreon/pyreon/commit/33c8eaed5f9123e5932fbd188d9e4b48dcf08240), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`69b6ad5`](https://github.com/pyreon/pyreon/commit/69b6ad5b50760aff91ad9917bdbe00f6aee02a35), [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2), [`687d0eb`](https://github.com/pyreon/pyreon/commit/687d0eb483619c77411ea2385ea1dd702ae6ffce), [`6b90f4a`](https://github.com/pyreon/pyreon/commit/6b90f4adef7e514a4c9e8b7f2e8ec4bfa77b3e0e), [`5a83e86`](https://github.com/pyreon/pyreon/commit/5a83e86c2c1848de9b318e2fd011963f2125cd4d)]:
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
