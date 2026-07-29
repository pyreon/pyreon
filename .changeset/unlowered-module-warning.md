---
'@pyreon/native-compiler': patch
---

Non-hook exports from web-only modules failed both targets with no warning.

The hook arc keys on `/^use[A-Z]/`, so plain exports fell straight through:

    s                  from @pyreon/validate     ✗ both targets, 0 warnings
    pipe / map         from @pyreon/rx           ✗ both targets, 0 warnings
    createPermissions  from @pyreon/permissions  ✗ both targets, 0 warnings

while `useQuery` — the same kind of import, right next to them — warned
properly. Same silent-build-failure class the hook arc exists to eliminate,
just outside its name filter.

Scoped to NON-HOOK imports, which avoids double-warning AND handles partial
support: `usePermissions` genuinely lowers (verified) while
`createPermissions` does not.

Per-EXPORT, not per-package, and that distinction was earned the hard way. The
first version warned on any import from `@pyreon/rx` — but the NAMESPACE form
(`import { rx } from '@pyreon/rx'`, then `rx.filter` / `rx.map`) genuinely
lowers, and the blanket warning broke that existing lock. I had probed `pipe`
and `map`, seen both fail, and generalised to the package: two probes are not a
package. The existing rx-lowering suite caught it.

Every entry was MEASURED. `@pyreon/url-state` and `@pyreon/toast` look like
candidates but already warn through other paths, and `@pyreon/state-tree`'s
`model()` lowers cleanly — none is listed, and the tests assert that, because
over-warning turns a diagnostic into noise people learn to ignore.

Bisect-verified: 11 specs fail without the change. Full compiler suite 246 files
/ 2520 tests, including the rx-lowering lock and the control-flow warning.

A later sweep took the same probe to `@pyreon/core` and `@pyreon/reactivity` —
the two most-used packages in the framework. Both are MOSTLY lowered, which is
exactly why the gaps in them were invisible:

    reactivity   batch / untrack / effectScope              ✗ both targets
                 signal / computed / effect / onCleanup     ✅ lower
    core         lazy / cx / createUniqueId / splitProps    ✗ both targets
                 onMount / h / Show / For / Suspense        ✅ lower

These two use an explicit `unsupported` DENY list rather than the `supported`
allow list every other entry uses. That direction is forced: listing what IS
supported here means enumerating almost the entire public surface of both
packages, and anything missed false-warns on code in essentially every
multiplatform component ever written — the `@pyreon/rx` over-generalisation
above, at the worst possible scale. The guard tests (Show / For / Suspense /
signal / computed / onMount must stay SILENT) matter more than the warning
tests, and are written first for that reason.

`splitProps` initially measured as "lowers" and does not: the probe imported it
without using it, so nothing reached the emitter. That was the fourth probe of
this shape to produce a false clean in this arc. Re-probed with the symbol
genuinely used, it fails with `cannot find 'own' in scope`. Every row in the
table above was re-measured the same way.

`batch` is arguably STRIPPABLE rather than unsupported — SwiftUI `@State` and
Compose `mutableStateOf` already coalesce writes within one action, so the
wrapper is a no-op on native. It warns rather than lowers here because that is
an emit change with an open return-value question (`batch(() => x)` yields `x`
on web), and shipping a warning today beats shipping a wrong lowering.
