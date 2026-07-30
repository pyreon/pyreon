/**
 * A component that LEAKS one reactive node per mount, by construction: a
 * computed subscribing to a module-level signal, parked in a module-level
 * array and never disposed. The exact subscription-retention shape the leak
 * check exists to catch — repeated mounts strand a monotonically growing set.
 */
import { computed, signal } from '@pyreon/reactivity'

const external = signal(0)
const retained: unknown[] = []

export function Leaky(props: { label?: string }): null {
  retained.push(computed(() => external()))
  void props
  return null
}
