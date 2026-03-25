// --------------------------------------------------------
// Remove Nullable values
// --------------------------------------------------------
/** Filters out entries with `null`, `undefined`, or `false` values from an object. */
type RemoveNullableValues = (obj: Record<string, any>) => Record<string, any>
export const removeNullableValues: RemoveNullableValues = (obj) =>
  Object.entries(obj)
    .filter(([, v]) => v != null && v !== false)
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {})
