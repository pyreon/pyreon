
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function P() {
  const xs = signal<number[]>([])
  const mayb = signal<(number | null)[]>([])
  const nest = signal<number[][]>([])

  const r = rx.takeWhile(xs, (n) => n > 0)
  void r
  return null
}
