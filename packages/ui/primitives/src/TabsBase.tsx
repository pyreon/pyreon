import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, createUniqueId, onUnmount, provide, splitProps, useContext } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
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
  /**
   * `'horizontal'` (default) or `'vertical'` — drives BOTH the arrow-key axis
   * in `<TabBase>` AND `aria-orientation` on `<TabListBase>` (APG: vertical
   * tablists must advertise their orientation; horizontal is the implicit
   * default).
   */
  orientation: () => 'horizontal' | 'vertical'
  /**
   * Roving-tabindex registration (mount order = DOM order). APG requires
   * EXACTLY ONE tab stop in a tablist: the ACTIVE tab, or — when no tab is
   * active (`value` is `''` or matches no registered tab) — the FIRST enabled
   * tab. Without registration, `tabIndex={isActive() ? 0 : -1}` yields ZERO
   * tab stops for an initially-unselected tabs widget, making it unreachable
   * by keyboard entirely.
   */
  registerTab: (value: string, isDisabled: () => boolean) => () => void
  /** First registered ENABLED tab's value (fallback tab stop), or null. */
  firstEnabledTab: () => string | null
  /** True when the current `value` matches a registered tab. */
  hasActiveTab: () => boolean
}

const TabsContext = createContext<TabsCtx>({
  value: () => '',
  onChange: () => {},
  baseId: '',
  orientation: () => 'horizontal',
  registerTab: () => () => {},
  firstEnabledTab: () => null,
  hasActiveTab: () => false,
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
  /** Arrow-key axis + `aria-orientation` (via `<TabListBase>`). Default `'horizontal'`. */
  orientation?: 'horizontal' | 'vertical'
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

export const TabsBase: ComponentFn<TabsBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'orientation',
    'children',
    'ref',
  ])

  const [value, setValue] = useControllableState({
    value: () => own.value,
    defaultValue: own.defaultValue ?? '',
    onChange: own.onChange,
  })

  const baseId = createUniqueId()

  // Mount-ordered tab registry backing the roving-tabindex fallback. A plain
  // array in a signal (copy-on-write) so `firstEnabledTab`/`hasActiveTab`
  // reads are reactive to tabs mounting/unmounting.
  const tabs = signal<{ value: string; isDisabled: () => boolean }[]>([])

  provide(TabsContext, {
    value,
    onChange: setValue,
    baseId,
    orientation: () => own.orientation ?? 'horizontal',
    registerTab: (tabValue, isDisabled) => {
      const entry = { value: tabValue, isDisabled }
      tabs.set([...tabs.peek(), entry])
      return () => {
        tabs.set(tabs.peek().filter((t) => t !== entry))
      }
    },
    firstEnabledTab: () => tabs().find((t) => !t.isDisabled())?.value ?? null,
    hasActiveTab: () => {
      const v = value()
      return v !== '' && tabs().some((t) => t.value === v)
    },
  })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
    >
      {own.children}
    </div>
  )
}

// ─── TabListBase (the role="tablist" strip) ──────────────────────────────────

export interface TabListBaseProps {
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * The WAI-ARIA `role="tablist"` container. Wrap your `<TabBase>` triggers in
 * it (panels stay OUTSIDE — APG: a tablist contains only tabs). It also
 * scopes `<TabBase>`'s arrow-key navigation (`navigateByRole` walks
 * `[role="tab"]` within the nearest `[role="tablist"]`) and advertises
 * `aria-orientation="vertical"` when the parent `<TabsBase orientation>`
 * says so (horizontal is the ARIA default and is left implicit).
 *
 * Give it an accessible name via `aria-label` / `aria-labelledby` when the
 * page has more than one tablist.
 */
export const TabListBase: ComponentFn<TabListBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'ref'])
  const tabs = useTabs()

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      role="tablist"
      aria-orientation={tabs.orientation() === 'vertical' ? 'vertical' : undefined}
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

  // Roving-tabindex registration: mount order = DOM order (see TabsCtx docs).
  const unregister = tabs.registerTab(own.value, () => own.disabled ?? false)
  onUnmount(unregister)

  const handleKeyDown = (e: KeyboardEvent) => {
    const value = navigateByRole(e, {
      containerSelector: '[role="tablist"]',
      itemSelector: '[role="tab"]',
      keys: tabs.orientation() === 'vertical' ? 'vertical' : 'horizontal',
    })
    if (value) tabs.onChange(value)
  }

  // APG roving tabindex: the active tab is THE tab stop; when nothing is
  // active, the first enabled tab takes it (else the tablist is keyboard-
  // unreachable). ACCESSOR-valued so it stays live through spreads and under
  // the plain-JSX test transform (see the "accessors beat getters" rule).
  const tabIndexFor = () => {
    if (own.disabled) return -1
    if (isActive()) return 0
    return !tabs.hasActiveTab() && tabs.firstEnabledTab() === own.value ? 0 : -1
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
      tabIndex={tabIndexFor}
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
