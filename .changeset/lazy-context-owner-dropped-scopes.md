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
- `mount()` and `hydrateRoot()` install a contextless root context owner when none is current, so code inside a mounted tree always runs under a non-null owner and an effect re-run restores it. `runWithContextOwner()` runs its callback with no component pending, so a `provide()` in a re-run writes onto the restored owner instead of claiming a component that is mid-setup.
- Fixed: a component whose subtree threw while hydrating (contained, reported to the error boundary) left its owner frame open, and every owned binding built afterwards outside a mount was retained forever.
- Fixed: a component whose props could not be built (a props object that throws while its keys are read) escaped `mount` / hydration and left the current scope, the context owner and the pending owner set. It is now contained and reported like a throwing setup.
