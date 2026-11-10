---
'@pyreon/reactivity': patch
'@pyreon/runtime-dom': patch
---

Bindings that can never update no longer keep anything alive. A `renderEffect` or `_bind` whose first run tracked no signal returns a shared no-op disposer and registers nothing with its scope, and `_bindProp` writes a static primitive prop once instead of building a tracked text binding. On a statically composed page (every `FormRow label="…"`) that removes the effect closures, dependency arrays and scope entries of every static binding.
