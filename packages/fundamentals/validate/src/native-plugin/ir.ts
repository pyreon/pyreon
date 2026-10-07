// The `withField` metadata model. The schema model itself lives in `@pyreon/validation/native-plugin`, which
// this plugin builds on.

/**
 * Gap 4 follow-up — @pyreon/validate `withField(schema, meta)` v1.
 * PMTC discards the schema arg (it's a Zod/Valibot/ArkType runtime
 * object that doesn't translate) and emits a metadata struct holding
 * the literal `meta` fields. Downstream native code can reference
 * `emailField.label`, `emailField.placeholder`, etc. — useful for
 * form labels / UI hints even without runtime schema validation.
 *
 * v1 scope: literal meta object with string fields. Validator runtime
 * (parseReactive, formatErrors, getMeta, watchValid) is NOT ported.
 */
export interface FieldMetaDefnIR {
  /** Top-level binding name (e.g. `emailField`). */
  bindingName: string
  /** Literal meta fields (string values only in v1). */
  meta: { name: string; value: string }[]
}