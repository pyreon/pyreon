---
'@pyreon/preact-compat': patch
---

`@pyreon/preact-compat/signals` (the `@preact/signals` alias) now exports the component hooks `useSignal`, `useComputed` and `useSignalEffect`. `import { useSignal } from '@preact/signals'` under `compat: 'preact'` used to fail at import.
