# native-finance-ios — the REAL-APP device gate

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

## Why it exists

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

## Layout

| Path | What it is |
| --- | --- |
| `../native-finance/src/FinanceApp.tsx` | the SHARED app source — no platform scaffolding |
| `scripts/build.sh` | compiles that source → `generated/FinanceApp.swift` |
| `ios/` | the SwiftUI host (`@main` + a `ContentView` mounting the emitted app) |
| `iosUITests/` | the composed-flow assertions |
| `project.yml` | xcodegen spec (no `.xcodeproj` committed) |

## Running it

```bash
bash scripts/build.sh          # .tsx → generated/FinanceApp.swift
xcodegen generate              # project.yml → PyreonFinance.xcodeproj
xcodebuild test -scheme PyreonFinance \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

The `native-device` workflow runs exactly this.

## Scope

**iOS only for now.** The shared source is platform-agnostic and emits clean
Kotlin, but there is no Android host yet, so the composed flow is proven on one
platform. Adding `native-finance-android` (mirroring
`native-counter-android`, which points at its sibling's `src/`) is the
follow-up that would make the "one source → both platforms" claim complete
for a real app.

`useDatabase`'s backend is in-memory, so `db.delete` on the remove path is
exercised but not *asserted* — the ledger renders from the store, which is
the correct architecture (the database is a persistence side-channel, not a
reactive source).
