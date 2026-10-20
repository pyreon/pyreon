---
'@pyreon/form': minor
---

`useForm` sets up forms much faster: about 3.3× on Node and 28% on Bun for a 12-field form. Each field is now a class instance instead of an object literal with four getters. Creating that object literal was the main per-field setup cost (about 387 ns per field on V8). Field updates and `reset` are unchanged or slightly faster.

Behavior note: `error`, `touched`, `disabled` and `readOnly` are now prototype getters rather than own properties. Reading them, destructuring them (`const { error } = field`), and destructuring `setValue` / `setTouched` / `reset` all work as before. A `{ ...field }` spread no longer copies those four signals, and `Object.keys(field)` lists only `value`, `dirty`, `setValue`, `setTouched` and `reset`. Read the lazy signals off the field directly.
