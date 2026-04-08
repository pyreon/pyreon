import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'

export interface CheckboxBaseProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  indeterminate?: boolean
  'aria-invalid'?: boolean
  name?: string
  value?: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless checkbox base — manages checked state, ARIA, keyboard.
 * Wrap with rocketstyle for visual styling.
 */
export const CheckboxBase: ComponentFn<CheckboxBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'checked',
    'defaultChecked',
    'onChange',
    'disabled',
    'indeterminate',
    'aria-invalid',
    'name',
    'value',
    'children',
    'ref',
  ])

  const [checked, setChecked] = useControllableState({
    value: () => own.checked,
    defaultValue: own.defaultChecked ?? false,
    onChange: own.onChange,
  })

  const toggle = () => {
    if (own.disabled) return
    setChecked(!checked())
  }

  return (
    <label
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="checkbox"
      aria-checked={own.indeterminate ? 'mixed' : checked()}
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
      <input
        type="checkbox"
        checked={checked()}
        disabled={own.disabled}
        name={own.name}
        value={own.value}
        tabIndex={-1}
        aria-hidden="true"
        style="position:absolute;opacity:0;width:0;height:0;pointer-events:none"
        onChange={(e: Event) => {
          e.stopPropagation()
          toggle()
        }}
      />
      {own.children}
    </label>
  )
}
