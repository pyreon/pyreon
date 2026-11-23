---
"@pyreon/reactivity": minor
"@pyreon/core": minor
"@pyreon/runtime-dom": minor
"@pyreon/svelte-compat": patch
---

A component that registers nothing no longer keeps its `EffectScope` alive. On the 2,047-component deep tree, retained heap drops from about 532 KB to about 354 KB (Solid 1.9: about 206 KB on the same pages; the ratio goes from 2.6× to 1.7×).

- A component becomes its children's context owner on its FIRST `provide()`. A component that provides nothing is not in the owner chain, and its children link straight to the nearest provider.
- At the end of its mount (or hydration), a component whose scope has no effects, computeds, cleanups or `onUpdate` hooks, never provided and was never handed out by `getCurrentScope()` keeps no scope. Its unmount is just its subtree's cleanup.
- **Behaviour change:** a `provide()` that runs AFTER the component already mounted a child is no longer visible to that child. That covers `provide()` late in the setup body after a child component was built, and `provide()` in `onMount` or in an effect. Before, the child could see it through a later lookup by accident of the owner chain. Dev mode warns on such a late call. Call `provide()` before building or returning children.
- `getCurrentScope()` now keeps the scope it returns alive for the component's lifetime, so a caller can still register into that scope later (`runWithOwner`, a deferred `scope.add`). Framework internals read the scope through a non-pinning internal reader.
- svelte-compat claims context ownership in its component wrapper, because a Svelte body runs inside the wrapper's render effect. Without that, `setContext` would land on the parent's owner.
