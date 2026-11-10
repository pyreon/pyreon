---
"@pyreon/atlas": patch
---

The static-site RPC payload (`__ATLAS_STATIC_RPC__`) keeps an own `"__proto__"` key. `bakedRpcScript` embedded the payload with a bare `JSON.stringify`, and the script evaluates it as a JavaScript object literal, where a `"__proto__":` key sets the prototype instead of creating the key: a component or answer keyed `__proto__` vanished from the page and every missing-key lookup inherited its fields, while the per-component `.json` files kept it. It now uses `stringifyLoaderDataForScript` from `@pyreon/router`, which emits that key in the computed form and also escapes the whole `<` class.
