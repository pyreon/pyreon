---
'@pyreon/storage': minor
---

`.remove()` no longer ends the binding. It deletes the stored value and resets the signal to its default, and the signal stays live: a later `.set()` persists again, and for `useStorage` another tab's write still updates it. This holds for every backend (`useStorage`, `useSessionStorage`, `useCookie`, `useIndexedDB`, `useMemoryStorage`, `createStorage`). Before, `.remove()` also released the caller's hold on the key and its share of the cross-tab listener, so a component that kept using the key held a dead signal and the next call for that key returned a second, independent signal.

The binding is now released by its lifecycle instead: each call holds a refcount that the calling component's (owner scope's) disposal releases, and the registry entry and the cross-tab listener go away with the last holder. A call made outside any component holds the key for the page.

Breaking for code that relied on `.remove()` to detach: drop any `useStorage(key)` re-call after `.remove()` (it now returns the same live signal), and let the component's unmount release the binding.
