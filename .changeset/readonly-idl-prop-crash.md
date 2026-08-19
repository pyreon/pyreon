---
'@pyreon/runtime-dom': patch
---

Fix a crash when a prop names a READ-ONLY IDL accessor, and arm the hydration parity fuzzer against value-bearing form controls.

`setStaticProp` routed a prop to a property assignment when `key in el` — which answers "does this property EXIST?", while the assignment needs the stronger "is it WRITABLE?". `in` is true for a getter-only IDL accessor, and framework code is ESM (hence strict mode), so the assignment THREW instead of silently no-opping and took the whole mount down:

```
TypeError: Cannot set property list of #<HTMLInputElement> which has only a getter
```

`list` is an advertised JSX prop (`list?: string`), so `<input list="dl">` — ordinary documented API — crashed. The same shape was reachable via `form`, `select.options`, `table.rows`, `video.buffered`, `input.labels`, `input.validity`, and via any DOM-element spread (`_applyProps` funnels into the same helper). The compiled template path was unaffected (it routes generic attrs through `_setAttr`), so vite-plugin apps were safe while `@pyreon/testing`, the auto-JSX-runtime browser suites and the compat layers were not.

The assignment now falls back to `setAttribute`, which is the CORRECT destination rather than mere crash-avoidance: `list` and `form` ARE content attributes whose IDL properties are read-only precisely because they return the resolved element. React and Preact both set the attribute here.

The guard is a `try`/`catch` rather than a descriptor/writability probe, chosen on measurement: over 200k Chromium assignments try/catch costs 0.96-1.01x of a bare assign (V8 zero-cost-on-success exceptions), a prototype-chain `getOwnPropertyDescriptor` walk costs 1.70-3.23x, and a WeakMap-cached walk still costs 1.18-1.36x while adding a module-level cache. A hardcoded name list was rejected because it silently rots as the DOM grows another read-only accessor. Trade-off documented at the call site: a genuine setter exception is also swallowed into an attribute write, which is strictly better than downing the mount.

Also arms `hydration-parity-fuzz.test.tsx`, which never generated value-bearing form controls — the reason this whole property/attribute class was invisible to it. The grammar now emits `input` (`value`, `checked`), `textarea` and `select`, reaching 41.2% of 5000 seeds, with an exported `KNOWN_ATTR_PARITY_DIVERGENCES` set naming only `input.value` / `textarea.value` / `select.value` (non-reflecting properties, where SSR can serialize only an attribute and the client sets only the property — a separate open design question). Deleting an entry re-arms that exact shape; `checked` and `selected` stay armed.
