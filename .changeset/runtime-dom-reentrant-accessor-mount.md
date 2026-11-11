---
'@pyreon/runtime-dom': patch
---

A reactive child whose own mount writes a signal it read (a ref recording state, `<Show>` over a transition stage, kinetic's `appear`) now mounts its content once. The accessor dispatcher used to build a second binding, and the text-to-subtree swap kept an orphaned copy.
