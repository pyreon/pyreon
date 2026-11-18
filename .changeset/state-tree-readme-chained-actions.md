---
'@pyreon/state-tree': patch
---

The README now shows the API the types accept: `model({ state }).views((self) => …).actions((self) => …)`. Its examples used `model({ state, views, actions })`, which TypeScript rejects with TS2769. The Quick Start and `model()` examples are now typechecked by the doc-examples gate, so they cannot drift again.
