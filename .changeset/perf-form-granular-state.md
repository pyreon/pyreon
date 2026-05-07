---
'@pyreon/form': minor
---

Granular `useFormState` selectors + O(1) `form.isValid` / `form.isDirty`. Pre-fix, every `useFormState(form, selector)` call rebuilt the full summary on each invalidation — `s => s.isValid` triggered a 10k-field scan because `buildSummary()` always materialized `touchedFields` / `dirtyFields` / `errors` maps. And `form.isValid` / `form.isDirty` were themselves O(N) computeds iterating every field on each recompute. Post-fix:

- `useFormState` returns a getter-backed summary; selectors only track the signals they actually read. A button gated on `s => s.isValid && !s.isSubmitting` no longer scans the field maps. Verified against the 10k-field stress benchmark: `form.formStateScan.fieldsRead` drops from 10000 to 0 on selector reads.
- `form.isValid` and `form.isDirty` are now O(1) reads of incrementally-tracked `_invalidCount` / `_dirtyCount` signals, updated via per-field `signal.subscribe` listeners (lighter than effects). Cost: 2 extra signal-creates per form, 2 subscribers per field at mount; benefit: form-level reactive reads scale flat regardless of field count.
- The 3 atomic computeds (touched/dirty/errors maps) are shared across all `useFormState()` calls on the same form via a per-form WeakMap cache — selector A reading `errors` reuses the same computed as selector B reading `errors`. A field's error flip invalidates only the errors map, not touched/dirty.

No public API change. `useFormState(form)` (no selector) still returns the full summary snapshot. Bisect-verified: reverting either fix fails the new regression tests in `form-additional.test.tsx`.
