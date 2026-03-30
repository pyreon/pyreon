import { signal } from '@pyreon/reactivity'
import isEqual from './isEqual'

/**
 * Returns a referentially stable version of `value`. The returned reference
 * only changes when the value is no longer deeply equal to the previous one.
 *
 * Pyreon equivalent of the React useStableValue hook — uses a signal
 * internally to hold the stable reference.
 */
const useStableValue = <T>(value: T): T => {
  const ref = signal(value)

  if (!isEqual(ref.peek(), value)) {
    ref.set(value)
  }

  return ref.peek()
}

export default useStableValue
