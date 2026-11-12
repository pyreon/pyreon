// ─── Serialize parsed frontmatter as a JavaScript expression ──────────────
//
// A compiled content module (and a collection's metadata module) ships the
// frontmatter its collection schema PARSED — defaults applied, values as
// the schema's output type says. JSON cannot carry a `Date`, and turning a
// `Date` into its ISO string at the module boundary is exactly the mismatch
// this replaces (the generated types promised `Date`, the runtime handed out
// a string). So the value is written as a JS expression: plain JSON for
// everything JSON can hold, `new Date(<ms>)` for dates.

/**
 * A JavaScript expression that evaluates to `value`. Supports what a
 * frontmatter schema produces: primitives, arrays, plain objects and
 * `Date`. `undefined` object properties are dropped (as JSON would);
 * anything else (functions, class instances, `Map`) is refused, because it
 * could not round-trip through a module and would otherwise ship as `{}`.
 *
 * @internal exported for the pipeline + tests
 */
export function toJsExpression(value: unknown, path = 'frontmatter'): string {
  if (value === null) return 'null'
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? 'new Date(NaN)' : `new Date(${t})`
  }
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)
    case 'number':
      return Number.isFinite(value) ? String(value) : value > 0 ? 'Infinity' : value < 0 ? '-Infinity' : 'NaN'
    case 'undefined':
      return 'undefined'
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((v, i) => toJsExpression(v, `${path}[${i}]`)).join(', ')}]`
      }
      const proto = Object.getPrototypeOf(value) as object | null
      if (proto !== Object.prototype && proto !== null) break
      const parts: string[] = []
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === undefined) continue
        parts.push(`${JSON.stringify(key)}: ${toJsExpression(v, `${path}.${key}`)}`)
      }
      return `{${parts.join(', ')}}`
    }
    default:
      break
  }
  throw new TypeError(
    `[@pyreon/zero-content] ${path}: a frontmatter value must be a string, number, boolean, null, Date, array or plain object (got ${Object.prototype.toString.call(value)}). Make the collection schema output plain data.`,
  )
}
