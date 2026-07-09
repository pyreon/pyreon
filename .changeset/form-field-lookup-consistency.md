---
"@pyreon/form": patch
---

Unknown-field-name handling is now CONSISTENT across every lookup API (release-audit finding: the same user mistake — an undeclared field name — produced five different behaviors). The contract:

- **Binding/subscription APIs throw actionable guidance**: `register("missing")` (the flagship binding API) previously crashed with a bare `TypeError: … reading 'value'`; it now throws the same `[@pyreon/form]` message as `useField`/`setFieldValue`, including the `registerField()` escape hatch for dynamic fields. `useWatch(form, "missing")` (single + array forms) likewise now throws the guidance instead of a bare TypeError.
- **Validity means INVALID**: `trigger("missing")` / `trigger(["title","missing"])` previously resolved `true` — silently reporting an undeclared field VALID. Unknown names now count as invalid (resolve `false`) + dev-warn naming them ("matched no field must mean INVALID", the same principle as schema-error routing).
- **Probes stay probes, honestly typed**: `getFieldState()` returns `FieldState | undefined` — it always returned `undefined` at runtime for unknown names; the non-optional type just deferred the crash to your first property read. It now doubles as a documented existence probe for dynamic fields. (Type-level breaking: add `?.`/`!` at call sites that assume existence.)
- **Baseline writes skip + dev-warn unknown keys**: `setInitialValues()`/`reset(values)` silently merged typo keys into the internal baseline; extra keys (e.g. server payloads carrying `id`/`createdAt`) are now skipped with a dev warning instead of polluting state — deliberately NOT a throw, so reset-to-server-data keeps working.
- **Fields-array overload accepts `focusOnError`**: the overload's inline options literal had drifted from the exported `UseFormFieldsOptions` (TS2769) — fields-overload users couldn't opt out of a default-ON behavior. The overload now uses the exported type.

All bisect-verified (guards reverted → 5 specs fail with the pre-fix behaviors; restored → green), plus the previously-unasserted `useField` guidance message is now test-locked.
