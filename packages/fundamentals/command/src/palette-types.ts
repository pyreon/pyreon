import type { MatchRange } from './match'
import type { Command, Commands, Text } from './types'

/** The words a palette says and announces. Every one can be replaced (translated). */
export interface PaletteMessages {
  /** The accessible name of the dialog. */
  label: string
  placeholder: string
  results(count: number): string
  noResults: string
  loading: string
  failed(error: unknown): string
  /** Announced when a command that cannot run is the active one. */
  unavailable(title: string, reason: string | undefined): string
  /** The heading of the recents group. */
  recent: string
  back: string
  close: string
}

export interface PaletteOptions {
  /** The registry to search. Default: `useCommands()` (the provided registry, or the app-wide one). */
  commands?: Commands
  /** Opens and closes the palette. Default `'mod+k'`; `false` registers none. Registered through `@pyreon/hotkeys`. */
  hotkey?: string | false
  placeholder?: Text
  /** The accessible name of the dialog and the combobox. */
  label?: Text
  messages?: Partial<PaletteMessages>
  onOpenChange?: (open: boolean) => void
  /** Replace the matching: the commands that pass are listed in registration order, without ranges. */
  filter?: (command: Command, query: string) => boolean
  /**
   * What an empty query shows: `'recents'` (default) a Recent group, then the groups in declared order; `'groups'` the
   * groups only; `'all'` one flat list in registration order.
   */
  emptyQuery?: 'recents' | 'groups' | 'all'
  /** List disabled commands (with their reason, announced when active) instead of hiding them. Default `false`. */
  showDisabled?: boolean
  /** How long an async source waits after the last keystroke, in ms. Default 150. */
  debounce?: number
  /** How far PageUp and PageDown move. Default 8. */
  pageSize?: number
  /** Return focus to the element that had it when the palette opened. Default `true`. */
  restoreFocus?: boolean
}

/** One row of the list. */
export interface ResultItem {
  /** The command id. Unique in the list. */
  id: string
  command: Command
  title: string
  subtitle: string | undefined
  /** Ranges inside `title` for highlighting (empty without a query). */
  ranges: readonly MatchRange[]
  /** Ranges inside `subtitle`, when the subtitle is what matched. */
  subtitleRanges: readonly MatchRange[]
  group: string | undefined
  enabled: boolean
  disabledReason: string | undefined
  recent: boolean
  /** Selecting it opens a page. */
  hasPage: boolean
  /** The shortcuts of the command as the user reads them on this platform (client only). */
  shortcuts: readonly string[]
  /** Position in the whole list, group headings not counted. */
  index: number
}

export interface ResultGroup {
  /** The group id; `'$recent'` for the recents; `undefined` for commands without a group. */
  id: string | undefined
  /** The heading, absent for commands without a group. */
  title: string | undefined
  items: readonly ResultItem[]
}

export type PaletteStatus = 'idle' | 'loading' | 'error'

export type PaletteMove = number | 'first' | 'last' | 'nextGroup' | 'prevGroup'

/** Spreadable attributes and handlers. Functions are reactive attributes; `on*` are handlers. */
export type Props = Record<string, unknown>

export interface Palette {
  isOpen(): boolean
  /** Open the palette, at a nested page by command id when given. Opening an open palette only navigates. Client only. */
  open(page?: string): void
  close(): void
  toggle(): void
  query(): string
  setQuery(query: string): void
  /** The stack of nested pages, as command ids. Empty at the root. */
  page(): readonly string[]
  /** The title of the page on show (the command that opened it), or `undefined` at the root. */
  pageTitle(): string | undefined
  /** Leave the page on show. Returns `false` at the root. */
  back(): boolean
  /** The rows, grouped and ranked, flat in display order. Async results are included as they arrive. */
  results(): readonly ResultItem[]
  /** The same rows in their groups. */
  groups(): readonly ResultGroup[]
  /** `'loading'` while an async source or a run is pending; `'error'` after one failed. */
  status(): PaletteStatus
  error(): unknown
  /** The id of the command being run, while it runs. */
  running(): string | null
  activeId(): string | null
  setActive(id: string): void
  move(delta: PaletteMove): void
  /** Run the active row: open its page, or run it (and close, unless `keepOpen`). Resolves when done; an error stays on the palette. */
  runActive(): Promise<void>
  /** Run a row (what a click does). */
  runItem(item: ResultItem): Promise<void>
  /** The text of the polite live region: the count, "Loading…", "No results", or why the active command cannot run. */
  announcement(): string
  /** The resolved messages (labels for the default buttons). */
  messages: PaletteMessages
  placeholder(): string
  label(): string
  /** Attributes of the `<input role="combobox">`: the ARIA wiring, the value and the keyboard. */
  inputProps: Props
  /** Attributes of the `role="listbox"` element. */
  listProps: Props
  /** Attributes of a row (`role="option"`). */
  itemProps(item: ResultItem): Props
  /** Attributes of a group (`role="group"`) and of its heading element. */
  groupProps(group: ResultGroup): { group: Props; heading: Props }
  /** The id of the input and of the list, for `aria-labelledby` and labels. */
  ids: { input: string; list: string; option(index: number): string }
  /** Remove the hotkey, abort what is pending and release everything. */
  dispose(): void
}
