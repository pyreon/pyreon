import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface SelectBaseProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  disabled?: boolean
  name?: string
  placeholder?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless native select base — wraps a <select> element.
 * For a custom dropdown with search/virtualization, use ComboboxBase (Phase 6).
 */
export const SelectBase: ComponentFn<SelectBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'disabled',
    'name',
    'placeholder',
    'children',
    'ref',
  ])

  const isControlled = own.value !== undefined
  const internal = signal(own.defaultValue ?? '')
  const value = () => (isControlled ? own.value! : internal())

  const handleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    if (!isControlled) internal.set(target.value)
    own.onChange?.(target.value)
  }

  return (
    <select
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      value={value()}
      disabled={own.disabled}
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
  ) as unknown as VNodeChild
}
