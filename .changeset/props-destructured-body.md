---
'@pyreon/compiler': patch
---

Add the `props-destructured-body` static detector to `detectPyreonPatterns`
— the body-scope companion to `props-destructured`. It flags
`const { x } = props` written synchronously in a component body, the
reactivity footgun the parameter-destructure detector explicitly did
NOT cover (previously a documented "lightweight AST can't do this"
cliff; the TS-compiler-API detector resolves it with scope tracking).

Precision (zero-false-positive priority): only PascalCase JSX-rendering
components; only `= props` where `props` is the bare first-parameter
identifier (unwrapped through `as` / `satisfies` / `!` / parens); the
walk does NOT descend into nested functions (a destructure inside a
handler / `effect` / returned accessor re-reads `props` per invocation
and is reactivity-correct). Surfaces through the MCP `validate` tool and
`pyreon doctor` alongside the other Pyreon detectors.
