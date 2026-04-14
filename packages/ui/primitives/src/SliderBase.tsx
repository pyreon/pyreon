import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'

export interface SliderBaseProps {
  value?: number
  defaultValue?: number
  onChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  'aria-invalid'?: boolean
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
    'aria-invalid',
    'name',
    'children',
    'ref',
  ])

  const [value, setValue] = useControllableState({
    value: () => own.value,
    defaultValue: own.defaultValue ?? own.min ?? 0,
    onChange: own.onChange,
  })

  const handleInput = (e: Event) => {
    const target = e.target as HTMLInputElement
    setValue(Number(target.value))
  }

  return (
    <input
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
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
      aria-invalid={own['aria-invalid'] || undefined}
      onInput={handleInput}
    />
  )
}
