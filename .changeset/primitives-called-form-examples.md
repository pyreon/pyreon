---
'@pyreon/primitives': patch
---

The `<Tabs>` API example and the README read their signals with a call (`value={tab()}`, `value={draft()}`), the repo's one way to read a signal in JSX. Both forms bind the same way.
