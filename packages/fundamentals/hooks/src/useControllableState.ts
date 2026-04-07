import { signal } from '@pyreon/reactivity'

type UseControllableStateOptions<T> = {
  /** Reactive getter for controlled value. Pass `() => own.prop`. */
  value: () => T | undefined
  defaultValue: T
  onChange?: ((value: T) => void) | undefined
}

export type UseControllableState = <T>(
  options: UseControllableStateOptions<T>,
) => [() => T, (next: T | ((prev: T) => T)) => void]

/**
 * Unified controlled/uncontrolled state pattern.
 *
 * `value` MUST be a getter — this ensures the controlled value is read
 * lazily inside reactive scopes, preserving Pyreon's signal reactivity.
 *
 * @example
 * const [checked, setChecked] = useControllableState({
 *   value: () => own.checked,
 *   defaultValue: false,
 *   onChange: own.onChange,
 * })
 */
export const useControllableState: UseControllableState = ({ value, defaultValue, onChange }) => {
  const internal = signal(defaultValue)
  const isControlled = value() !== undefined

  const getter = (): any => {
    const v = value()
    return v !== undefined ? v : internal()
  }

  const setValue = (next: any) => {
    const current = getter()
    const nextValue = typeof next === 'function' ? next(current) : next
    if (!isControlled) internal.set(nextValue)
    onChange?.(nextValue)
  }

  return [getter, setValue]
}

export default useControllableState
