---
'@pyreon/lint': patch
---

`pyreon/no-error-without-prefix` now also accepts the more-specific `[@pyreon/<pkg>]` convention (e.g. `throw new Error('[@pyreon/state-tree] …')`), not just the generic `[Pyreon]` token. Both satisfy the rule's purpose — the error is identifiable as coming from the framework, and the scoped form additionally names the package — so flagging `[@pyreon/<pkg>]` was a false-positive against the rule's own intent. Unrelated bracket prefixes (`[Vue]`, etc.) are still flagged.
