---
'@pyreon/compiler': patch
---

The `for-missing-by` finding now suggests your own `<For>` tag with `by` added, instead of a generic `<For each={items} by={(item) => item.id}>`. For `<For each={visible()}>` the fix reads `<For each={visible()} by={(item) => item.id}>`, so `pyreon check`, MCP `validate` and editors show a fix that keeps what you wrote. The `<For>` diagnosis that `diagnose` / `explain_error` return reads the list as `items()`.
