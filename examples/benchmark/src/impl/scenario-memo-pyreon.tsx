/**
 * Pyreon's memoization-wall components — own `.tsx` so the Pyreon compiler
 * processes them into `_tpl()` + fine-grained binds (same reason as
 * `scenario-dbmon-pyreon.tsx` and `scenario-tree-pyreon.tsx`; hand-writing
 * `h()` in the shared module would measure the slower runtime path and
 * handicap the Pyreon arm).
 *
 * The consumer takes the derived value as an ACCESSOR prop and reads it inside
 * the binding, so a bucket change is one text write per consumer and an
 * unchanged bucket is — for a computed that gates — no work at all.
 */
import type { VNodeChild } from '@pyreon/core'

export function PyreonMemoConsumer(props: { bucket: () => number }): VNodeChild {
  return <span class="memo-consumer">{() => props.bucket()}</span>
}

export function PyreonMemoWall(props: {
  source: () => number
  bucket: () => number
  count: number
}): VNodeChild {
  const consumers: VNodeChild[] = []
  for (let i = 0; i < props.count; i++) {
    consumers.push(<PyreonMemoConsumer bucket={props.bucket} />)
  }
  return (
    <div class="memo-root">
      <span class="memo-source">{() => props.source()}</span>
      <span class="memo-bucket">{() => props.bucket()}</span>
      <div class="memo-consumers">{consumers}</div>
    </div>
  )
}
