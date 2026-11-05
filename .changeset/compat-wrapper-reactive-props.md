---
'@pyreon/solid-compat': patch
'@pyreon/svelte-compat': patch
---

Component props stay reactive through the compat wrapper. The wrapper removed its internal child-instance key with a rest-destructure, which is a value copy: every getter-backed prop was read once at mount and frozen. A Pyreon-native parent passing `prop={signal()}` to a Solid- or Svelte-style component therefore never updated it — not in a JSX accessor, not in `createEffect`/`createMemo`, and `createEventDispatcher` kept calling the mount-time `on<Event>` handler. The key is now removed with a descriptor-preserving `splitProps`, so the component still receives a plain `Object.prototype` object whose reactive props stay live.
