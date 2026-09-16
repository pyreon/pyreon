---
'@pyreon/zero': patch
---

The nested SSR sub-build forwards the new `@pyreon/vite-plugin` `include`/`exclude` options, so an app that opts a module in or out of the JSX transform sees the same decision on both build passes.
