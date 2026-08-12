---
"@pyreon/toast": patch
---

fix(toast): a description added later via `toast.update()` now renders (the `<Show>` gate was frozen)

`ToastItem` read `hasDescription` ONCE from the setup snapshot and gated the description container on that static boolean — while `description` is a mutable field `toast.update()` (and `toast.promise` transitions) patch. So a toast created without a description, then given one via `toast.update(id, { description })`, updated the store correctly but never mounted its `.pyreon-toast__description` div (the inner content thunk already read `live()`). The gate is now reactive — `when={() => live()?.description != null}` — so the container mounts/unmounts with the live value. `icon`/`action`/`dismissible` stay frozen reads (genuinely immutable — `updateToast` never touches them). Bisect-verified in real Chromium.
