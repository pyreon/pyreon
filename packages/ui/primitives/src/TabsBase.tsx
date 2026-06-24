import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, createUniqueId, provide, splitProps, useContext } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { navigateByRole } from './keyboard'

// ─── Tabs Context ────────────────────────────────────────────────────────────

interface TabsCtx {
  value: () => string
  onChange: (value: string) => void
  /**
   * Per-`<TabsBase>` id prefix, used to wire the WAI-ARIA tab↔panel
   * relationship (`aria-controls` / `aria-labelledby`). Generated once via
   * `createUniqueId()` so two `<TabsBase>` instances on a page never collide.
   */
  baseId: string
}

const TabsContext = createContext<TabsCtx>({
  value: () => '',
  onChange: () => {},
  baseId: '',
})

export const useTabs = () => useContext(TabsContext)

/** Deterministic ids shared by a tab and its panel (same `baseId` + value). */
const tabIdFor = (baseId: string, value: string): string => `${baseId}-tab-${value}`
const panelIdFor = (baseId: string, value: string): string => `${baseId}-panel-${value}`

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

  const [value, setValue] = useControllableState({
    value: () => own.value,
    defaultValue: own.defaultValue ?? '',
    onChange: own.onChange,
  })

  const baseId = createUniqueId()
  provide(TabsContext, { value, onChange: setValue, baseId })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
    >
      {own.children}
    </div>
  )
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
  const tabId = tabIdFor(tabs.baseId, own.value)
  const panelId = panelIdFor(tabs.baseId, own.value)

  const handleKeyDown = (e: KeyboardEvent) => {
    const value = navigateByRole(e, {
      containerSelector: '[role="tablist"]',
      itemSelector: '[role="tab"]',
      keys: 'horizontal',
    })
    if (value) tabs.onChange(value)
  }

  return (
    <button
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      type="button"
      role="tab"
      id={tabId}
      aria-controls={panelId}
      aria-selected={isActive() ? 'true' : 'false'}
      aria-disabled={own.disabled ? 'true' : undefined}
      data-active={isActive() || undefined}
      data-value={own.value}
      tabIndex={isActive() ? 0 : -1}
      onClick={() => {
        if (!own.disabled) tabs.onChange(own.value)
      }}
      onKeyDown={handleKeyDown}
    >
      {own.children}
    </button>
  )
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

  return (() => {
    if (!isActive()) return null

    return (
      <div
        {...(rest as Record<string, unknown>)}
        ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
        role="tabpanel"
        id={panelIdFor(tabs.baseId, own.value)}
        aria-labelledby={tabIdFor(tabs.baseId, own.value)}
      >
        {own.children}
      </div>
    )
  })
}
