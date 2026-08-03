---
'@pyreon/hooks': minor
'@pyreon/cli': patch
---

`useAuth` had no web half — the fourth hook in this arc with that gap, after
`useGeolocation`, `useDatabase`, and `useWebSocket`.

PMTC lowers `useAuth<User>()` to `PyreonAuth<User>` on both native targets
(device-proven including session rehydration), so the hook was fully real on
iOS and Android and did not exist on web: no implementation, no export, no
type anywhere outside `packages/native/`. Because PMTC matches hook NAMES and
never resolves imports, the flagship finance real app's
`import { useAuth } from '@pyreon/hooks'` compiled natively while being an
unresolvable import in any web build — and the compiler's own
`lowered-hooks-typecheck` fixture writes exactly that import.

The web half mirrors `PyreonAuth` exactly, because one component body reads
the same members on three targets: `status` renders the cross-target
spellings (`'signedOut' | 'signingIn' | 'signedIn' | 'error'` — Swift's
camelCase enum rendering and Kotlin's `toString()` override), `error` is a
`string | null` (the shared-source type the compiler's
SERVICE_OPTIONAL_FIELDS declares), and the transition edge cases match
line-for-line: `beginSignIn` and `signInFailed` both KEEP the existing `user`
(a token refresh must not blank the UI; a failed refresh keeps the prior
session visible). Members are live getters over signals — a component body
runs once, and plain values would freeze at the mount state — and every
transition batches its multi-signal write so subscribers never observe a torn
intermediate state the native `@Observable` container could not produce.

Pure state machine, no platform edge, so it is SSR-safe with no environment
guard. Session persistence composes with `useSecureStorage` exactly as the
native finance gate device-proves.

Also revives a DEAD doc-claims check found while wiring the hook counts
(`@pyreon/cli` doctor gate): the "published package count" patterns expected
"across 5 categories" but the repo has had 6 since `packages/native/` — the
pattern could never match, so the claim was warned-and-skipped on every run.
The patterns now match reality and the count is verified again (23 claim
sites checked, 0 misses).
