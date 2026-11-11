---
'@pyreon/solid-compat': patch
---

`onCleanup` now registers on the current owner, as in Solid. Inside `createEffect` it runs before each re-run and when the effect is disposed; inside `createRoot` it runs when the root is disposed.

It used to always mean "component unmount": a cleanup registered inside an effect never ran between runs, so a listener, timer or socket opened per run piled up for the life of the component, and one registered inside `createRoot` never ran at all.
