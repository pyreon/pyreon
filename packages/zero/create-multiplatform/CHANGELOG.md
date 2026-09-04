# @pyreon/create-multiplatform

## 0.52.0

### Minor Changes

- Scaffolded Android apps gain a real release lane: a `release` signingConfig backed by `android/keystore.properties`, a `scripts/ensure-release-keystore.sh` generator (self-signed — Play App Signing re-signs store uploads, so the local key proves the full sign→install→run path credential-free; a real upload key drops into the same properties shape), `npm run release:android`, a `testBuildType` toggle so `gradle -PpyreonReleaseTests connectedCheck` re-runs the app's instrumented tests against the signed R8-minified release artifact, test-APK-only `-dontwarn` rules for androidx.test's compile-only annotations, and a project `.gitignore` (previously absent entirely — signing material was committable). (03b9599)
- A scaffolded multiplatform app now ships a `.pyreonlintrc.json` that turns the (bb2dc02)
  `portable` rule tier on, plus the `lint` script to run it.

  The two `portable` rules exist to catch shared source that will not lower to
  SwiftUI or Compose — an out-of-subset construct, a platform branch with no
  native arm — before the next native build finds it. They are `optIn`, correctly,
  because they are pure noise in a web-only project, which means
  `preset: 'recommended'` leaves them off. This scaffolder shipped no lint config
  at all, so a scaffolded native app got the native rules switched off: rules
  written for multiplatform, a multiplatform scaffolder, and they never met.

  The config has two halves and both are load-bearing. `groups: { portable }`
  enables the tier in one line — the affordance worth showing, since an app can
  then state its platform story in config rather than rule by rule. But
  `no-out-of-subset-construct` additionally fires on NOTHING until
  `portablePaths` names the files that must travel (deliberate: unscoped it
  produces thousands of findings in code entitled to the whole language, and
  which files reach iOS and Android cannot be inferred from their contents). A
  scaffolder is the one caller that knows the answer, having just created `src/`.
  Without it the group key looks like it enabled something and enables nothing —
  which is how the first cut of this change was written, and what its own test
  caught.

  Verified by running the SCAFFOLDER'S emitted config through the real `lint()`
  rather than a re-typed copy, and bisected three ways: dropping the group key,
  the paths option, or the whole file each fails.

- Native-source resolve-and-scan toolchain — the monorepo Gap-1 fix, and the keystone for per-package native co-location. (ff73c97)

  The scaffold hard-coded the native runtime location into the app build (iOS `project.yml` `packages:` and Android Gradle `srcDir` both pointed at a fixed `../node_modules/@pyreon/native-runtime-*` path). npm/yarn HOISTING and pnpm's symlinked store both break that: in a monorepo the runtime is usually installed at the workspace root, not the app's local `node_modules`, so the fixed path dangles and the build cannot find the runtime sources.

  `@pyreon/native-cli` gains a `wire` command and a resolver:

  - `resolveNativeSources(appDir)` walks the app's declared `@pyreon/*` deps and resolves each one's install location by walking `node_modules` upward — the same algorithm Node's resolver uses, so it is hoisting- and pnpm-symlink-safe.
  - Each package declares its native sources via a `pyreon.native` field in `package.json`, or the zero-config default dirs `native/swift/` and `native/kotlin/`. The four base runtime/router packages now declare the field pointing at their existing `Sources/PyreonRuntime` / `Sources/PyreonRouter` / `src/main/kotlin` layout, so they resolve through the SAME convention as a co-located feature package — no name-based special-casing. This is what makes per-package native co-location possible: a feature package can ship `native/{swift,kotlin}/` and it aggregates into the app build with zero config, and a third-party package opts in by declaring the field.
  - `pyreon-native wire [--app=<dir>] [--android-out=<file>] [--json]` emits the resolved build wiring: the Gradle srcDirs list (base runtime/router + every co-located feature `native/kotlin/`, deduped, absolute), the iOS SwiftPM package paths (resolved absolute), and the co-located Swift target sources grouped by module. A DECLARED-but-missing native dir is surfaced as a broken declaration (exit 2).

  Scaffolded Android apps now resolve their Kotlin source roots through this: `scripts/build-android.sh` runs `pyreon-native wire --android-out=android/app/pyreon-native.srcdirs` after the emit (before Gradle configures), and `build.gradle.kts` prefers that resolved list, falling back to the legacy fixed `node_modules` paths for a flat layout. Existing flat apps are unaffected; monorepo apps now build.

  iOS co-location target wiring (compiling co-located feature `native/swift/` into the runtime target) is a follow-up that pairs with relocating the first feature runtime; the base Swift packages already resolve through `wire` today.

### Patch Changes

- Role-aware rule tiers — one config now covers server, client, isomorphic and (ec0aff6)
  multiplatform code, with no glob `overrides`.

  A general-purpose linter splits backend from frontend with hand-written globs
  the user keeps in sync. A framework does not have to guess: an fs-router API
  route, a `node:` import, an `island()` call and an entry file each PROVE where
  a file runs. `resolveFileRole()` reads them, strongest signal first, and
  defaults to `shared` — the strict answer, because an isomorphic file must
  satisfy both sides and guessing either one silently disables the other's rules.

  **This was already happening, badly.** Two rules classified server files with
  `filePath.includes('server')`, and `observer` contains `server` — so
  `use-intersection-observer.ts`, a client hook, was treated as a server file by
  both. Reproduced against `lintFile`, then fixed. A third rule re-implemented
  `isTestFile` inline, omitting `/__tests__/`.

  **Eleven new rules across five new groups** (113 rules, 25 categories,
  10 groups). Every one gated by the RUNNER via `appliesTo`, never by the rule —
  `exemptPaths` was opt-in per rule and 55 of 102 silently ignored it, and a role
  gate written rule-by-rule would repeat that exactly.

  - **`isomorphic`** — `no-locale-dependent-format`, `no-timezone-dependent-date`,
    `no-unstable-render-id`, `no-node-builtin-in-component`. Hydration mismatches
    that are correct in every unit test and wrong for some users in production.
  - **`backend`** — `no-sync-fs-in-request-path`, `no-floating-promise-in-handler`.
  - **`web-perf`** — `prefer-passive-listener`, `no-unbounded-raf-loop`.
  - **`portable`** — `no-out-of-subset-construct`, `no-platform-branch-without-fallback`.
    PMTC warns about these too, but only for files a native app's entry graph
    reaches; the catalog names that gap directly ("a feature no example uses is
    one no gate ever compiles"). These fire at authoring time instead.
  - **`js`** — `require-error-cause`.

  **Precision came from measurement, not taste.** Run unscoped against this repo
  the first cut produced **over 5,000 findings**; reading them produced five
  narrowings, and the final count is **11**:

  | finding              | cause                                                            | narrowing                                                |
  | -------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
  | 4,388 subset         | web-only internals are entitled to the whole language            | fires only where `portablePaths` says a file must travel |
  | 469 floating promise | a shared util is not a request handler                           | the file must EXPORT a handler                           |
  | 149 sync fs          | Vite plugins and the compiler are server-role, not request paths | same handler gate                                        |
  | 14 raf               | a one-shot frame is ordinary                                     | must schedule ITSELF                                     |
  | 1 raf                | a double-rAF terminates                                          | self-REFERENCE, not merely nested                        |
  | 11 locale            | benches print to a console                                       | `bench/` and `e2e/` are build role                       |
  | 2 timezone           | `new Date(y, m, d).getDate()` is timezone-independent arithmetic | only Dates representing an INSTANT                       |
  | 2 error-cause        | a custom error class has no options slot                         | built-in error constructors only                         |

  **Two real bugs found and fixed by the new rules.** The scaffolded dashboard
  template formatted money and dates with no locale in 14 places — every
  generated app shipped a hydration mismatch on its own front page. Fixed with a
  `lib/format.ts` that pins locale AND timezone, which is also the pattern users
  should copy. And five `throw new Error(msg)` sites inside `catch` now pass
  `{ cause }`, so the stack points at what actually broke.

  Also closes the review finding on `no-unsanitized-inner-html`: a dead
  assignment was a half-written hop loop, and finishing it fixed a real
  false positive — a sanitized value that had been renamed once
  (`const body = clean`) was flagged.

- `validateSwiftWithStubs` is exported from `@pyreon/native-compiler`. It is the (33c8eae)
  Linux-viable TYPE gate — it strips the emit's framework imports, prepends stubs
  mirroring the real SwiftUI / PyreonRuntime surface, and type-checks — and a
  consumer that GENERATES Pyreon source needs it: `validateSwift` is parse-only,
  and `validateSwiftTypecheck` needs a real Apple SDK.

  The scaffolder now uses it. Its two specs were named "compiles to valid
  SwiftUI" / "…Compose" and asserted only that the emit contained some strings —
  a shape check wearing a compile's name. The scaffolded app is the
  highest-stakes source in the repo, so it now goes through swiftc and kotlinc,
  and is asserted to emit no warnings on either target.

- Shared `settings` in the lint config, and the four portable rules a scaffolded multiplatform app was never actually running. (72edfc6)

  `portablePaths` is a property of the project, not of one rule — it names the directories whose source has to survive three targets, and **five** rules need that same answer. Repeating it per rule made a config a hand-maintained copy of the rule registry, and the multiplatform scaffolder listed exactly one: `no-out-of-subset-construct` fired, while `no-web-only-import-in-portable`, `prefer-canonical-primitive`, `require-native-compat-marker` and `no-css-in-js-in-portable` were silently inert in every scaffolded app.

  `{ "settings": { "portablePaths": ["src/"] } }` says it once. A key is seeded into a rule's options only when that rule DECLARES it in `meta.schema`, so a shared key can never reach a rule that would reject it as unknown; per-rule options still win. A `settings` key no rule declares is reported as a config error, since a typo there would otherwise be as silent as a typo'd rule id.

  Two fixes fell out of the fixture that proves it:

  - `prefer-canonical-primitive` fired on DOM tags inside a `<Web>` branch — the exact shape its own message recommends as the fix. It now tracks `<Web>` by depth, so leaving the subtree re-arms the rule rather than one escape hatch silencing a whole file.
  - `no-out-of-subset-construct` read `portablePaths` through its own copy of the parsing logic; all five rules now share one helper, so they cannot drift on what the key means.

## 0.51.0

### Patch Changes

- `npx create-multiplatform --help` exited 1 and printed nothing to stdout. (1a7c3f0)

  `--help` fell through to `parseArgs`, which saw no project name and threw. The
  usage line went to **stderr** and the process exited **non-zero** — so any
  script or CI step checking the exit code treated a help request as a failure,
  and a plain `| grep` saw nothing.

  Every other published Pyreon bin (`pyreon-lint`, `zero`, `create-zero`) already
  exits 0 on stdout. This one was the outlier, and it is the first command a new
  user runs.

  `--help` / `-h` now short-circuit before any validation or filesystem work,
  print usage to stdout, and exit 0. A genuine missing project name still errors
  exactly as before, and both paths share one usage string so they cannot drift.

  The bin-liveness gate had special-cased this bin — "prints usage to stderr and
  exits 1 on --help … that IS the liveness signal" — which **encoded** the bug
  instead of catching it. That special case is removed, so the bin is held to the
  same bar as every other and a regression fails the gate.

- Drop the "native toolchain is not published, `npm install` will 404" notice — (3f1e70e)
  it ships in the same release that publishes the toolchain, so from this version
  on the notice would be the lie in the other direction.

  While `@pyreon/native-cli` and the Swift/Kotlin runtimes were `private: true`,
  the scaffolder deliberately warned after every scaffold and in the emitted
  README that the native targets could not be built from a standalone checkout.
  The stack is now publishable and rides the same fixed release group as this
  package, so the published `create-multiplatform` and the packages it declares
  always appear on npm together. The terminal notice is replaced by a one-line
  pointer to `npm run build:ios` / `build:android`; the README's warning block is
  replaced by the working contract (everything installs from npm; native builds
  need the local platform SDKs — Xcode + xcodegen, Android SDK + Gradle).

  The installability ratchet stays: `scaffold-deps-installable.test.ts` still
  fails if any scaffolded `@pyreon/*` dependency is `private: true` in the
  workspace, and its README assertion now checks the stale warning can never
  come back (bisect-verified — restoring the old README fails exactly that
  spec).

- A scaffolded multiplatform app cannot `npm install`. (624a51e)

  `@pyreon/create-multiplatform` is PUBLISHED — it is what `pyreon new --native`
  npx-runs — and the app it emits depends on five packages that are
  `"private": true` in this workspace and therefore absent from npm:
  `native-cli`, `native-runtime-swift`, `native-router-swift`,
  `native-runtime-kotlin`, `native-router-kotlin`.

  Verified against the registry: all five 404, while the web deps the same
  scaffold emits (`core`, `primitives`, `reactivity`, `vite-plugin`) resolve at
  0.50.0. The scaffolder's own closing line — "next: cd <dir> && npm install &&
  npm run dev" — fails at step one for anyone outside this repo.

  Nothing caught it. The scaffold-compile gate drives the WORKSPACE compiler
  directly, and the unit tests assert the emitted file list; neither asks whether
  the emitted package.json describes an installable app.

  The scaffolder and the scaffolded README now SAY so — the terminal prints a
  notice after every scaffold, and the README leads with a status block naming
  what works (web), what does not (native), why (`npm install` 404s on the
  unpublished toolchain, and the compiler is private too so nothing can be
  vendored), and the path that does work (a workspace checkout). A scaffolder
  that prints instructions it knows cannot succeed is worse than one that says
  nothing.

  This also adds the check. It does not fix the cause: publishing those packages is a
  release decision, and they are private deliberately. So the five are listed
  explicitly, the list may only SHRINK, and what is enforced today is that no
  SIXTH unpublished dependency joins them silently — plus the converse, that the
  web deps which DO resolve stay publishable.

- Document the `useNativeModule` escape hatch in the scaffolded README. (60073d2)

  A new multiplatform app had no indication that it can add a platform capability
  the framework does not ship — Bluetooth, ARKit, a vendor SDK — so the natural
  conclusion from the scaffold was that the built-in hook set is the ceiling and a
  missing capability means waiting for a framework release.

  The scaffolded README now shows the shape end to end: `defineNativeModule` for
  the web implementation, `useNativeModule` at the call site, and the two platform
  halves with the contract that is easy to get wrong (a NO-ARGUMENT initialiser on
  Swift, a SINGLE `Context` parameter on Kotlin, and the Kotlin class declared in
  the generated sources' package since the emit references it unqualified).

  Locked by a test asserting the README carries the contract, not just the name —
  bisect-verified.

- `<Video src autoPlay? loop? muted? controls? onStatusChange?>` — the canonical video-playback primitive. Web `<video>` (playsinline, media events → `onStatusChange`); iOS `PyreonVideoPlayer` (AVKit `VideoPlayer` over `AVPlayer`, KVO `timeControlStatus` → the same `waiting`/`playing`/`paused` vocabulary); Android `PyreonVideoPlayer` (Media3 ExoPlayer in an `AndroidView`, `Player.Listener`). The create-multiplatform Android template gains the media3 artifacts — and the okhttp artifact the runtime srcDir has required since the networking arc (absent from the template, masked because scaffolds install the runtime from npm, which lagged the workspace; the next release would have shipped scaffolded Android apps uncompilable). (5ca9b4c)

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

### Patch Changes

- [#2107](https://github.com/pyreon/pyreon/pull/2107) [`e6fa77c`](https://github.com/pyreon/pyreon/commit/e6fa77c514bf017cb71f6cc08bd93e0cb81fb307) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Scaffold WebView viz-bundle staging so `<WebView src="…">` resolves a local multi-file bundle from on-device app resources.

  The generated build scripts now run `pyreon-native stage-web` (gated on a `web/` project directory, so it's a no-op when absent), which copies a flat web bundle (an `index.html` + sibling `js`/`css`) into the exact location the shipped PyreonWebView runtime resolves `src` against — iOS `WebContent/` (included as an XcodeGen `type: group` so the files flatten to the app bundle's resource root for `Bundle.main.url(forResource:)`) and Android `assets/` (`file:///android_asset/`). This keeps the whole bundle on-device (the policy-safe path) and lets the html's relative asset refs resolve. Flat-only in v1; nested subdirectories are skipped with a warning.

## 0.40.0

## 0.39.0

## 0.38.0

## 0.37.1

## 0.37.0

## 0.36.0

## 0.35.0

## 0.34.0

## 0.33.0

### Patch Changes

- [#1570](https://github.com/pyreon/pyreon/pull/1570) [`445a0f1`](https://github.com/pyreon/pyreon/commit/445a0f1d9c7958056d11422b4a12402a425c8d06) Thanks [@vitbokisch](https://github.com/vitbokisch)! - create-multiplatform: scaffolded native apps now build + launch end-to-end. A local proof (Android emulator + iOS Simulator) of a scaffolded app surfaced eight scaffold bugs that compile-only validation never caught — all fixed so a fresh `create-multiplatform` app builds and runs on both targets:

  - The web entry (`entry-web.tsx`, which `mount`s against the DOM) was compiled to native code, emitting `document.getElementById(...)` into Swift/Kotlin (can't compile). The native build now skips any `.tsx` importing a web-only runtime (`@pyreon/runtime-dom` / `@pyreon/runtime-server`).
  - Android: `build-android.sh` now passes `--kotlin-package` so the emit lands in the FQN `MainActivity` imports; the root Gradle file declares the `kotlin("plugin.serialization")` version; `MainActivity` extends `ComponentActivity` (Compose `setContent` receiver) instead of plain `Activity`.
  - iOS: `project.yml` SPM-package + source + Info paths are now relative to `ios/` (where the spec lives); the `@main` entry moved to `Main.swift` (the emitted component is `generated/App.swift` — two `App.swift` files collide); the entry conforms to `SwiftUI.App` (the emitted `struct App: View` shadows the bare `App` protocol).
  - The scaffold now wires the four `@pyreon/native-*` runtime packages as SPM (iOS) / Gradle `srcDir` (Android) dependencies so the emitted `import PyreonRuntime` / `com.pyreon.runtime.*` resolve.

- [#1581](https://github.com/pyreon/pyreon/pull/1581) [`90e70a8`](https://github.com/pyreon/pyreon/commit/90e70a8d7dc4f2706e6446aeb98864a29cebb6c0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - create-multiplatform: the scaffolded Android project now ships a production **release buildType** (R8 minify + shrink, the Play Store path) plus a `proguard-rules.pro` placeholder, instead of a debug-only project. A real `./gradlew assembleRelease` with minify enabled was verified to build clean against the Pyreon Kotlin runtime — its only reflection-sensitive dependency, kotlinx-serialization (useFetch / loader payloads), ships its own R8 keep rules that R8 applies automatically, so the framework needs no manual proguard rules. (iOS already builds under `-configuration Release` whole-module-optimization via the XcodeGen-generated Release config.) So a freshly scaffolded app produces production-optimized builds on both targets out of the box.

## 0.32.0

### Patch Changes

- [#1530](https://github.com/pyreon/pyreon/pull/1530) [`6ea99ae`](https://github.com/pyreon/pyreon/commit/6ea99ae5ec9724b457459a180798abb7183b941f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Image asset pipeline (multiplatform production Phase 1): the web `<Image>` primitive now resolves BARE src names (`logo.png` — no scheme, no slash) to `/assets/<name>` so the same shared source that bundles via Assets.xcassets (iOS) / res/drawable density buckets (Android) serves the materialized copy on web. The `create-multiplatform` scaffold's build scripts run the new `pyreon-native assets` step automatically when an `assets/` directory exists.

- [#1526](https://github.com/pyreon/pyreon/pull/1526) [`099f574`](https://github.com/pyreon/pyreon/commit/099f5746a8069326e9dccf5c46c405afa2220e46) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Android scaffold manifest ships `android.permission.INTERNET` by default — without it, the first `useFetch` call fails with the opaque `SocketException: socket failed: EPERM` (a real device-CI finding). Harmless for apps that never touch the network.

- [#1535](https://github.com/pyreon/pyreon/pull/1535) [`bd4526d`](https://github.com/pyreon/pyreon/commit/bd4526d7a8ac6b2474e97af980bb0ee4629396fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Android scaffold ships `material-icons-core` — `<Icon>` now references Material glyphs at compile time (`Icons.Filled.*` via the canonical `ICON_MAP`), replacing a phantom `pyreonIcon` runtime lookup that existed only as a typecheck stub and failed every real Gradle build that used an icon.

- [#1539](https://github.com/pyreon/pyreon/pull/1539) [`543307f`](https://github.com/pyreon/pyreon/commit/543307f22920807a3eeb8cdb3be7ed8e5debde20) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The Android scaffold now wires Coil (`io.coil-kt:coil-compose`) and the native CLI emits the conditional imports for `<Scroll>` (`verticalScroll`/`rememberScrollState`), `<Modal>` (`Dialog`), and remote `<Image>` (`AsyncImage`) — these primitives were stub-masked (green in the kotlinc validate loop, red on a real `gradle assembleDebug`). Now the full primitive vocabulary compiles + renders on a real Android build.

## 0.31.0

## 0.30.0

## 0.29.0

## 0.28.1

### Patch Changes

- [#1256](https://github.com/pyreon/pyreon/pull/1256) [`08ba77f`](https://github.com/pyreon/pyreon/commit/08ba77fc6dfa65a05723a9e121bbfd002f97eb3e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `name` + target-directory validation to the scaffold CLI (D4 partial).

  `createMultiplatformProject({ name, target })` now validates that `name`
  is a non-empty, npm-compliant string (lowercase, hyphens allowed, no
  spaces / colons / scoped-package shorthand) and that `target` is a path
  that either doesn't exist OR is an empty directory. Throws a labeled
  `ValidationError` with actionable guidance instead of silently
  overwriting existing files. Closes the "scaffold clobbers existing
  projects" footgun from the 2026-06 native readiness audit.

## 0.28.0

## 0.27.1

## 0.27.0

## 0.26.3

## 0.26.2
