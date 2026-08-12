---
'@pyreon/permissions': patch
'@pyreon/native-compiler': patch
---

Native `.*` granted more than the web did

`PyreonPermissions.can()` resolved a `"prefix.*"` grant with a bare prefix
match on both platforms, so granting `"posts.*"` also granted
`"posts.comments.edit"` — a key the web **denies**. A permission check that
grants more on device than in the browser, from the same source, is the wrong
direction to be wrong in. Neither runtime recognised `.**` or `*` at all, so
the two wildcards that *should* widen a grant were silently ignored.

The two native runtimes agreed with each other and disagreed with the web:
both were written from one belief about what `.*` means. `can()` now resolves
in the web's order — exact, then one-segment `.*`, then recursive `.**`
most-specific-ancestor-first, then global `*`.

Measured three ways rather than mirrored: the web resolver via
`native-parity.test.ts`, and both runtimes compiled and **run** against the
same nine cases.

## The call site was inverted too

Web `usePermissions()` takes no arguments — the grants come from
`<PermissionsProvider>`, which has no native lowering. So the correct web call
emitted an empty native set in which every check denies, silently: guarded
views simply never appeared on device. The only way to get a non-empty native
set is `usePermissions([...])`, a call the web API rejects.

Seeding the provider natively is a larger arc. What changes here is the
silence — the empty-set case now says so and names the shape that works, and
the provider's own advice no longer tells an author already holding the hook
to "use the hook instead", which changed nothing.

Still web-only: predicate permissions (`(context) => boolean`) and explicit
`false` values, both of which need a value-carrying granted set rather than
the current `Set<String>`. The web arm pins them so the gap is visible.
