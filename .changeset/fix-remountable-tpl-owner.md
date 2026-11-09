---
"@pyreon/runtime-dom": patch
---

A compiled template that is a component's child no longer builds when it is created. It was built while the parent's JSX arguments were being evaluated — before the enclosing component's setup — so every component the template held (a `<RouterView />`, a routed page) was set up under the wrong owner and never saw the context the enclosing provider provides (a layout wrapping its shell in `<QueryClientProvider>` made the routed page throw "No QueryClient found"). It now builds on first use, which is the mount.
