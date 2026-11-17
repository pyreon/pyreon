# native-finance: Finance

> **Experimental.** The native targets (PMTC → SwiftUI and Jetpack Compose) are demo-quality. See `docs/src/content/docs/multiplatform.md`.

One source, [`src/FinanceApp.tsx`](src/FinanceApp.tsx): the real-app device gate: auth, a validated form, a cross-screen store, routing. This directory holds the source and every host, the layout `bun create multiplatform` scaffolds:

| Path | What it is |
| --- | --- |
| `src/` | the shared app source |
| `ios/` | the iOS host: `project.yml` (xcodegen), `Sources/`, `UITests/`; PMTC writes `ios/generated/` (gitignored) |
| `android/` | the Android host: the Gradle project; PMTC writes `android/app/src/main/kotlin/com/pyreon/generated/` |
| `scripts/build-ios.sh`, `scripts/build-android.sh` | compile the source for each host; the Xcode pre-build script and the Gradle `preBuild` task run them |

Both native hosts are built and device-tested in CI (`native-device.yml`, lane key `finance`).

```bash
cd examples/native-finance
bun run check            # PMTC for both targets, in memory
bun run build:ios        # src → ios/generated/*.swift
bun run build:android    # src → android/app/src/main/kotlin/com/pyreon/generated/*.kt
```

## iOS host (`ios/`)

The iOS host for the shared [`examples/native-finance`](../native-finance)
source. Every other native example in this repo is a **demo**: the counter is
one screen of individually-asserted hooks, todomvc is one list, router-demo is
navigation, tasks is fetch + form. Each proves a hook in isolation.

This one proves **composition** — the thing a demo structurally cannot. One
`xcodebuild test` run drives:

```
useForm validation  →  the useAuth<User> state transition
→  a store-backed route guard  →  a computed balance over store state
→  a keyed <For> mutation with a useDatabase side-channel
```

### Why it exists

Two things it caught that four demo apps could not:

1. **`useAuth` had never been device-asserted.** The per-hook audit listed it
   R1–R2: the tasks app's "login" is `useForm` + a router guard, not this hook.
   The finance login screen renders the container's live `status` and drives
   `beginSignIn()` for real.

2. **A locale-formatting bug in the Swift emit.** `Text("\(balance)")` selects
   SwiftUI's `LocalizedStringKey` overload, which formats numbers through the
   current locale — so a `2700` balance rendered **"2 700"**, disagreeing with
   the web and Android builds of the same source and varying by device region.
   Grouping separators only appear at four figures, so `Count: 0` never
   surfaced it. Fixed by emitting `Text(verbatim:)` whenever the content
   interpolates.

That second one is the argument for this gate in one sentence: *the bug class
was invisible until an app displayed a number ≥ 1000.*

### Layout

| Path | What it is |
| --- | --- |
| `examples/native-finance/src/FinanceApp.tsx` | the SHARED app source — no platform scaffolding |
| `scripts/build-ios.sh` | compiles that source → `generated/FinanceApp.swift` |
| `ios/` | the SwiftUI host (`@main` + a `ContentView` mounting the emitted app) |
| `iosUITests/` | the composed-flow assertions |
| `project.yml` | xcodegen spec (no `.xcodeproj` committed) |

### Running it

```bash
bash scripts/build.sh          # .tsx → generated/FinanceApp.swift
xcodegen generate              # project.yml → PyreonFinance.xcodeproj
xcodebuild test -scheme PyreonFinance \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

The `native-device` workflow runs exactly this.

### Scope

**Both platforms now.** [`native-finance/android`](../native-finance/android)
landed as the Android host for the same shared `FinanceApp.tsx` source (same
pattern `native-counter/android` uses — points at its sibling's `src/`), so
the composed flow is proven on both platforms.

`useDatabase`'s backend is in-memory, so `db.delete` on the remove path is
exercised but not *asserted* — the ledger renders from the store, which is
the correct architecture (the database is a persistence side-channel, not a
reactive source).

## Android host (`android/`)

The Android host for the shared [`examples/native-finance`](../native-finance)
source — the **same** `FinanceApp.tsx` that
[`native-finance/ios`](../native-finance/ios) compiles. Nothing in the app source
is platform-specific; this directory is only the Gradle/Compose scaffolding.

One `connectedCheck` drives the composed flow on a real emulator:

```
useForm validation  →  the useAuth<User> state transition
→  a store-backed route guard  →  a computed balance over store state
```

### Why the Android half matters on its own

It is the **load-bearing** side for two things iOS cannot prove:

1. **Compose constructor args.** A reactive text colour is a `Text(color = …)`
   constructor arg on Compose, where SwiftUI uses a `.foregroundColor` modifier.
   Only a real `assembleDebug` proves that arg is type-correct — and the colour
   used to be dropped entirely on Android while iOS rendered it.

2. **Enum rendering.** `<Text>{auth.status}</Text>` rendered `signedOut` on iOS
   and `SIGNED_OUT` on Android, because Kotlin enum constants are
   SCREAMING_SNAKE and Swift's are camelCase. Same source, different UI text.
   Fixed by overriding `toString()` on `PyreonAuthStatus`; this app is what
   surfaced it.

Both were invisible to compile-only validation and to every demo app.

### Running it

```bash
bash scripts/build.sh        # FinanceApp.tsx → generated/FinanceApp.kt
gradle assembleDebug         # proves the emit compiles
gradle connectedCheck        # runs the composed-flow assertions on an emulator
```

The `native-device` workflow runs exactly this.

### Layout

| Path | What it is |
| --- | --- |
| `examples/native-finance/src/FinanceApp.tsx` | the SHARED app source (no platform scaffolding) |
| `scripts/build-ios.sh` | compiles that source → `generated/FinanceApp.kt` |
| `app/src/main/kotlin/com/pyreon/MainActivity.kt` | the Compose host |
| `app/src/androidTest/…/FinanceInstrumentedTest.kt` | the composed-flow assertions |

`useDatabase`'s backend is in-memory, so `db.delete` on the remove path is
exercised but not asserted — the ledger renders from the store, which is the
correct architecture (the database is a persistence side-channel).
