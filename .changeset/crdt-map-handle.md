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

`CrdtDoc.transact` and `CrdtDoc.destroy` are still absent on native — but they no longer
fail silently. PMTC now WARNS by name when shared source calls a `CrdtDoc`/`CrdtMap` member
that has no native counterpart, saying what will happen (the call is reproduced verbatim, so
the native build fails on a method you never wrote in that language) and what to do instead.

The classification behind that warning is TOTAL over the web contract rather than a
hand-maintained list: a test parses `CrdtDoc`/`CrdtMap` out of `@pyreon/sync`'s own
`crdt/types.ts` and fails if any member is unclassified. A list checked in one direction rots
the moment the interface grows a member, and the rot is invisible — an unclassified member
simply never warns.

Also: `PyreonCrdtDoc.applyOps`'s `origin` parameter now defaults to `REMOTE_ORIGIN`, which its
own docblock has always claimed. It was required, so the documented call shape did not compile
— and that mattered beyond tidiness, because the native runtimes take `applyOps(ops)` with one
argument, so shared multiplatform source could not write a call valid on both platforms. Every
existing caller already passes the origin explicitly, so the default is purely additive.
