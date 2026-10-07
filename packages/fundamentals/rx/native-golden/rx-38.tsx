
import { rx } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'

export function P() {
  const xs = signal<number[]>([])
  const parts = rx.partition(xs, (n) => n > 0)
  return null
}
