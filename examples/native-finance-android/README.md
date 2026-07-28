# native-finance-android — the REAL-APP device gate, Android half

The Android host for the shared [`examples/native-finance`](../native-finance)
source — the **same** `FinanceApp.tsx` that
[`native-finance-ios`](../native-finance-ios) compiles. Nothing in the app source
is platform-specific; this directory is only the Gradle/Compose scaffolding.

One `connectedCheck` drives the composed flow on a real emulator:

```
useForm validation  →  the useAuth<User> state transition
→  a store-backed route guard  →  a computed balance over store state
```

## Why the Android half matters on its own

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

## Running it

```bash
bash scripts/build.sh        # FinanceApp.tsx → generated/FinanceApp.kt
gradle assembleDebug         # proves the emit compiles
gradle connectedCheck        # runs the composed-flow assertions on an emulator
```

The `native-device` workflow runs exactly this.

## Layout

| Path | What it is |
| --- | --- |
| `../native-finance/src/FinanceApp.tsx` | the SHARED app source (no platform scaffolding) |
| `scripts/build.sh` | compiles that source → `generated/FinanceApp.kt` |
| `app/src/main/kotlin/com/pyreon/MainActivity.kt` | the Compose host |
| `app/src/androidTest/…/FinanceInstrumentedTest.kt` | the composed-flow assertions |

`useDatabase`'s backend is in-memory, so `db.delete` on the remove path is
exercised but not asserted — the ledger renders from the store, which is the
correct architecture (the database is a persistence side-channel).
