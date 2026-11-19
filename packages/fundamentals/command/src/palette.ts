import { registerHotkey } from '@pyreon/hotkeys'
import { computed, effect, getCurrentScope, isServer } from '@pyreon/reactivity'
import { useCommands } from './context'
import { detached, resolveText, untracked } from './entry'
import { backPage, closePalette, moveActive, openPalette, runRow, setQuery } from './palette-actions'
import type { PaletteActions } from './palette-aria'
import { createGroupProps, createInputProps, createItemProps, createListProps } from './palette-aria'
import type { PaletteCore } from './palette-core'
import { createCore } from './palette-core'
import type { Results } from './palette-results'
import { createResults } from './palette-results'
import type { Palette, PaletteOptions, PaletteStatus } from './palette-types'

const DEFAULT_HOTKEY = 'mod+k'

/** The text of the polite live region: what a screen-reader user needs to hear when the list or the active row changes. */
function announce(core: PaletteCore, results: Results): string {
  if (!core.open() || isServer) return ''
  const error = core.runError() ?? core.source.error() ?? core.inline.error()
  if (error !== undefined) return core.messages.failed(error)
  const items = results.items()
  const active = items.find((item) => item.id === core.active())
  if (active !== undefined && !active.enabled) return core.messages.unavailable(active.title, active.disabledReason)
  if (core.running() !== null) return core.messages.loading
  if (items.length === 0) return core.source.loading() || core.inline.loading() ? core.messages.loading : core.query().trim() === '' && results.pages().length === 0 ? '' : core.messages.noResults

  return core.query().trim() === '' && results.pages().length === 0 ? '' : core.messages.results(items.length)
}

/** Keep one row active: the first, until the user moves, and again when the active one leaves the list. */
function keepActive(core: PaletteCore, results: Results): () => void {
  const watch = effect(() => {
    const items = results.items()
    const current = core.active()
    if (items.length === 0) {
      if (current !== null) core.active.set(null)

      return
    }
    if (current === null || !items.some((item) => item.id === current)) core.active.set((items[0] as { id: string }).id)
  })

  return () => watch.dispose()
}

function bindHotkey(core: PaletteCore, toggle: () => void): (() => void) | null {
  const hotkey = core.options.hotkey === undefined ? DEFAULT_HOTKEY : core.options.hotkey
  if (hotkey === false) return null

  return registerHotkey(hotkey, toggle, { enableOnInputs: true, description: 'command-palette' })
}

function status(core: PaletteCore): PaletteStatus {
  if (core.runError() !== undefined || core.source.error() !== undefined || core.inline.error() !== undefined) return 'error'

  return core.source.loading() || core.inline.loading() || core.running() !== null ? 'loading' : 'idle'
}

/**
 * The state of a command palette, with no markup: open and close, a query, nested pages, the rows (grouped and ranked,
 * with the async ones as they arrive), the active row and the ARIA wiring for a custom renderer. `<CommandPalette>` is a
 * complete renderer built on it. Inert on the server.
 */
export function createPalette(options: PaletteOptions = {}): Palette {
  const core = createCore(options, options.commands ?? useCommands())
  const parts = detached(() => {
    const results = createResults(core)

    return { results, stopActive: keepActive(core, results) }
  })
  const { results } = parts
  const actions: PaletteActions = {
    move: (move) => moveActive(core, results, move),
    runActive: async () => {
      const item = untracked(results.items).find((row) => row.id === core.active.peek())
      if (item !== undefined) await runRow(core, results, item)
    },
    runItem: (item) => runRow(core, results, item),
    back: () => backPage(core, results),
    close: () => closePalette(core),
    setQuery: (query) => setQuery(core, query),
    setActive: (id) => core.active.set(id),
  }
  const label = (): string => resolvedLabel(core)
  const placeholder = (): string => resolveText(options.placeholder) ?? core.messages.placeholder
  const unregisterHotkey = bindHotkey(core, () => (core.open.peek() ? closePalette(core) : openPalette(core, results)))
  const message = computed(() => announce(core, results))

  function dispose(): void {
    if (core.disposed) return
    closePalette(core)
    core.disposed = true
    unregisterHotkey?.()
    results.dispose()
    parts.stopActive()
    message.dispose()
    core.source.reset()
    core.inline.reset()
  }
  getCurrentScope()?.add(dispose)

  return {
    isOpen: () => core.open(),
    open: (page) => openPalette(core, results, page),
    close: () => closePalette(core),
    toggle: () => (core.open.peek() ? closePalette(core) : openPalette(core, results)),
    query: () => core.query(),
    setQuery: actions.setQuery,
    page: () => results.pages().map((p) => p.id),
    pageTitle: () => {
      const top = results.pages().at(-1)

      return top === undefined ? undefined : resolveText(top.command.title)
    },
    back: actions.back,
    results: () => results.items(),
    groups: () => results.groups(),
    status: () => status(core),
    error: () => core.runError() ?? core.source.error() ?? core.inline.error(),
    running: () => core.running(),
    activeId: () => core.active(),
    setActive: actions.setActive,
    move: actions.move,
    runActive: actions.runActive,
    runItem: actions.runItem,
    announcement: () => message(),
    messages: core.messages,
    placeholder,
    label,
    inputProps: createInputProps(core, results, actions, label, placeholder),
    listProps: createListProps(core, label),
    itemProps: (item) => createItemProps(core, results, actions, item),
    groupProps: (group) => createGroupProps(core, group),
    ids: { input: core.ids.input, list: core.ids.list, option: (index) => `${core.ids.base}-opt-${index}` },
    dispose,
  }
}

function resolvedLabel(core: PaletteCore): string {
  return resolveText(core.options.label) ?? core.messages.label
}
