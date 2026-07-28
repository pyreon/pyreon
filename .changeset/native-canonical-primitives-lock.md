---
'@pyreon/native-compiler': patch
---

Lock the headline multiplatform claim: all 15 canonical primitives type-check
on both targets.

"All 15 canonical primitives map to both targets" is what the four-layer
shared-code model rests on. It was locked at the emit-STRING level
(`canonical-primitives.test.ts` asserts the SwiftUI/Compose names) and by
fixtures exercising some of them — but nothing compiled all fifteen and asked
whether the result type-checks on both platforms.

That distinction has mattered repeatedly here: `useDatabase` emitted Swift
without argument labels for months, `db.insert` lowered a record to a tuple,
and four of the eight documented control-flow components reproduce their tag
verbatim. Each looked fine as a string.

Audited: all 15 pass, both targets, zero warnings, with realistic prop usage
(a bare tag can lower while its documented props are dropped). So this is a
regression guard for a working contract rather than a ratchet over debt — and
the count itself is asserted, so the list cannot shrink into passing by testing
less.
