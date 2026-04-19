---
'@pyreon/hotkeys': patch
'@pyreon/code': patch
'@pyreon/form': patch
'@pyreon/validation': patch
'@pyreon/feature': patch
---

Triaged safe changes from architecture review PR #260:

- **hotkeys**: detach global `keydown` listener when last hotkey unregisters (prevents listener accumulation across component remounts)
- **code**: new `useEditorSignal()` hook — wraps `bindEditorToSignal` with `onUnmount` auto-cleanup (eliminates manual `dispose()` calls)
- **form**: `ValidateFn` accepts optional `AbortSignal`; `useForm` creates per-cycle `AbortController` cancelled on unmount (prevents orphaned async validators)
- **validation**: `zodSchema()` / `valibotSchema()` / `arktypeSchema()` return `TypedSchemaAdapter<TValues>` with `.validator` and phantom `_infer` type for compile-time field name validation. `useForm({ schema })` accepts both the new adapter and plain `SchemaValidateFn` (backward compatible).

Dropped from the original PR: onCleanup LIFO ordering change (breaking behavioral change), circular effect detection (redundant with batch), SSR streaming backpressure (architecturally wrong implementation).
