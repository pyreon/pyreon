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
 * Lives in `@pyreon/core` rather than `@pyreon/hooks` because it is a PROPS
 * primitive, not a hook: it reads a props accessor, owns no lifecycle, and is
 * used alongside `splitProps` in the same breath —
 *
 * ```ts
 * const [own, rest] = splitProps(props, ['checked', 'onChange'])
 * const [checked, setChecked] = useControllableState({ value: () => own.checked, … })
 * ```
 *
 * It was previously in `@pyreon/hooks`, which meant any package wanting the
 * controlled/uncontrolled pattern had to depend on hooks — and hooks depends on
 * `@pyreon/styler` + `@pyreon/ui-core`. That dragged the whole UI-system styling
 * layer plus 40+ unrelated hooks (useFetch/useHaptics/useShare/…) into any
 * consumer, to obtain ~20 lines that import nothing but `signal`. Every consumer
 * already depends on `@pyreon/core`, so this home costs no new dependency edge.
 * `@pyreon/hooks` re-exports it, so its public API is unchanged.
 *
 * @example
 * const [checked, setChecked] = useControllableState({
 *   value: () => own.checked,
 *   defaultValue: false,
 *   onChange: own.onChange,
 * })
 */
export const useControllableState: UseControllableState = ({ value, defaultValue, onChange }) => {
  if (process.env.NODE_ENV !== 'production' && typeof value !== 'function') {
    // The single most common misuse, and it is otherwise invisible: passing the
    // VALUE (`value: own.checked`) reads the prop once at setup, so the
    // component silently stops tracking its owner and never updates again.
    // Without this guard the only symptom is a bare `value is not a function`
    // TypeError from inside this file — untraceable to the call site, and too
    // generic for the diagnose catalog to match on safely.
    throw new TypeError(
      '[Pyreon] useControllableState: `value` must be a GETTER, not a value — ' +
        'pass `value: () => props.x`, not `value: props.x`. A value is read once at ' +
        'setup, so the controlled prop would be frozen and the component would stop ' +
        'tracking its owner.',
    )
  }
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
