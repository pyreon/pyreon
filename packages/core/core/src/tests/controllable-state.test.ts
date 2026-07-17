import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { splitProps, useControllableState } from '../index'

/**
 * `useControllableState` lives in @pyreon/core because it is a PROPS primitive,
 * not a hook: it reads a props accessor, owns no lifecycle, and is used in the
 * same breath as `splitProps`. Its previous home (@pyreon/hooks) forced any
 * consumer of the controlled/uncontrolled pattern to depend on hooks — which
 * depends on @pyreon/styler + @pyreon/ui-core — for ~20 lines that import
 * nothing but `signal`.
 *
 * @pyreon/hooks re-exports it, and its own suite still covers that path.
 */
describe('useControllableState (canonical home: @pyreon/core)', () => {
  it('uses defaultValue when uncontrolled', () => {
    const [value] = useControllableState({ value: () => undefined, defaultValue: 'hello' })
    expect(value()).toBe('hello')
  })

  it('updates internal state when uncontrolled', () => {
    const [value, setValue] = useControllableState({ value: () => undefined, defaultValue: 0 })
    setValue(5)
    expect(value()).toBe(5)
  })

  it('a CONTROLLED value wins and does not self-update', () => {
    const external = signal('a')
    const onChange = vi.fn()
    const [value, setValue] = useControllableState({
      value: () => external(),
      defaultValue: 'z',
      onChange,
    })
    expect(value()).toBe('a')
    setValue('b')
    // Controlled: the owner decides. Internal state must NOT shadow it.
    expect(value()).toBe('a')
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('tracks the controlled value REACTIVELY (the getter contract)', () => {
    const external = signal('a')
    const [value] = useControllableState({ value: () => external(), defaultValue: 'z' })
    external.set('b')
    // `value` MUST be a getter: an eager read would have frozen this at 'a'.
    expect(value()).toBe('b')
  })

  it('supports the functional setter form', () => {
    const [value, setValue] = useControllableState({ value: () => undefined, defaultValue: 1 })
    setValue((prev) => prev + 1)
    expect(value()).toBe(2)
  })

  it('THROWS an actionable error when `value` is a value, not a getter', () => {
    expect(() =>
      // The single most common misuse. Without the guard this is either a bare
      // `value is not a function` from inside core, or — for a hand-rolled
      // equivalent — total silence: the prop is captured once and the component
      // never tracks its owner again.
      useControllableState({ value: false as unknown as () => boolean, defaultValue: true }),
    ).toThrow(/must be a GETTER/)
  })

  it('reads naturally alongside splitProps — the reason it belongs here', () => {
    const props = { checked: undefined as boolean | undefined, onChange: undefined, id: 'x' }
    const [own, rest] = splitProps(props, ['checked', 'onChange'])
    const [checked, setChecked] = useControllableState({
      value: () => own.checked,
      defaultValue: false,
      onChange: own.onChange,
    })
    expect(checked()).toBe(false)
    setChecked(true)
    expect(checked()).toBe(true)
    expect(rest.id).toBe('x')
  })
})
