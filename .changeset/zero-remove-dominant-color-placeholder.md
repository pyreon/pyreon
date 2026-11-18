---
"@pyreon/zero": minor
---

Remove the `'dominant-color'` image placeholder strategy, a deprecated alias of `'color'`. `PlaceholderStrategy` is now `'blur' | 'color' | 'none'`, and an unknown strategy in an untyped config now throws at plugin creation instead of silently falling back to `'blur'`.

Migration: write `placeholder: 'color'` instead of `placeholder: 'dominant-color'`; `pyreon upgrade` does it for you.

Upgrade: codemod zero-placeholder-color
