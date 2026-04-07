import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'

export interface SelectBaseProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  'aria-invalid'?: boolean
  name?: string
  placeholder?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless native select base — wraps a <select> element.
 * For a custom dropdown with search/virtualization, use ComboboxBase.
 */
export const SelectBase: ComponentFn<SelectBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'disabled',
    'aria-invalid',
    'name',
    'placeholder',
    'children',
    'ref',
  ])

  const [value, setValue] = useControllableState({
    value: own.value,
    defaultValue: own.defaultValue ?? '',
    onChange: own.onChange,
  })

  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    setValue(target.value)
  }

  return (
    <select
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      value={value()}
      disabled={own.disabled}
      aria-invalid={own['aria-invalid'] || undefined}
      name={own.name}
      onChange={handleChange}
    >
      {own.placeholder && (
        <option value="" disabled>
          {own.placeholder}
        </option>
      )}
      {own.children}
    </select>
  )
}
