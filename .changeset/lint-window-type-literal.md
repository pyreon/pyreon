---
'@pyreon/lint': patch
---

`pyreon/no-window-in-ssr` no longer reports a browser-global NAME used inside a type that sits in an `as` / `satisfies` expression: a type-literal member (`p as { window?: number }`), a function type's parameter (`g as (window: number) => void`) or a `typeof` query (`g as typeof window`). Those types reach the visitor without a type-annotation wrapper, so the rule read them as value references. A `window` in the value half of the expression (`(window as unknown as X).x`) still reports.
