---
'@pyreon/hooks': minor
---

`useGeolocation` had no web half — the import did not resolve at all.

PMTC has lowered `useGeolocation()` to `PyreonGeolocation` on both native
targets since Phase 5, and the compiler's lowered-hook allowlist lists it. But
there was no web implementation, no export, and no type anywhere in
`packages/`, so `import { useGeolocation } from '@pyreon/hooks'` did not
resolve and an app using it could not build for web.

That made it native-only in practice while sitting alongside hooks that are
genuinely shared — `useHaptics`, `useShare`, `useClipboard` and `useAppState`
all ship web implementations. `useMap`, `usePush` and `usePayments` remain in
that state; this closes the one with a straightforward browser equivalent
(`navigator.geolocation.watchPosition`).

The returned SHAPE is the contract, and it is not arbitrary: PMTC reads
`geo.latitude` / `geo.start()` as MEMBERS on the native container, so the web
object exposes exactly those names as getters over signals. Returning bare
signals would force `geo.latitude()` on web and diverge from the native member
read — the exact mismatch that made `@pyreon/form` non-shared. Verified by
emitting this source through the native compiler and confirming the Swift and
Kotlin output reads the right fields.

HONEST SCOPE — the reactive reads (`latitude`/`longitude`/`accuracy`/`error`/
`isTracking`) are shared on all three targets, but **`start()` is web + iOS
only**. Kotlin's `PyreonGeolocation.start` takes a host closure because it has
no default location transport, while Swift's is 0-arg — the same
OkHttp-for-WebSocket asymmetry already tracked for `usePush`/`usePayments`. The
API documents that on the member itself rather than burying it in a note.

A position fix is delivered as ONE batched update: four bare `.set()` calls
would fire up to four reactive passes per fix, and a consumer reading lat+lng
could observe a TORN pair — a new latitude against the previous longitude, a
coordinate that was never real. The `no-unbatched-updates` ratchet caught this.

The watch is stopped on unmount; a leaked watch keeps GPS active and holds its
callback closure alive, which the user cannot see.
