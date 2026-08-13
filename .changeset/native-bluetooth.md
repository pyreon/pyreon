---
'@pyreon/hooks': minor
'@pyreon/native-compiler': minor
---

Add `useBluetooth` — BLE discovery on web, iOS and Android from one source

`@pyreon/hooks` had no Bluetooth surface at all. This adds one that crosses:
a web implementation over `navigator.bluetooth`, a CoreBluetooth runtime, an
Android BLE runtime, and the lowering that connects them.

**Discovery only, deliberately.** GATT — services, characteristics, notify —
is where the three platforms stop resembling each other: Web Bluetooth
requires a user gesture per device and exposes no free-running scan at all,
while CoreBluetooth and Android BLE both scan continuously and model
connection state differently. Shipping discovery as a real 1:1 surface and
leaving connection to a native escape hatch is honest; pretending the whole
stack crosses would not be.

The one interaction difference that remains is documented rather than papered
over: on web, `scan()` opens the browser's chooser and resolves with a single
device, so `scanning` is true only while it is open. The reactive SHAPE is
identical on all three; the interaction model is the platform's.

**The contract both runtimes reproduce is first-seen order, deduped by id.**
BLE peripherals advertise continuously, so a duplicate sighting is the common
case rather than an edge one — a runtime that appended unconditionally would
flood the list while still passing a one-shot test. Asserted on all three
sides, and the FIRST sighting's name is the one kept.

Errors are state, not exceptions: a denied permission or a cancelled chooser
lands in `error()` and ends the scan, matching every other permission-shaped
hook here.

The runtimes take an injected scanner, so their ordering and state logic
compiles and RUNS with no radio and no SDK — both native test programs
execute in the co-source gate. The real `CoreBluetoothScanner` /
`AndroidBluetoothScanner` are device-verified rather than stub-verified,
because an approximated stub of a radio proves nothing.

`bt.scanning()` reads correctly on every target: Swift drops the parens (the
member is a stored property) and Kotlin resolves `.value`, so the web-correct
spelling compiles everywhere — the read-inversion `model()`'s state fields had.
