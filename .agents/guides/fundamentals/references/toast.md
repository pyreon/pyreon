# @pyreon/toast

- `toast(message)` plus `.success/.error/.warning/.info/.loading`; `.update`, `.dismiss`, `.remove`, `.promise`.
- `<Toaster>` renders through a Portal with CSS transitions.
- The countdown pauses under three independent holds — hover, keyboard focus, hidden tab — tracked by identity, so releasing one does not restart the clock while another is held.
- Live-region role by type: `role="alert"` for error/warning, `role="status"` for info/success, with `aria-atomic`. The role implies `aria-live`, so the container sets none.
- Two-phase removal (the react-hot-toast split):
  - `dismiss(id?)` is soft: it sets `state: 'exiting'`, plays the leave animation, then removes after `LEAVE_DURATION` (200 ms). `onDismiss` fires immediately. Auto-dismiss uses this path.
  - `remove(id?)` removes instantly.
  - The store owns the leave timing, so it works headless.
- Rows are keyed `<For by={id}>` and read live fields through the `_toastMap` computed.
- Portal'd buttons need a scoped delegation root: a per-instance host appended to `body` with `setupDelegation(host)`.
- Out of scope: swipe-to-dismiss, collapsed stacking, per-toast position.
