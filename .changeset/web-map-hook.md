---
'@pyreon/hooks': minor
'@pyreon/native-compiler': patch
---

`useMap` had no web half, `map.moveTo(…)` did not compile on iOS, and the compiler advertised a field the runtime does not have.

Three defects, found by writing the component an author would write and checking
BOTH targets.

**1. No web half (`@pyreon/hooks`).** PMTC lowers `useMap()` to
`PyreonMapState` on both native targets. The web half did not exist, so
`import { useMap } from '@pyreon/hooks'` compiled for two targets and was
unresolvable on the third — the fourth hook in this arc with that gap, after
`useGeolocation`, `useDatabase` and `useWebSocket`. The compiler's own
`lowered-hooks-typecheck` fixture already writes that import.

The web half is STATE, not a renderer, exactly as `PyreonMapState` is: camera,
markers, selection, nothing else. So it needs no mapping library and imposes no
choice of one — feed `map.camera` / `map.markers` to Leaflet, MapLibre, Google
Maps or an `<svg>`. Semantics are copied from the native container including the
parts easy to get subtly wrong, each locked by a test: `addMarker` upserts by id
and PRESERVES list position; `removeMarker` clears a selection pointing at it;
`moveTo` keeps the current zoom when omitted (via `??`, since `||` would drop a
legitimate zoom of 0); `selectedMarker` is DERIVED, never stored.

**2. `map.moveTo(…)` and `map.removeMarker(…)` did not compile on Swift**
(`@pyreon/native-compiler`). Swift labels arguments, the shared TS surface is
positional, and the generic emit is positional — so the primary map API failed
with `missing argument labels 'latitude:longitude:' in call`. Kotlin accepted
the identical source, since named arguments are optional there.

This is the SAME defect #2514 fixed for `PyreonDatabase`, which was fixed in a
database-shaped way and so left every other service exposed. Rather than add a
second special case, the table is now per-service-kind with full-positional
labels — the database table's "labels after a leading unlabelled argument" shape
cannot express `moveTo`, whose FIRST argument is labelled.

Scope was ENUMERATED, not guessed: every `public func` in runtime-swift with a
labelled parameter was listed, then each probed for reachability from the hook
surface. `PyreonGeolocation.update` and the `PyreonWebSocket` internals are not
on it, `selectMarker(_ id:)` is unlabelled natively, and `PyreonSecureStorage`
is not lowered at all — so map was the only remaining reachable gap.

**3. The compiler typed a `map.error` that exists on neither runtime.**
`{map.error}` failed swiftc with `value of type 'PyreonMapState' has no member
'error'`. That entry was added in #2566 by generalising "every service container
has an optional `error`" across the services without checking each runtime —
my own over-generalisation, the same mistake documented for `@pyreon/rx`.
`PyreonMapState` holds camera/markers/selection, performs no I/O and cannot
fail. The entry is removed rather than the field added: an always-nil `error` on
a container that cannot fail is dead surface, and if map gains I/O the field
should arrive with the failure it reports. The web half has no `error` either,
for the same reason.

Bisect-verified: reverting the label path fails the three map specs while all
four guards — unlabelled `selectMarker`, the over-long-call fallthrough, the
unchanged database output, and Kotlin — stay green, proving they do not pass
merely because of the fix. Verified end to end: the natural component compiles
clean on both targets with zero warnings.

The hooks manifest enumeration was also stale — bumped to 48 for
`useGeolocation` without naming it — so both data hooks are now named.
