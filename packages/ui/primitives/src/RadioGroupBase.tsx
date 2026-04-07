import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, provide, splitProps, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

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
    'children',
    'ref',
  ])

  const isControlled = own.value !== undefined
  const internal = signal(own.defaultValue ?? '')
  const value = () => (isControlled ? own.value! : internal())

  const onChange = (v: string) => {
    if (!isControlled) internal.set(v)
    own.onChange?.(v)
  }

  provide(RadioGroupContext, { value, onChange, name: own.name, disabled: own.disabled })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="radiogroup"
    >
      {own.children}
    </div>
  ) as unknown as VNodeChild
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

  return (
    <label
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="radio"
      aria-checked={checked()}
      aria-disabled={isDisabled() || undefined}
      data-checked={checked() || undefined}
      data-disabled={isDisabled() || undefined}
      tabIndex={isDisabled() ? -1 : 0}
      onClick={select}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          select()
        }
      }}
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
  ) as unknown as VNodeChild
}
