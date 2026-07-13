---
"@pyreon/compiler": patch
---

Fix a compiler bug where a props-derived object **shorthand** in a style /
object literal (`const color = pick(props.v); <span style={{ color }} />`)
miscompiled. The native (Rust) backend inlined the prop-derived local into the
shorthand value without expanding the `key:` prefix, emitting a keyless
`{ (pick(props.v)) }` — a build-time syntax error (`Unexpected token '('.
Expected a property name.`). The JS backend didn't crash but left the shorthand
captured-once (non-reactive), diverging from the native backend.

Both backends now **expand** a prop-derived shorthand to
`{ color: (pick(props.v)) }` — byte-identical to the explicit `{ color: color }`
form and reactive (the inlined value reads props inside the reactive accessor).
Static (non-props) shorthand `{ color }` is untouched. Locked by the
native-equivalence oracle + JS-output assertions; bisect-verified.
