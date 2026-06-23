---
'@pyreon/toast': minor
---

feat(toast): description + icon, `<Toaster duration>`, type-aware a11y; drop dead per-toast `position`

Feature-completeness + strict-typing pass:

- **`description`** — an optional secondary line under the message (`toast('Uploaded', { description: '3 files · 1.2 MB' })`), updatable via `toast.update`.
- **`icon`** — an optional leading icon (any VNode): `toast.success('Done', { icon: <CheckIcon /> })`.
- **`<Toaster duration={…}>`** — the app-wide default auto-dismiss duration for toasts that don't set their own. This makes the previously-documented-but-unimplemented `duration` prop real (the manifest examples referenced it but it didn't exist — they now compile).
- **Type-aware accessibility** — toasts now carry `role="alert"` (assertive) for `error`/`warning` and `role="status"` (polite) for `info`/`success`, instead of `role="alert"` on everything. The role implies its own `aria-live`, so the container no longer sets `aria-live="polite"` (which double-announced every toast).

**Breaking:** `ToastOptions.position` is removed. It was typed but never honored (per-toast position did nothing); the container-level `<Toaster position>` is unchanged. Per-toast position would require a multi-stack Toaster and is deferred.
