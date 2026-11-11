---
'@pyreon/runtime-dom': patch
---

Hydration evaluates a reactive child once. The hydration walk sampled each reactive accessor to choose how to adopt it and then let the binding call it again (three times for reactive text between elements); the sampled value, its dependencies and the effects and cleanups it created are now handed to the binding instead.
