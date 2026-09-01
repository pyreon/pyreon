---
'@pyreon/validate': patch
---

Every published package's `exports` map gains a `default` condition, so CommonJS
consumers can load it.

The packages stay **ESM-only** — same single ESM build, no CJS output, no dual
maintenance. The problem was never the module format: the maps offered only
`import` and `types`, so Node's CJS resolver had no condition to match and failed
with `ERR_PACKAGE_PATH_NOT_EXPORTED` *before ever trying to load anything*. Node
≥22.12 can `require()` an ES module, and none of these packages use top-level
await (the one thing that would prevent it).

`@pyreon/storybook` already shipped this shape; the other 67 were inconsistent
with it.

Verified by `require()`-ing the built package from a CommonJS context and running
a real parse. It also unblocks the node half of the independent
typescript-runtime-type-benchmarks harness, which runs under ts-node/CJS and until
now could not load `@pyreon/validate` at all.
