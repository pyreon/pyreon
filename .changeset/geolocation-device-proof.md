---
'@pyreon/native-compiler': patch
---

Maps/geolocation reaches a BEHAVIORAL R4 on iOS — the matrix row's first non-zero score.

The row read "R2 runtimes; no device test", which understated it: a device test
alone could never have raised it. Three defects were stacked underneath, each
found only by writing the code an author would actually write.

  1. No web half at all — `import { useGeolocation } from '@pyreon/hooks'` did
     not resolve, so the hook was native-only in practice (#2567).
  2. `geo.start()` did not build on Android — Swift's is 0-arg, Kotlin's took a
     host closure. `native-counter-android` compiles the SAME `Counter.tsx`, so
     geolocation could not be added to the shared counter at all (#2569).
  3. An interpolated `Double?` rendered `Optional(37.3349)` instead of the
     value (#2566).

Only the third would have been visible from the test. The first two would have
made writing it impossible.

The assertion is behavioral, not does-not-crash: it reads the RENDERED
coordinate, which requires the whole chain to have executed on-device — tap →
real CLLocationManager watch → CoreLocation fix → @Observable update → SwiftUI
re-render. That is a stronger claim than the biometric gate's denied-path proof,
which only shows an async handler completing.

Deterministic via `simctl privacy … grant location` + `simctl location … set`,
so there is no permission dialog and no waiting on real GPS.

BISECT-VERIFIED at the device level, which matters because a green UI test is
exactly the kind of signal that passes for the wrong reason: injecting London
(51.5074) makes it FAIL after polling 25s; restoring 37.3349 makes it pass. It
genuinely reads the injected fix.

It also PINS the optional-render fix — the assertion is an exact prefix, so a
regression to `Optional(…)` fails it, and the failure message distinguishes that
case from "the watch never delivered a fix".

One gotcha worth recording: `NSLocationWhenInUseUsageDescription` had to go in
`project.yml`, not `ios/Info.plist`. xcodegen's default merge STRIPS fields it
does not know about, so a plist edit is erased on the next generate — and iOS
refuses the authorization request SILENTLY without it (no prompt, no error, a
watch that never fires).

Full device suite 19/19 (the pre-existing 18 undisturbed).
