---
'@pyreon/reactivity': patch
---

Faster reactive reads, writes and effect runs. The tracking, batch, cleanup, scope and trace state now lives on fields of module-level `const` objects instead of module-level `let` bindings, which V8 accesses through a context-slot load plus a hole check per use. Measured under V8 (node 26): computed diamond -32% (now ahead of `@preact/signals-core`), 50-deep chain -26%, 1→100 effect fan-out -8%, batch-50 -10%, single-effect propagation -21%; under JSC (bun) diamond -8%, fan-out -8%, batch -6%. No change to retained bytes per signal, computed or effect.
