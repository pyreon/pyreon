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
- CSP: the stylesheet is injected once as `<style data-pyreon-toast>`; `nonce` sets the element's nonce before insertion, `injectStyles={false}` skips it, and `styles.css` (package root, exported as `@pyreon/toast/styles.css`) carries the same rules — locked equal to `toastStyles` by `csp-and-labels.test.tsx`. Locked in real Chromium by `csp.browser.test.tsx`.
- Accessible names: `label` (region) and `dismissLabel` (every dismiss button) are `string | () => string`, read inside JSX accessors so a locale signal relabels in place; a toast's own `dismissLabel` option wins. Natively both are warned by name (no lowering yet).
- Out of scope: swipe-to-dismiss, collapsed stacking, per-toast position.
