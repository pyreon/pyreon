import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, provide, splitProps, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

// ─── Tabs Context ────────────────────────────────────────────────────────────

interface TabsCtx {
  value: () => string
  onChange: (value: string) => void
}

const TabsContext = createContext<TabsCtx>({
  value: () => '',
  onChange: () => {},
})

export const useTabs = () => useContext(TabsContext)

// ─── TabsBase ────────────────────────────────────────────────────────────────

export interface TabsBaseProps {
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

export const TabsBase: ComponentFn<TabsBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['value', 'defaultValue', 'onChange', 'children', 'ref'])

  const isControlled = own.value !== undefined
  const internal = signal(own.defaultValue ?? '')
  const value = () => (isControlled ? own.value! : internal())

  const onChange = (v: string) => {
    if (!isControlled) internal.set(v)
    own.onChange?.(v)
  }

  provide(TabsContext, { value, onChange })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
    >
      {own.children}
    </div>
  ) as unknown as VNodeChild
}

// ─── TabBase (single tab trigger) ────────────────────────────────────────────

export interface TabBaseProps {
  value: string
  disabled?: boolean
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

export const TabBase: ComponentFn<TabBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['value', 'disabled', 'children', 'ref'])
  const tabs = useTabs()

  const isActive = () => tabs.value() === own.value

  return (
    <button
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      type="button"
      role="tab"
      aria-selected={isActive()}
      aria-disabled={own.disabled || undefined}
      data-active={isActive() || undefined}
      tabIndex={isActive() ? 0 : -1}
      onClick={() => {
        if (!own.disabled) tabs.onChange(own.value)
      }}
    >
      {own.children}
    </button>
  ) as unknown as VNodeChild
}

// ─── TabPanelBase ────────────────────────────────────────────────────────────

export interface TabPanelBaseProps {
  value: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

export const TabPanelBase: ComponentFn<TabPanelBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['value', 'children', 'ref'])
  const tabs = useTabs()

  const isActive = () => tabs.value() === own.value

  if (!isActive()) return null

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement) => void) | undefined}
      role="tabpanel"
    >
      {own.children}
    </div>
  ) as unknown as VNodeChild
}
