---
'@pyreon/compiler': patch
'@pyreon/runtime-dom': patch
---

A function held in a NAMED binding is now an accessor in compiled JSX, as it already was on the `h()` path (#4086). `<p>{label}</p>` with `const label = () => …` (or a `function` declaration, a helper param, a function-valued prop) rendered the closure's SOURCE text; it now mounts reactively and follows its signals. A DOM-property binding (`checked`, `disabled`, `selected`, `multiple`, `readOnly`, `indeterminate`, `value`) with a non-literal value assigned the function object itself — `checked={isOn}` left the box permanently checked — and now resolves it: through the new `_setProp` sink inside a reactive binding, and through `_setPropStatic` (which binds a function live) in static position. Literal values keep the plain property assignment. `<input value>` additionally resolves a function in `_setValue`.
