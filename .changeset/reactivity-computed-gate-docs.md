---
'@pyreon/reactivity': patch
---

The manifest (and so `llms.txt`, the MCP API reference and the docs reference page) now says what `computed()` does: it gates on `Object.is` by default, like a signal write, so an identical result does not re-run downstream effects. `equals` is for results that are a fresh array/object each time, and it also makes the computed eager. It used to say a computed had no default equality check.
