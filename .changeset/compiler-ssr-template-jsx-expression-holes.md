---
'@pyreon/compiler': patch
---

`ssrTemplate`: an expression child that contains JSX the compiler cannot lower to a string (a `.map` whose item holds a component, a component ternary arm) is now kept in place and re-walked, so its own elements compile to `_ssr` templates instead of `jsx()`/`h()` per element. Any template call whose holes still build JSX is wrapped in `_ssrDeferred`, which fixes components in such holes rendering before an enclosing provider when the template is built outside a component's return (module-level constants), where they read context defaults.
