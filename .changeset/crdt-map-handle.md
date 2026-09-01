---
'@pyreon/sync': minor
'@pyreon/native-compiler': minor
---

CRDT: a map handle on both native runtimes, so the ordinary `doc.getMap(name)` shape lowers

The web `CrdtDoc` hands you a `CrdtMap` you hold and call — `doc.getMap('room').set('title', v)`.
Both native runtimes only had the flat form, where the map name is a first argument
(`doc.set('room', 'title', v)`), and PMTC lowers these calls verbatim: shared source written
against the documented web API emitted a call to a `getMap` that did not exist, with **no
warning**, so the failure surfaced as a swiftc/kotlinc error inside a generated file rather
than as a diagnostic naming the call.

`PyreonCrdtMap` now exists on both runtimes with the full web surface — `get`, `set`, `has`,
`keys`, `observe` — plus `set` overloads for the scalar types, because `PyreonScalar` is a
sealed/enum type and requiring the wrapper at every call site would put platform constructors
into files that must also compile as TypeScript.

The validation stubs were a **subset** of the runtime they claim to mirror, which is the
inverse defect and just as costly: a narrower stub rejects correct emit. The Swift stub was
missing `has`/`keys`/`applyOps`/`encodeState`/`encodeMessage`/`applyMessage`/`onLocalOps`, and
the Kotlin stub was additionally missing `PyreonScalar.Null` — while its own comment already
claimed to mirror the surface. Both now do.

Still absent on native, and unchanged by this: `CrdtDoc.transact` and `CrdtDoc.destroy`.
`transact` is not cosmetic — the web contract requires writes to happen inside it — so
idiomatic shared source using it still will not compile on native.
