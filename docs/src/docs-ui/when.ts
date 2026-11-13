import type { VNodeChild } from '@pyreon/core'

/**
 * `<When on={x}>…</When>`: its children when `on` is truthy, else nothing.
 *
 * Use it instead of `{x ? <El/> : null}` for a STATIC condition inside JSX
 * markup: a ternary child of a compiled template is re-created on hydration
 * instead of adopted (#4385), while a component child adopts its server DOM.
 */
export function When(props: { on: unknown; children?: VNodeChild }): VNodeChild {
  return props.on ? (props.children ?? null) : null
}
