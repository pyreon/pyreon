import { signal } from '@pyreon/reactivity'

type UseControllableStateOptions<T> = {
  value?: T | undefined
  defaultValue: T
  onChange?: ((value: T) => void) | undefined
}

export type UseControllableState = <T>(
  options: UseControllableStateOptions<T>,
) => [() => T, (next: T | ((prev: T) => T)) => void]

/**
 * Unified controlled/uncontrolled state pattern.
 * When `value` is provided the component is controlled; otherwise
 * internal state is used with `defaultValue` as the initial value.
 * The `onChange` callback fires in both modes.
 *
 * Returns [getter, setter] where getter is a reactive function.
 */
export const useControllableState: UseControllableState = ({ value, defaultValue, onChange }) => {
  const internal = signal(defaultValue)
  const onChangeFn = onChange

  const isControlled = value !== undefined

  const getter = (): any => (isControlled ? value : internal())

  const setValue = (next: any) => {
    const current = isControlled ? value : internal()
    const nextValue = typeof next === 'function' ? next(current) : next
    if (!isControlled) internal.set(nextValue)
    onChangeFn?.(nextValue)
  }

  return [getter, setValue]
}

export default useControllableState
