---
"@pyreon/permissions": patch
---

fix(permissions): predicate evaluation is fail-CLOSED — only an explicit `true` grants

`evaluate()` returned the raw predicate result, so a predicate that returned a truthy NON-boolean granted access it should deny. A predicate is typed `(context?) => boolean`, but a body reading an `any`-typed context (`(u: any) => u.permissions.edit`) returns `any` with no type error — so at runtime it could yield a truthy string/number/object, or (worst) a `Promise`, which is ALWAYS truthy, so an accidentally-async predicate ALWAYS granted. `can()` now returns `true` only when the predicate returns exactly `true` (matching the fail-closed posture the throw path already uses). A genuine `false` deny and all boolean predicates are unchanged. Bisect-verified.
