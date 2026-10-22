---
"@pyreon/native-compiler": patch
"@pyreon/flow": patch
"@pyreon/mcp": patch
---

Three cases where native output failed to compile with no warning are fixed. All were found by compiling every package's documented `api[].example` through the real compiler and type-checking the result.

- **A local with the same name as a prop** (for example `const edge = () => …` in a component whose props type has an `edge` field) is legal JavaScript but declares the same name twice on Swift (`invalid redeclaration of 'edge()'`). It now warns, naming the local, the prop and the fix.
- **A helper wrapping a flow path builder** (`const curve = () => getBezierPath({…})`) was emitted on Swift as a function with no return type, so `curve().path` failed with `value of tuple type '()' has no member 'path'`. The helper is now typed. Plugin function lowerings can declare a `returns` type for this, and the five flow path builders do.
- **A call to a Pyreon package function that nothing lowers** (`getSnapshot(model)`, `compose(…)`, `kinetic(…)` in a shape the lowering declined) was re-emitted verbatim, and the native build failed with `cannot find 'getSnapshot' in scope`. It now warns, naming the function and its package. The check reads the final emitted text, needs the source to call the name (a preset passed as a value does not count), and skips tags, hooks, web-only packages and anything an earlier warning already names. It also surfaces two documented fixtures (`feature-05`, `kinetic-03`) whose declined shapes had been silent.

The documented `BaseEdge` example used the colliding name; it now uses `curve`, which also updates the generated reference and the MCP API reference.
