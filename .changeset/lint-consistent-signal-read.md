---
'@pyreon/lint': minor
'@pyreon/mcp': patch
'@pyreon/create-zero': patch
'@pyreon/create-multiplatform': patch
---

Read a signal one way in JSX: `count()`.

The compiler auto-calls a bare `{count}` in JSX, but only for a `const` signal or computed it can see, TypeScript rejects the bare form in expressions and typed component props, and without the Pyreon compiler (vitest's JSX transform, compat projects) the two forms behave differently. One called form is the only rule that holds in every position.

- New rule `pyreon/consistent-signal-read` (style, on in the `readable` layer). It flags a bare known signal in JSX and fixes it to `count()` wherever the compiler emits the same code for both forms. It reports without a fix the whole value of a component prop (on iOS and Android `<Field value={draft}>` is a two-way binding) and a bare signal inside a function nested in JSX, where the compiler's auto-call depends on the element. It skips Plain Mode files, files the Pyreon compiler does not lower, names bound more than once, identity uses (`{ count }`, spreads) and `on*` / `ref` values. `form: "bare"` asks for `{count}` where the bare form type-checks and compiles the same. There are now 141 rules.
- `pyreon/no-signal-in-props` now fires only in files the Pyreon compiler does not lower (test files, compat projects, a foreign `@jsxImportSource`). In a compiled file `<Comp x={sig()} />` is a reactive prop (`_rpd(sig)`), so the rule was wrong there and pushed authors toward the bare form.
- The `create-zero` dashboard template and the `create-multiplatform` scaffold read their signals with `count()`.
