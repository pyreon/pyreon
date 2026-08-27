'use plain'
import { state, derived } from '@pyreon/core/plain'

export let count = state(0)
export const double = derived(count * 2)
export const bump = () => {
  count = count + 1
}
