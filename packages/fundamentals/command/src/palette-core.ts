import { signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { resolveText } from './entry'
import type { PaletteMessages, PaletteOptions } from './palette-types'
import { createSource } from './source'
import type { Source } from './source'
import type { Command, Commands } from './types'

/** One level of nested pages: the command that opened it, and the query that was typed above it. */
export interface PageFrame {
  id: string
  command: Command
  parentQuery: string
  /** The command is not in the registry (it came from an async source): the page keeps its own copy. */
  external?: boolean
}

const DEFAULT_MESSAGES: PaletteMessages = {
  label: 'Command palette',
  placeholder: 'Type a command or search…',
  results: (count) => (count === 1 ? '1 result' : `${count} results`),
  noResults: 'No results',
  loading: 'Loading…',
  failed: (error) => `Failed: ${error instanceof Error ? error.message : String(error)}`,
  unavailable: (title, reason) => (reason === undefined ? `${title}, unavailable` : `${title}, unavailable: ${reason}`),
  recent: 'Recent',
  back: 'Back',
  close: 'Close',
}

let counter = 0

/** Everything the parts of a palette share. Plain data and signals: the functions in the other files work on it. */
export interface PaletteCore {
  readonly options: PaletteOptions
  readonly commands: Commands
  readonly messages: PaletteMessages
  readonly open: Signal<boolean>
  readonly query: Signal<string>
  readonly frames: Signal<readonly PageFrame[]>
  readonly active: Signal<string | null>
  readonly running: Signal<string | null>
  readonly runError: Signal<unknown>
  readonly source: Source
  readonly ids: { base: string; input: string; list: string }
  /** Bumped at every open and close: work that outlives its session checks it. */
  session: number
  /** Aborts the run in progress when the palette closes. */
  runController: AbortController | null
  /** What had focus when the palette opened. */
  opener: Element | null
  disposed: boolean
}

export function resolvedText(option: PaletteOptions['placeholder'], fallback: string): string {
  return resolveText(option) ?? fallback
}

export function createCore(options: PaletteOptions, commands: Commands): PaletteCore {
  const base = `pyreon-cmd-${++counter}`

  return {
    options,
    commands,
    messages: { ...DEFAULT_MESSAGES, ...options.messages },
    open: signal(false),
    query: signal(''),
    frames: signal<readonly PageFrame[]>([]),
    active: signal<string | null>(null),
    running: signal<string | null>(null),
    runError: signal<unknown>(undefined),
    source: createSource(options.debounce ?? 150),
    ids: { base, input: `${base}-input`, list: `${base}-list` },
    session: 0,
    runController: null,
    opener: null,
    disposed: false,
  }
}
