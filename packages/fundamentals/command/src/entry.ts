import { getCurrentScope, runUntracked, setCurrentScope } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import type { Command, CommandGroup, Text } from './types'

/** One registered command: where its fields are read from, and what it holds that must be released. */
export interface Entry {
  readonly id: string
  /** Registration order. */
  readonly seq: number
  readonly read: () => Command
  /** The texts that are matched: the title, the subtitle ('' when absent), then the keywords. */
  readonly texts: () => readonly string[]
  /** `true` while this entry is the one that answers to its id. */
  readonly top: Signal<boolean>
  /** Whether its texts can change (a function title or subtitle, or a function registration). */
  readonly dynamic: boolean
  readonly disposers: (() => void)[]
}

/** What the search needs of the registry. */
export interface Registry {
  version(): number
  topList(): Entry[]
  find(id: string): Command | undefined
  groups(): readonly CommandGroup[]
  ensureWatcher(): void
}

export function warn(message: string): void {
  if (process.env.NODE_ENV === 'production') return
  // oxlint-disable-next-line no-console
  console.warn(`[Pyreon] ${message}`)
}

export function resolveText(text: Text | undefined): string | undefined {
  return typeof text === 'function' ? text() : text
}

export function isCommandEnabled(command: Command): boolean {
  const enabled = command.enabled
  return typeof enabled === 'function' ? enabled() : enabled !== false
}

/**
 * Run `fn` owned by no component. The registry's own machinery (the watcher, and the default registry) is created lazily,
 * from whichever component happens to need it first; owned by that component it would be disposed with it while the
 * registry kept pointing at it.
 */
export function detached<T>(fn: () => T): T {
  const prev = getCurrentScope()
  setCurrentScope(null)
  try {
    return runUntracked(fn)
  } finally {
    setCurrentScope(prev)
  }
}

/** The texts of a command in the order they are matched. */
export function textsOf(command: Command): string[] {
  return [resolveText(command.title) ?? '', resolveText(command.subtitle) ?? '', ...(command.keywords ?? [])]
}
