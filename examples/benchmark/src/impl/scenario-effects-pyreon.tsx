/**
 * Pyreon's effect-heavy-list components — own `.tsx` so the Pyreon compiler
 * lowers them to `_tpl()` + fine-grained binds (same reason as the other
 * `scenario-*-pyreon.tsx` files).
 *
 * Each row owns ONE `effect()` over its own signal. `effect` is Pyreon's
 * documented "run this when a tracked value changes" primitive, and creating it
 * in the component body ties its lifetime to the component's `EffectScope`, so
 * unmounting the list disposes all 500 subscriptions — which is exactly what
 * the `dispose` op measures.
 *
 * The effect body is deliberately trivial (record + count). The measurement is
 * subscription DISPATCH; any real work in the body would be paid identically by
 * every framework and would only dilute the signal.
 */
import type { VNodeChild } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import type { EffectSink } from './scenario-graph-shared'

export function PyreonFxRow(props: {
  value: () => number
  index: number
  sink: EffectSink
}): VNodeChild {
  effect(() => {
    const v = props.value()
    props.sink.values[props.index] = v
    props.sink.runs++
  })
  return <span class="fx-row">{() => props.value()}</span>
}

export function PyreonFxList(props: {
  rows: { value: () => number }[]
  sink: EffectSink
}): VNodeChild {
  const children: VNodeChild[] = []
  for (let i = 0; i < props.rows.length; i++) {
    const row = props.rows[i] as { value: () => number }
    children.push(<PyreonFxRow value={row.value} index={i} sink={props.sink} />)
  }
  return <div class="fx-list">{children}</div>
}
