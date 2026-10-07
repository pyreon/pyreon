
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function P() {
  const xs = signal<number[]>([])
  const mayb = signal<(number | null)[]>([])
  const nest = signal<number[][]>([])

  const r = rx.map(xs, (n) => n * 2)
  void r
  return null
}
