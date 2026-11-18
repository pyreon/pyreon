---
'@pyreon/core': patch
---

Three JSX type gaps are closed. The runtime already handled all of them; only the types rejected the code.

- `<dialog>` accepts `onClose` and `onCancel`, typed to `HTMLDialogElement`.
- `<iframe>` accepts `srcdoc`, as a value or an accessor.
- Every `aria-*` attribute accepts an accessor, including one that returns `undefined`. `aria-sort={() => dir()}` and 24 others were type errors; eight attributes such as `aria-label` already allowed it.
