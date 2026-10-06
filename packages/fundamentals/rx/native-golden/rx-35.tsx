
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function P() {
  const xs = signal<number[]>([])
  const mayb = signal<(number | null)[]>([])
  const nest = signal<number[][]>([])

  const r = rx.average(xs)
  void r
  return null
}
