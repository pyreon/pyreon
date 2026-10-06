---
"@pyreon/compiler": patch
---

A prop-derived `const` (`const h = foo(props.n)`) now stays live at every use site on the native compiler, matching the JS backend. The member-call and callee fast paths no longer freeze the setup-time value, the expression gate covers `new`, tagged templates, TS wrappers, `await`, update expressions and JSX nested in an expression, and an expression mixing a bare signal with a prop-derived const no longer emits unparseable code (JS) or panics (native).
