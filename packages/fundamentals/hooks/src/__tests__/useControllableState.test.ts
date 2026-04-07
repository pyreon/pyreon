import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { useControllableState } from '../useControllableState'

describe('useControllableState', () => {
  it('uses defaultValue when uncontrolled', () => {
    const [value] = useControllableState({ value: () => undefined, defaultValue: 'hello' })
    expect(value()).toBe('hello')
  })

  it('updates internal state when uncontrolled', () => {
    const [value, setValue] = useControllableState({ value: () => undefined, defaultValue: 0 })
    setValue(5)
    expect(value()).toBe(5)
  })

  it('uses value when controlled', () => {
    const [value] = useControllableState({ value: () => 'controlled', defaultValue: 'default' })
    expect(value()).toBe('controlled')
  })

  it('does not update internal state when controlled', () => {
    const onChange = vi.fn()
    const [value, setValue] = useControllableState({
      value: () => 'controlled',
      defaultValue: 'default',
      onChange,
    })
    setValue('new')
    expect(value()).toBe('controlled')
    expect(onChange).toHaveBeenCalledWith('new')
  })

  it('calls onChange in uncontrolled mode', () => {
    const onChange = vi.fn()
    const [, setValue] = useControllableState({ value: () => undefined, defaultValue: 0, onChange })
    setValue(10)
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('supports updater function', () => {
    const [value, setValue] = useControllableState({ value: () => undefined, defaultValue: 1 })
    setValue((prev: number) => prev + 1)
    expect(value()).toBe(2)
  })

  it('tracks reactive getter changes', () => {
    let external: string | undefined = 'a'
    const [value] = useControllableState({
      value: () => external,
      defaultValue: 'default',
    })
    expect(value()).toBe('a')
    external = 'b'
    expect(value()).toBe('b')
  })

  it('tracks signal-based controlled value', () => {
    const checked = signal(false)
    const [value, setValue] = useControllableState({
      value: () => checked(),
      defaultValue: false,
      onChange: (v: boolean) => checked.set(v),
    })
    expect(value()).toBe(false)
    setValue(true)
    expect(checked()).toBe(true)
    expect(value()).toBe(true)
  })

  it('falls back to internal when getter returns undefined', () => {
    const external = signal<string | undefined>(undefined)
    const [value, setValue] = useControllableState({
      value: () => external(),
      defaultValue: 'fallback',
    })
    expect(value()).toBe('fallback')
    setValue('internal')
    expect(value()).toBe('internal')
    external.set('controlled')
    expect(value()).toBe('controlled')
  })
})
