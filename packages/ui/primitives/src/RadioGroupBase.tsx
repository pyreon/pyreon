import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, onUnmount, provide, splitProps, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useControllableState } from '@pyreon/hooks'
import { navigateByRole } from './keyboard'

// ─── Radio Group Context ─────────────────────────────────────────────────────

interface RadioGroupCtx {
  value: () => string
  onChange: (value: string) => void
  name: string | undefined
  disabled: boolean | undefined
  /**
   * Roving-tabindex registration (mount order = DOM order). APG requires
   * EXACTLY ONE tab stop in a radiogroup: the CHECKED radio, or — when
   * nothing is checked — the FIRST enabled radio. The previous shape
   * (`checked() || !group.value()` → 0) put EVERY enabled radio in the tab
   * order for an unchecked group, so Tab walked the whole group instead of
   * entering once and arrow-navigating.
   */
  registerRadio: (value: string, isDisabled: () => boolean) => () => void
  /** First registered ENABLED radio's value (fallback tab stop), or null. */
  firstEnabledRadio: () => string | null
  /** True when the current `value` matches a registered radio. */
  hasCheckedRadio: () => boolean
}

const RadioGroupContext = createContext<RadioGroupCtx>({
  value: () => '',
  onChange: () => {},
  name: undefined,
  disabled: undefined,
  registerRadio: () => () => {},
  firstEnabledRadio: () => null,
  hasCheckedRadio: () => false,
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

  // Mount-ordered radio registry backing the roving-tabindex fallback (see
  // RadioGroupCtx docs). Copy-on-write array in a signal so the fallback
  // reads are reactive to radios mounting/unmounting.
  const radios = signal<{ value: string; isDisabled: () => boolean }[]>([])

  provide(RadioGroupContext, {
    value,
    onChange: setValue,
    name: own.name,
    disabled: own.disabled,
    registerRadio: (radioValue, isDisabled) => {
      const entry = { value: radioValue, isDisabled }
      radios.set([...radios.peek(), entry])
      return () => {
        radios.set(radios.peek().filter((r) => r !== entry))
      }
    },
    firstEnabledRadio: () => radios().find((r) => !r.isDisabled())?.value ?? null,
    hasCheckedRadio: () => {
      const v = value()
      return v !== '' && radios().some((r) => r.value === v)
    },
  })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      role="radiogroup"
      aria-invalid={own['aria-invalid'] ? 'true' : undefined}
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

  // Roving-tabindex registration: mount order = DOM order (see RadioGroupCtx docs).
  const unregister = group.registerRadio(own.value, () => Boolean(own.disabled || group.disabled))
  onUnmount(unregister)

  const select = () => {
    if (isDisabled()) return
    group.onChange(own.value)
  }

  // APG roving tabindex: the checked radio is THE tab stop; when nothing is
  // checked, only the FIRST enabled radio takes it. ACCESSOR-valued so it
  // stays live through spreads and under the plain-JSX test transform.
  const tabIndexFor = () => {
    if (isDisabled()) return -1
    if (checked()) return 0
    return !group.hasCheckedRadio() && group.firstEnabledRadio() === own.value ? 0 : -1
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
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      role="radio"
      aria-checked={checked() ? 'true' : 'false'}
      aria-disabled={isDisabled() ? 'true' : undefined}
      data-checked={checked() || undefined}
      data-disabled={isDisabled() || undefined}
      data-value={own.value}
      tabIndex={tabIndexFor}
      onClick={(e: MouseEvent) => {
        // See CheckboxBase: a <label> forwards its click to the wrapped
        // <input> as a default action, so without preventDefault the forwarded
        // input click fires the input's onChange (select) AND bubbles back to
        // this onClick (select) — onChange firing 2-3× per click. The value is
        // idempotent (always own.value) so the net STATE is correct, but the
        // duplicate onChange calls are a real defect for any subscriber.
        e.preventDefault()
        select()
      }}
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
