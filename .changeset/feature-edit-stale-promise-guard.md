---
'@pyreon/feature': patch
---

fix(feature): guard edit-mode auto-fetch against write-after-unmount. `useForm({ mode: 'edit', id })` could resolve its `getById` fetch after the component unmounted and write the server data into a disposed form (the stale-promise class). An `onUnmount` cancellation flag now skips both settle branches after unmount.
