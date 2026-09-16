/**
 * Serialisation helpers for the catalog file.
 */
/**
 * `JSON.stringify` replacer for the catalog file.
 *
 * An authored scenario's args may carry what JSON cannot: a render-prop child
 * (`children: (state) => h(…)`), a vnode built with `h`. `JSON.stringify`
 * drops a function VALUE silently and serialises a vnode as its plain-object
 * innards (`{ props, children }`) — a lie about what the scenario mounts.
 * Both become a NAMED marker instead, so a reader of the file sees that the
 * real value lives in `atlas.config.ts`, which is where the workbench and the
 * verify harness both read it from.
 */
export function catalogReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'function') return '[atlas: function — see atlas.config.ts]'
  if (looksLikeVNode(value)) return '[atlas: vnode — see atlas.config.ts]'
  return value
}

/**
 * A vnode as `h()` builds it: `{ type, props, children[] }`. The type may be a
 * tag STRING, so the shape is what identifies it — an object that merely has
 * a `type` field is data.
 */
export function looksLikeVNode(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const v = value as { type?: unknown; props?: unknown; children?: unknown }
  return (
    (typeof v.type === 'string' || typeof v.type === 'function' || typeof v.type === 'symbol') &&
    typeof v.props === 'object' &&
    Array.isArray(v.children)
  )
}
