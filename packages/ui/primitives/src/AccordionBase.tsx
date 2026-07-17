import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createContext, createUniqueId, provide, splitProps, useContext } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { navigateByRole } from './keyboard'

// ─── Value normalization ─────────────────────────────────────────────────────

/**
 * Read either accepted value shape (`string` | `string[]`) as a list of
 * expanded values. Liberal on READ so a consumer can pass `value="a"` to a
 * `multiple` accordion (or `value={['a']}` to a single one) without breaking;
 * the WRITE side is canonical and keyed on `multiple` (see `toggle`), mirroring
 * ComboboxBase/TreeBase. `''` is the single-mode "nothing expanded" sentinel,
 * so it must normalize to `[]` — not `['']`.
 */
const toList = (value: string | string[] | undefined): string[] =>
  Array.isArray(value) ? value : value ? [value] : []

// ─── Accordion Context ───────────────────────────────────────────────────────

interface AccordionCtx {
  /** Whether the item identified by `value` is currently expanded. */
  isExpanded: (value: string) => boolean
  /** Toggle `value`, honouring single (default) vs `multiple` semantics. */
  toggle: (value: string) => void
}

const AccordionContext = createContext<AccordionCtx>({
  isExpanded: () => false,
  toggle: () => {},
})

export const useAccordion = (): AccordionCtx => useContext(AccordionContext)

interface AccordionItemCtx {
  /** The item's identity value, as passed to `<AccordionItemBase value>`. */
  value: string
  /** Stable id for the item's trigger — the `aria-labelledby` target. */
  triggerId: string
  /** Stable id for the item's content region — the `aria-controls` target. */
  contentId: string
}

const AccordionItemContext = createContext<AccordionItemCtx>({
  value: '',
  triggerId: '',
  contentId: '',
})

export const useAccordionItem = (): AccordionItemCtx => useContext(AccordionItemContext)

// ─── AccordionBase ───────────────────────────────────────────────────────────

export interface AccordionBaseProps {
  /**
   * Expanded item value(s). Controlled. Accepts a bare `string` or a
   * `string[]` in either mode — see `toList`.
   */
  value?: string | string[]
  /** Uncontrolled initial value. Defaults to `[]` when `multiple`, else `''`. */
  defaultValue?: string | string[]
  /**
   * Fired with the NEXT expanded value. The emitted shape is keyed on
   * `multiple`: a `string[]` when `multiple`, else a `string` (`''` = all
   * collapsed) — conservative on write, regardless of the shape passed in.
   */
  onChange?: (value: string | string[]) => void
  /** Allow multiple panels open at once. Default `false` (single). */
  multiple?: boolean
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * Headless WAI-ARIA Accordion (APG "Accordion" pattern).
 *
 * Renders a plain container carrying `data-accordion` — the anchor
 * `AccordionTriggerBase`'s arrow-key navigation scopes to. The pattern
 * deliberately has NO container role: an accordion header is a plain
 * `<button>`, so there is no `role="accordion"` / `role="accordionheader"` to
 * emit (inventing one would be worse than none).
 */
export const AccordionBase: ComponentFn<AccordionBaseProps> = (props) => {
  const [own, rest] = splitProps(props, [
    'value',
    'defaultValue',
    'onChange',
    'multiple',
    'children',
    'ref',
  ])

  const [value, setValue] = useControllableState<string | string[]>({
    value: () => own.value,
    defaultValue: own.defaultValue ?? (own.multiple ? [] : ''),
    onChange: own.onChange,
  })

  const isExpanded = (v: string): boolean => toList(value()).includes(v)

  const toggle = (v: string): void => {
    const current = toList(value())
    const open = current.includes(v)
    if (own.multiple) {
      // Independent: add/remove this item, leaving siblings untouched.
      setValue(open ? current.filter((x) => x !== v) : [...current, v])
    } else {
      // Single: expanding an item implicitly collapses every other one, since
      // the whole value IS the one expanded item. Re-toggling collapses to ''.
      setValue(open ? '' : v)
    }
  }

  provide(AccordionContext, { isExpanded, toggle })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      data-accordion=""
    >
      {own.children}
    </div>
  )
}

// ─── AccordionItemBase ───────────────────────────────────────────────────────

export interface AccordionItemBaseProps {
  /** Identity of this item — matched against the accordion's value. */
  value: string
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * One accordion section. Owns the trigger↔content id pair (generated ONCE per
 * instance via `createUniqueId`, so two accordions on a page never collide) and
 * provides it to its trigger/content children.
 */
export const AccordionItemBase: ComponentFn<AccordionItemBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['value', 'children', 'ref'])
  const accordion = useAccordion()

  const baseId = createUniqueId()

  // `value` rides a GETTER rather than an eager read: a compiler-emitted
  // reactive prop (`<AccordionItemBase value={sig()}>`) would otherwise freeze
  // at setup and the item would answer for a stale identity forever. The ids
  // derive from `baseId` (not the value), so they stay stable across a change.
  provide(AccordionItemContext, {
    get value() {
      return own.value
    },
    triggerId: `${baseId}-trigger`,
    contentId: `${baseId}-content`,
  })

  return (
    <div
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      data-value={own.value}
      data-expanded={() => accordion.isExpanded(own.value) || undefined}
    >
      {own.children}
    </div>
  )
}

// ─── AccordionTriggerBase ────────────────────────────────────────────────────

export interface AccordionTriggerBaseProps {
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * The accordion header button. `aria-expanded` reflects the item's state and
 * `aria-controls` points at the content region's id.
 *
 * `aria-expanded` is emitted as an ACCESSOR (`() => 'true' | 'false'`) — the
 * canonical Pyreon reactive-attribute form. This is load-bearing: it stays live
 * on BOTH the `h()` path (`applyProp` renderEffect-wraps a function value) and
 * the compiled template path (`_setAttr` resolves the callable inside the
 * `_bind` frame), so the state transition is real regardless of which transform
 * compiled the call site. A plain `aria-expanded={isExpanded() ? …}` would be
 * snapshotted at mount under a non-reactive transform and never flip. The value
 * is the literal STRING 'true'/'false' — a boolean renders presence-only
 * `aria-expanded=""`, which AT does not read as true.
 */
export const AccordionTriggerBase: ComponentFn<AccordionTriggerBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'ref'])
  const accordion = useAccordion()
  const item = useAccordionItem()

  const handleKeyDown = (e: KeyboardEvent): void => {
    // ArrowUp/ArrowDown + Home/End MOVE FOCUS between headers. The APG
    // accordion pattern does NOT activate on focus (unlike tabs/radios), so the
    // navigated value is deliberately DISCARDED — moving focus must not expand.
    // Enter/Space need no wiring: a native <button> already fires `click` for
    // both, which routes through onClick → toggle.
    navigateByRole(e, {
      containerSelector: '[data-accordion]',
      itemSelector: '[data-accordion-trigger]',
      keys: 'vertical',
    })
  }

  return (
    <button
      {...(rest as Record<string, unknown>)}
      ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
      // A bare <button> inside a <form> defaults to type="submit" and would
      // submit the form on every toggle.
      type="button"
      id={item.triggerId}
      aria-expanded={() => (accordion.isExpanded(item.value) ? 'true' : 'false')}
      aria-controls={item.contentId}
      data-accordion-trigger=""
      data-value={item.value}
      onClick={() => accordion.toggle(item.value)}
      onKeyDown={handleKeyDown}
    >
      {own.children}
    </button>
  )
}

// ─── AccordionContentBase ────────────────────────────────────────────────────

export interface AccordionContentBaseProps {
  children?: VNodeChild
  ref?: (el: HTMLElement | null) => void
  [key: string]: unknown
}

/**
 * The collapsible panel. Rendered only while its item is expanded.
 *
 * Returns an ACCESSOR, not an early `if (!expanded) return null` — components
 * run ONCE, so a top-level early return would pin the panel to its initial
 * state forever. The accessor re-runs on every expanded-state change.
 */
export const AccordionContentBase: ComponentFn<AccordionContentBaseProps> = (props) => {
  const [own, rest] = splitProps(props, ['children', 'ref'])
  const accordion = useAccordion()
  const item = useAccordionItem()

  return (() => {
    if (!accordion.isExpanded(item.value)) return null

    return (
      <div
        {...(rest as Record<string, unknown>)}
        ref={own.ref as ((el: HTMLElement | null) => void) | undefined}
        role="region"
        id={item.contentId}
        aria-labelledby={item.triggerId}
      >
        {own.children}
      </div>
    )
  })
}
