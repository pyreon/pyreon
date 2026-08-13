---
'@pyreon/native-compiler': patch
---

Close the stub-narrower-than-runtime class with a derived gate

A stub NARROWER than the runtime it mirrors rejects **correct** code. That is
worse than a missed bug: it reports a failure that does not exist and sends
an author to "fix" working code.

It was found four separate times in one session — `PyreonShare` (stub had
`url`; the runtime has four members), `PyreonHaptics` (one of three),
`PyreonNotifications` (missing `requestPermission`), and the un-keyed `task`
overload — each caught only because someone happened to compile a snippet
that used the missing member. The documented trap is the SUPERSET stub, which
masks breakage; this is the mirror image, and the two need opposite checks.

The gate is **derived**, not a list: it reads every co-located and monolith
runtime, and for every type the stubs already declare, asserts the stub
carries each public member the runtime does. A member added to a runtime is
covered the day it lands, with no test edit — the hand-written alternative is
the shape this repo calls a silent-hole generator.

Deliberately out of scope: types the stubs do not declare at all (a runtime
with no stub may simply be unreachable from any emit, and requiring one would
teach people to add empty stubs), and signatures (comparing parameter lists
across two languages needs a real parser each; NAMES catch the whole observed
class).

The 53 existing gaps are recorded in a ratchet that may only shrink, rather
than fixed in one pass — a stub with a WRONG signature masks breakage, which
is the worse direction, so hand-writing 53 signatures blind would have traded
a small problem for a larger one. Roughly half are platform delegate
callbacks the emit never calls; the rest (`perms.grant(...)`,
`machine.can(...)`, `i18n.locale`) are real refusals an author can hit today,
and are now visible instead of latent.

Bisect-verified: removing `canShare` from the Swift stub fails the gate
naming exactly `PyreonShare.canShare`; restoring it passes.
