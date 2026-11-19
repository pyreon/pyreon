---
'@pyreon/runtime-dom': patch
---

A reactive range re-rendered while a sibling component is still mounting stays removable. When a component wrote a signal during its setup that an earlier sibling's `() => …` child, `<Show>` or `TransitionGroup` read, that boundary re-rendered with the parent element's mount still in progress and gave its new content cleanups that removed nothing, so a later render of nothing (or a removed `TransitionGroup` item) left the old nodes in the document. Every reactive boundary now mounts its content with real removers.
