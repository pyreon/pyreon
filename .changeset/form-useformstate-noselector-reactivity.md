---
'@pyreon/form': patch
---

Fix `useFormState(form)` (no selector) `isValid` / `isDirty` not updating the
rendered DOM.

The no-selector summary's `isValid` / `isDirty` came from the count-based
`form.isValid()` / `form.isDirty()` (backed by `_invalidCount` / `_dirtyCount`),
but those counts are updated by a DEFERRED field-signal subscriber. The
no-selector summary ALSO depends on the field signals (via the `errors` /
`dirtyFields` atoms it materializes), so it re-derived on the field-signal
change BEFORE the count caught up — rendering a STALE value. Symptom: a UI bound
to `useFormState(form)().isDirty` / `.isValid` (e.g. a "Dirty" / "Invalid"
badge) never flipped when a field changed.

Fix: in the no-selector path, derive `isValid` / `isDirty` from the `errors` /
`dirtyFields` atoms it already materializes (`Object.keys(errors).length === 0`
/ `Object.keys(dirtyFields).length > 0`) — the SAME field-signal dependency that
triggers the recompute, so the value is always consistent. No added cost (the
atoms were already read). The **selector** path is unchanged and keeps the O(1)
count-based getters (it doesn't read the atoms, so it was never subject to the
race — and remains the recommended pattern for hot UI).

Pre-existing bug (not introduced by the perf changes in this release). Locked by
mount-based regression specs + a real-Chromium form-interaction e2e
(`e2e/fundamentals/form-interaction.spec.ts`).
