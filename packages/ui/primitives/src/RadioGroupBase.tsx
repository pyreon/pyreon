import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, provide, splitProps, useContext } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { navigateByRole } from './keyboard'

// ─── Radio Group Context ─────────────────────────────────────────────────────

interface RadioGroupCtx {
  value: () => string
  onChange: (value: string) => void
  name: string | undefined
  disabled: boolean | undefined
}

const RadioGroupContext = createContext<RadioGroupCtx>({
  value: () => '',
  onChange: () => {},
  name: undefined,
  disabled: undefined,
})

export const useRadioGroup = () => useContext(RadioGroupContext)

// ─── RadioGroupBase ──────────────────────────────────────────────────────────

export interface RadioGroupBaseProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  name?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

export const RadioGroupBase: ComponentFn<RadioGroupBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'name',
    'disabled',
    'aria-invalid',
    'children',
    'ref',
  ])

  const [value, setValue] = useControllableState({
    value: () => own.value,
    defaultValue: own.defaultValue ?? '',
    onChange: own.onChange,
  })

  provide(RadioGroupContext, { value, onChange: setValue, name: own.name, disabled: own.disabled })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="radiogroup"
      aria-invalid={own['aria-invalid'] || undefined}
    >
      {own.children}
    </div>
  )
}

// ─── RadioBase ───────────────────────────────────────────────────────────────

export interface RadioBaseProps {
  value: string
  disabled?: boolean
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

export const RadioBase: ComponentFn<RadioBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['value', 'disabled', 'children', 'ref'])
  const group = useRadioGroup()

  const checked = () => group.value() === own.value
  const isDisabled = () => own.disabled || group.disabled

  const select = () => {
    if (isDisabled()) return
    group.onChange(own.value)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      select()
      return
    }

    const value = navigateByRole(e, {
      containerSelector: '[role="radiogroup"]',
      itemSelector: '[role="radio"]',
      keys: 'both',
    })
    if (value) group.onChange(value)
  }

  return (
    <label
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="radio"
      aria-checked={checked()}
      aria-disabled={isDisabled() || undefined}
      data-checked={checked() || undefined}
      data-disabled={isDisabled() || undefined}
      data-value={own.value}
      tabIndex={isDisabled() ? -1 : (checked() || !group.value()) ? 0 : -1}
      onClick={select}
      onKeyDown={handleKeyDown}
    >
      <input
        type="radio"
        checked={checked()}
        disabled={isDisabled()}
        name={group.name}
        value={own.value}
        tabIndex={-1}
        aria-hidden="true"
        style="position:absolute;opacity:0;width:0;height:0;pointer-events:none"
        onChange={(e: Event) => {
          e.stopPropagation()
          select()
        }}
      />
      {own.children}
    </label>
  )
}
