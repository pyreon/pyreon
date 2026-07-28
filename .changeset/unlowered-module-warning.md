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
