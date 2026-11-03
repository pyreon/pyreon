---
'@pyreon/runtime-dom': patch
---

Two `<For>` row-lifecycle fixes. The bulk-detach window that skips a list's row removals when its parent leaves as a unit is now scoped to that parent's subtree, so a row `onUnmount` that tears down an unrelated tree (a separate root, a node elsewhere in the document) removes it again. And rows adopted during hydration now own the `effect()`s their row callback creates, exactly like client-mounted rows, so removing a server-rendered row stops its effects.
