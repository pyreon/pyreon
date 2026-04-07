import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface SliderBaseProps {
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  name?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless range slider base — wraps a native <input type="range">.
 */
export const SliderBase: ComponentFn<SliderBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'min',
    'max',
    'step',
    'disabled',
    'name',
    'children',
    'ref',
  ])

  const isControlled = own.value !== undefined
  const internal = signal(own.defaultValue ?? own.min ?? 0)
  const value = () => (isControlled ? own.value! : internal())

  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement
    const numVal = Number(target.value)
    if (!isControlled) internal.set(numVal)
    own.onChange?.(numVal)
  }

  return (
    <input
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      type="range"
      value={value()}
      min={own.min ?? 0}
      max={own.max ?? 100}
      step={own.step ?? 1}
      disabled={own.disabled}
      name={own.name}
      role="slider"
      aria-valuenow={value()}
      aria-valuemin={own.min ?? 0}
      aria-valuemax={own.max ?? 100}
      aria-disabled={own.disabled || undefined}
      onInput={handleInput}
    />
  ) as unknown as VNodeChild
}
