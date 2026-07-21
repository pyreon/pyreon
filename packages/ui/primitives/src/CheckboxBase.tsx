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
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      role="checkbox"
      aria-checked={own.indeterminate ? 'mixed' : checked() ? 'true' : 'false'}
      aria-disabled={own.disabled ? 'true' : undefined}
      aria-invalid={own['aria-invalid'] ? 'true' : undefined}
      data-checked={checked() || undefined}
      data-disabled={own.disabled || undefined}
      tabIndex={own.disabled ? -1 : 0}
      onClick={(e: MouseEvent) => {
        // A <label> forwards its click to the wrapped control as a DEFAULT
        // ACTION: without preventDefault the forwarded <input> click fires the
        // input's onChange (toggle) AND bubbles back to this onClick (toggle),
        // so a single user click would toggle THREE times. preventDefault
        // cancels the forward; the input stays in sync via its reactive
        // `checked={checked()}` binding, and its onChange still covers a
        // native form reset. (Verified in real Chromium — a synthetic OR real
        // label click otherwise fires onChange 3×.)
        e.preventDefault()
        toggle()
      }}
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
