import { untracked } from './entry'
import type { PaletteCore } from './palette-core'
import { resolvedText } from './palette-core'
import type { Results } from './palette-results'
import type { PaletteMove, Props, ResultGroup, ResultItem } from './palette-types'

/** What the keyboard and the pointer can ask of the palette. */
export interface PaletteActions {
  move(move: PaletteMove): void
  runActive(): Promise<void>
  runItem(item: ResultItem): Promise<void>
  back(): boolean
  close(): void
  setQuery(query: string): void
  setActive(id: string): void
}

const KEY_MOVES: Readonly<Record<string, PaletteMove>> = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' }

const optionId = (core: PaletteCore, item: ResultItem): string => `${core.ids.base}-opt-${item.index}`

/** The keyboard of the input: Up and Down, Home and End, PageUp and PageDown, Enter, Escape (back, then close), Backspace on an empty query. */
function onKeyDown(core: PaletteCore, results: Results, actions: PaletteActions, event: KeyboardEvent): void {
  // A key that confirms an IME composition must not run a command.
  if (event.isComposing || event.keyCode === 229) return
  const stop = (): void => {
    event.preventDefault()
    event.stopPropagation()
  }
  const move = event.altKey || event.ctrlKey || event.metaKey ? undefined : KEY_MOVES[event.key]
  if (move !== undefined) {
    stop()
    actions.move(move)
  } else if (event.key === 'PageDown' || event.key === 'PageUp') {
    stop()
    actions.move((event.key === 'PageDown' ? 1 : -1) * (core.options.pageSize ?? 8))
  } else if (event.key === 'Enter') {
    stop()
    void actions.runActive()
  } else if (event.key === 'Escape') {
    stop()
    if (!actions.back()) actions.close()
  } else if (event.key === 'Backspace' && core.query.peek() === '' && untracked(results.pages).length > 0) {
    stop()
    actions.back()
  }
}

export function createInputProps(core: PaletteCore, results: Results, actions: PaletteActions, label: () => string, placeholder: () => string): Props {
  const activeItem = (): ResultItem | undefined => results.items().find((item) => item.id === core.active())

  return {
    id: core.ids.input,
    role: 'combobox',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    enterKeyHint: 'go',
    'aria-autocomplete': 'list',
    'aria-controls': core.ids.list,
    'aria-expanded': () => (results.items().length > 0 ? 'true' : 'false'),
    'aria-activedescendant': () => {
      const item = activeItem()

      return item === undefined ? undefined : optionId(core, item)
    },
    'aria-label': label,
    'aria-busy': () => (core.source.loading() || core.inline.loading() || core.running() !== null ? 'true' : undefined),
    placeholder,
    value: () => core.query(),
    onInput: (event: Event) => actions.setQuery((event.target as HTMLInputElement).value),
    onKeyDown: (event: KeyboardEvent) => onKeyDown(core, results, actions, event),
  }
}

export function createListProps(core: PaletteCore, label: () => string): Props {
  return { id: core.ids.list, role: 'listbox', 'aria-label': label, tabIndex: -1 }
}

export function createItemProps(core: PaletteCore, results: Results, actions: PaletteActions, item: ResultItem): Props {
  const total = (): number => results.items().length

  return {
    id: optionId(core, item),
    role: 'option',
    tabIndex: -1,
    'aria-selected': () => (core.active() === item.id ? 'true' : 'false'),
    'aria-disabled': item.enabled ? undefined : 'true',
    'aria-setsize': total,
    'aria-posinset': item.index + 1,
    'data-active': () => (core.active() === item.id ? '' : undefined),
    'data-disabled': item.enabled ? undefined : '',
    'data-recent': item.recent ? '' : undefined,
    'data-page': item.hasPage ? '' : undefined,
    'data-running': () => (core.running() === item.id ? '' : undefined),
    // Pressing a row must not take focus from the input: the input owns the keyboard.
    onMouseDown: (event: MouseEvent) => event.preventDefault(),
    onPointerMove: () => {
      if (core.active.peek() !== item.id) actions.setActive(item.id)
    },
    onClick: () => void actions.runItem(item),
  }
}

export function createGroupProps(core: PaletteCore, group: ResultGroup): { group: Props; heading: Props } {
  const headingId = `${core.ids.base}-group-${group.id ?? 'none'}`

  return {
    group: group.title === undefined ? { role: 'group' } : { role: 'group', 'aria-labelledby': headingId },
    heading: { id: headingId, 'aria-hidden': 'true' },
  }
}

export { resolvedText }
