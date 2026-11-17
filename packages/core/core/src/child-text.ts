/**
 * The ONE rule for a JSX child value in a text position, shared by every
 * renderer: the `h()` mount, the compiled template setters and bindings
 * (`_setChild`, `_setChildAt`, `_bindText`, `bindPolymorphicText`), SSR
 * (`renderNode`, `_esc`) and hydration. Each of those used to coerce on its own,
 * and they disagreed: an array of strings rendered `a,b` through the compiled
 * text bindings and `ab` everywhere else, `true` rendered "true" on the server
 * and nothing in a compiled template, `false` at a mixed-content slot rendered the word "false", and a
 * bigint or a `Date` crashed `renderToString` while the client rendered text.
 *
 * A child value is STRUCTURAL — it is mounted, not stringified — when it is:
 *   - a VNode (`{ type, props, children }`; VNodes carry no brand) or a
 *     NativeItem (`__isNative`, the output of `_tpl()` / `createTemplate()`),
 *   - a function (an accessor: a reactive child),
 *   - an array holding a structural value at any depth.
 *
 * Every other value is TEXT, and `_childText` gives its characters:
 *   - `null`, `undefined`, `true`, `false` → nothing (`''`): the documented
 *     contract (`{flag && <X />}`), which the compiler already applied to a
 *     literal `{true}` while the runtime paths rendered the word "true",
 *   - a string → itself; a number or a bigint → `String(v)`,
 *   - an array → its items' text, concatenated (nested arrays flatten),
 *   - any other object (a `Date`, a plain object, a class instance) →
 *     `String(v)`, i.e. its `toString()`.
 *
 * Hot paths keep their primitive branch inline (`v == null || typeof v ===
 * 'boolean' ? '' : String(v)`) and call `_childText` only for an object, so a string or
 * number update pays one extra `typeof` compare and no call.
 *
 * Internal: emitted and called by the framework's renderers, not meant for
 * hand-written code.
 */

/** A VNode or NativeItem: the two object shapes a renderer mounts. */
export function _isVNodeLike(v: object): boolean {
  return (
    (v as { __isNative?: boolean }).__isNative === true ||
    ('type' in v && 'props' in v && 'children' in v)
  )
}

/** True when `v` must be MOUNTED rather than rendered as text (see above). */
export function _isStructuralChild(v: unknown): boolean {
  if (typeof v === 'function') return true
  if (v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) if (_isStructuralChild(v[i])) return true
    return false
  }

  return _isVNodeLike(v)
}

/**
 * The text of a non-structural child value (see above). Callers decide
 * structure first; given a structural value this returns its `String()`
 * coercion, which no renderer writes.
 */
export function _childText(v: unknown): string {
  if (v == null || typeof v === 'boolean') return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    let s = ''
    for (let i = 0; i < v.length; i++) s += _childText(v[i])
    return s
  }

  return String(v as number)
}
