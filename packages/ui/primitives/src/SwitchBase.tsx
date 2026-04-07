import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'

export interface SwitchBaseProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  'aria-invalid'?: boolean
  name?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless switch/toggle base — manages on/off state, ARIA switch role, keyboard.
 */
export const SwitchBase: ComponentFn<SwitchBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'checked',
    'defaultChecked',
    'onChange',
    'disabled',
    'aria-invalid',
    'name',
    'children',
    'ref',
  ])

  const [checked, setChecked] = useControllableState({
    value: own.checked,
    defaultValue: own.defaultChecked ?? false,
    onChange: own.onChange,
  })

  const toggle = () => {
    if (own.disabled) return
    setChecked(!checked())
  }

  return (
    <button
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      type="button"
      role="switch"
      aria-checked={checked()}
      aria-disabled={own.disabled || undefined}
      aria-invalid={own['aria-invalid'] || undefined}
      data-checked={checked() || undefined}
      data-disabled={own.disabled || undefined}
      tabIndex={own.disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          toggle()
        }
      }}
    >
      {own.children}
    </button>
  )
}
