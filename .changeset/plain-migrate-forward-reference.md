---
'@pyreon/compiler': patch
---

The Plain Mode codemod (`pyreon plain`) no longer breaks a signal that a closure or hoisted function references above its declaration (`const done = () => n.set(n.peek() + 1)` written before `const n = signal(0)`). The codemod registered each name at its declaration, so it converted `n` to `let n = state(0)` and left the earlier closure calling `.set` and `.peek` on a plain number. Such a binding now declines with the new `forward-reference` code and keeps its classic text. Every block's declarations are also in scope for the whole block, so a later inner `const x = 5` no longer lets an earlier closure's `x` be rewritten as an outer signal.
