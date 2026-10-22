---
'@pyreon/native-compiler': patch
---

Native: an object spread whose source is not a bare identifier now lowers. The commonest immutable update, `u.set({ ...u(), age: n })`, emitted `(age: n)` — a tuple holding only the override, with every inherited field silently dropped — on both targets, with no warning; so did `{ ...props.user, name }` and `{ ...defaults(), x }`. The shared spread planner bailed for every non-identifier source, which fell into the plain-literal path. Both lowerings evaluate their source exactly once, so the restriction protected nothing: the source may now be any expression whose type is known (Swift `{ var c = u; c.age = n; return c }()`, Kotlin `u.copy(age = n)`), and the result keeps the source's type, so a `computed` returning a spread is typed instead of `Any`. A source whose type cannot be inferred is emitted with its overrides and named by a warning.
