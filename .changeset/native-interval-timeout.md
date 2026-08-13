---
'@pyreon/native-compiler': minor
'@pyreon/native-cli': patch
---

Lower `useInterval` and `useTimeout` — a ticking clock did nothing on device

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
