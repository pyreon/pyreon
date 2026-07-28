---
'@pyreon/native-runtime-kotlin': minor
'@pyreon/native-compiler': patch
---

`geo.start()` compiled on iOS and web and failed to build on Android.

Swift's `PyreonGeolocation.start()` is 0-arg. Kotlin's only overload took a host
closure — `start(register: (GeolocationHandlers) -> (() -> Unit))` — because
taking a real location source would drag the Android SDK into a file that must
stay stub-verifiable. So the SAME source built for two targets and not the
third, silently, with no warning: the documented "OkHttp-for-WebSocket
asymmetry".

That was not academic. `native-counter-android` compiles the SAME `Counter.tsx`
as `native-counter-ios`, so geolocation could not be added to the shared counter
example at all — which is why the maps/geolocation matrix row could not be
raised by a device test even with the runtimes present and the harness working.

Closed with the seam this runtime already uses twice: a registry plus an
`installDefault…` guard that only fills an EMPTY slot, mirroring
`PyreonStorageRegistry` / `installDefaultStorageBackend`. An app that chose its
own source in `Application.onCreate` is never overwritten.

The Android-SDK half lives in its own file (`PyreonGeolocationAndroid.kt`).
That is a gate decision, not a style one: `run-kotlin-tests.ts` EXECUTES only
modules importing no `android.*` / `androidx.*` / `kotlinx.*`, so folding it
into the core would silently drop the whole class out of the executing test set
— the same split already used by `PyreonDatabaseAndroid` and
`PyreonStorageAndroid`.

With no source installed, the 0-arg `start()` fails LOUDLY through the same
error channel a denial takes. A silent no-op would leave `latitude` null forever
— indistinguishable from "no fix yet", the harder bug to diagnose — so the error
names the wiring call instead.

Uses the platform `LocationManager` rather than Play Services'
`FusedLocationProviderClient`: fused lives in a separate Google dependency this
runtime does not take, and taking it would force it on every consumer. An app
wanting fused assigns `PyreonGeolocationRegistry.source` with its own
implementation — which is what the seam is for. `applicationContext` is used
internally so a rotated-away Activity is never retained by a running watch, and
`hasAccuracy()` guards the platform's 0.0 sentinel rather than reporting it as a
real 0-metre fix.

The kotlinc stub now mirrors BOTH overloads. Mirroring only the 0-arg one would
be a SUBSET stub, which manufactures failures for the closure form exactly as an
over-strict `PyreonPermissions` stub rejected correct code.

Bisect-verified: reverting the stub reproduces `unresolved reference 'start'` —
the literal Android build failure. Full compiler suite 245 files / 2501 tests;
Kotlin runtime smoke tests 8/8; duplicate-declaration gate clean across 87
top-level declarations.
