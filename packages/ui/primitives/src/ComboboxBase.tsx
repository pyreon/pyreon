import type { ComponentFn, VNodeChild } from '@pyreon/core'
import { createUniqueId, splitProps } from '@pyreon/core'
import { useControllableState } from '@pyreon/hooks'
import { computed, signal } from '@pyreon/reactivity'

export interface ComboboxOption {
  value: string
  label: string
  disabled?: boolean
}

export interface ComboboxBaseProps {
  /** Selected value(s). */
  value?: string | string[]
  /** Default value (uncontrolled). */
  defaultValue?: string | string[]
  /** Called when selection changes. */
  onChange?: (value: string | string[]) => void
  /** Available options. */
  options: ComboboxOption[]
  /** Enable multi-select. */
  multiple?: boolean
  /** Placeholder when no value selected. */
  placeholder?: string
  /** Whether the combobox is disabled. */
  disabled?: boolean
  /** Render function. */
  children?: (state: ComboboxState) => VNodeChild
  [key: string]: unknown
}

export interface ComboboxState {
  /** Current search query. */
  query: () => string
  /** Set search query. */
  setQuery: (q: string) => void
  /** Whether dropdown is open. */
  isOpen: () => boolean
  /** Open dropdown. */
  open: () => void
  /** Close dropdown. */
  close: () => void
  /** Toggle dropdown. */
  toggle: () => void
  /** Filtered options based on query. */
  filtered: () => ComboboxOption[]
  /** Index of highlighted option. */
  highlightedIndex: () => number
  /** Selected value(s). */
  selected: () => string | string[]
  /** Select an option. */
  select: (value: string) => void
  /** Remove a selected value (multi-select). */
  remove: (value: string) => void
  /** Clear selection. */
  clear: () => void
  /** Handle keyboard navigation. */
  onKeyDown: (e: KeyboardEvent) => void
  /** Get label for a value. */
  getLabel: (value: string) => string
  /** Check if a value is selected. */
  isSelected: (value: string) => boolean
  /** Props to spread on the input element. */
  inputProps: () => Record<string, unknown>
  /** Props to spread on the listbox container. */
  listboxProps: () => Record<string, unknown>
  /** Get props for an individual option. */
  getOptionProps: (value: string, index: number) => Record<string, unknown>
}

export const ComboboxBase: ComponentFn<ComboboxBaseProps> = (props) => {
  const [own] = splitProps(props, [
    'value', 'defaultValue', 'onChange', 'options', 'multiple',
    'placeholder', 'disabled', 'children',
  ])

  const [selected, setSelected] = useControllableState<string | string[]>({
    value: own.value,
    defaultValue: own.defaultValue ?? (own.multiple ? [] : ''),
    onChange: own.onChange,
  })

  const baseId = createUniqueId()
  const listboxId = `${baseId}-listbox`

  const query = signal('')
  const isOpen = signal(false)
  const highlightedIndex = signal(0)

  const filtered = computed(() => {
    const q = query().toLowerCase()
    if (!q) return own.options
    return own.options.filter((o) => o.label.toLowerCase().includes(q))
  })

  function select(value: string) {
    if (own.disabled) return
    const opt = own.options.find((o) => o.value === value)
    if (opt?.disabled) return

    if (own.multiple) {
      const current = Array.isArray(selected()) ? selected() as string[] : []
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      setSelected(next)
    } else {
      setSelected(value)
      isOpen.set(false)
      query.set(opt?.label ?? value)
    }
  }

  function remove(value: string) {
    if (!own.multiple) return
    const current = Array.isArray(selected()) ? selected() as string[] : []
    const next = current.filter((v) => v !== value)
    setSelected(next)
  }

  function clear() {
    const empty: string | string[] = own.multiple ? [] : ''
    setSelected(empty)
    query.set('')
  }

  function getLabel(value: string): string {
    return own.options.find((o) => o.value === value)?.label ?? value
  }

  function isSelectedFn(value: string): boolean {
    const sel = selected()
    return Array.isArray(sel) ? sel.includes(value) : sel === value
  }

  function onKeyDown(e: KeyboardEvent) {
    const opts = filtered()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isOpen()) { isOpen.set(true); return }
      highlightedIndex.set(Math.min(highlightedIndex() + 1, opts.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlightedIndex.set(Math.max(highlightedIndex() - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = opts[highlightedIndex()]
      if (opt && isOpen()) select(opt.value)
      else isOpen.set(true)
    } else if (e.key === 'Escape') {
      isOpen.set(false)
      query.set('')
    } else if (e.key === 'Tab') {
      if (isOpen()) isOpen.set(false)
    }
  }

  function getActiveDescendantId(): string | undefined {
    if (!isOpen()) return undefined
    const opts = filtered()
    const opt = opts[highlightedIndex()]
    if (!opt) return undefined
    return `${baseId}-option-${highlightedIndex()}`
  }

  const state: ComboboxState = {
    query,
    setQuery: (q) => { query.set(q); highlightedIndex.set(0); if (!isOpen()) isOpen.set(true) },
    isOpen,
    open: () => isOpen.set(true),
    close: () => { isOpen.set(false); query.set('') },
    toggle: () => isOpen.set(!isOpen()),
    filtered,
    highlightedIndex,
    selected,
    select,
    remove,
    clear,
    onKeyDown,
    getLabel,
    isSelected: isSelectedFn,
    inputProps: () => ({
      role: 'combobox',
      'aria-expanded': isOpen(),
      'aria-controls': listboxId,
      'aria-activedescendant': getActiveDescendantId(),
      'aria-autocomplete': 'list' as const,
    }),
    listboxProps: () => ({
      role: 'listbox',
      id: listboxId,
    }),
    getOptionProps: (value: string, index: number) => ({
      role: 'option',
      id: `${baseId}-option-${index}`,
      'aria-selected': isSelectedFn(value),
      'aria-disabled': own.options.find((o) => o.value === value)?.disabled || undefined,
    }),
  }

  if (typeof own.children === 'function') {
    return (own.children as (state: ComboboxState) => VNodeChild)(state)
  }
  return null
}
