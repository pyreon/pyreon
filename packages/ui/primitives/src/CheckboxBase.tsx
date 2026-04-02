import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface CheckboxBaseProps {
  checked?: boolean
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  indeterminate?: boolean
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
    'name',
    'value',
    'children',
    'ref',
  ])

  const isControlled = own.checked !== undefined
  const internal = signal(own.defaultChecked ?? false)

  const checked = () => (isControlled ? own.checked! : internal())

  const toggle = () => {
    if (own.disabled) return
    const next = !checked()
    if (!isControlled) internal.set(next)
    own.onChange?.(next)
  }

  return (
    <label
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="checkbox"
      aria-checked={own.indeterminate ? 'mixed' : checked()}
      aria-disabled={own.disabled || undefined}
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
  ) as unknown as VNodeChild
}
