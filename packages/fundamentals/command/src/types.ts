import type { MatchRange } from './match'

/** A string, or a function that returns one (so a title can follow the locale). */
export type Text = string | (() => string)

/** What a command's `run` receives. */
export interface RunContext {
  /** The id of the command that runs. */
  id: string
  /** What triggered it. */
  source: 'palette' | 'shortcut' | 'programmatic'
  /** The palette query at the time (empty for a shortcut or a programmatic run unless `run` was given one). */
  query: string
  /** Aborted when the run is no longer wanted (the palette was closed while it was pending). */
  signal: AbortSignal
  /** The registry the command belongs to. */
  commands: Commands
}

export interface Command {
  id: string
  /** A function is read reactively (and lazily): switching the locale re-ranks and re-renders. */
  title: Text
  subtitle?: Text
  /** Extra match terms: "delete" for a command titled "Remove". A keyword match ranks below a title match. */
  keywords?: readonly string[]
  /** The id of a declared group (`createCommands({ groups })` or `registerGroup`). */
  group?: string
  /** Passed through to the renderer. */
  icon?: unknown
  /** Hotkeys syntax (`'mod+k'`, `'g d'`), one or several. Registered through `@pyreon/hotkeys` while the command is registered and enabled. */
  shortcut?: string | readonly string[]
  /** `false` hides the command (the palette can show it with its reason). A function is read reactively. */
  enabled?: boolean | (() => boolean)
  disabledReason?: Text
  /** Async: the palette shows the pending state, closes on success and stays open with the error on failure. */
  run?: (context: RunContext) => void | Promise<void>
  /**
   * A nested page (a list) or an async source (a function of the query). A function is called with the query and an
   * AbortSignal that is aborted when a newer query supersedes this one or the palette closes.
   */
  children?: readonly Command[] | ((query: string, signal: AbortSignal) => readonly Command[] | Promise<readonly Command[]>)
  /**
   * For a function `children`: also search this source from the root while the user types. Its rows are listed in a group
   * headed by this command's title, after the matching commands, which stay on screen while it loads. Default: the source is
   * only searched inside its page.
   */
  inline?: boolean
  /** Toggles and the like: running the command does not close the palette. */
  keepOpen?: boolean
  /** Breaks ties between equal scores: higher first. */
  priority?: number
}

export interface CommandGroup {
  id: string
  title: Text
}

/** One search result of the registry. */
export interface Match {
  command: Command
  id: string
  /** The resolved title. */
  title: string
  score: number
  /** Which text matched best; `ranges` are offsets into that text. An empty query has no field to speak of: `'title'`. */
  field: 'title' | 'subtitle' | 'keyword'
  ranges: readonly MatchRange[]
  group: string | undefined
  enabled: boolean
  disabledReason: string | undefined
  /** `true` when the id is among the recents. */
  recent: boolean
}

export interface SearchOptions {
  /** The id of a command whose static `children` are searched (a nested page). */
  parent?: string
  limit?: number
  /** Also return disabled commands (flagged `enabled: false`). Default `false`. */
  includeDisabled?: boolean
}

export interface RecentsStorage {
  get(): string[] | null
  set(ids: string[]): void
}

export interface CreateCommandsOptions {
  recents?: { max?: number; storage?: RecentsStorage }
  groups?: readonly CommandGroup[]
  /** Called when a command run by a shortcut fails. Default: a `[Pyreon]` error on the console (development only). */
  onError?: (error: unknown, command: Command) => void
}

export interface RunOptions {
  /** The query to put in the `RunContext`. */
  query?: string
  signal?: AbortSignal
  source?: RunContext['source']
}

export interface Commands {
  /**
   * Register commands (or a function that returns one: its reads are reactive and the shortcut is only re-registered
   * when it changed). Returns the unregister function. Inside a component the commands are also removed on unmount.
   * Registering an id that is already registered shadows it until the new one is removed.
   */
  register(command: Command | readonly Command[] | (() => Command)): () => void
  /** Declare a group. Returns the function that removes it. */
  registerGroup(group: CommandGroup): () => void
  /** The registered top-level commands, in registration order. Reactive. */
  commands(): readonly Command[]
  groups(): readonly CommandGroup[]
  /** The command with this id (top level, or in a nested page). Reactive. */
  get(id: string): Command | undefined
  /** Run a command by id (or the command itself, for one from a nested page). Rejects when it is unknown, disabled, or throws. */
  run(target: string | Command, options?: RunOptions): Promise<void>
  /** The synchronous part of a search: ranked matches of the registered (or, with `parent`, nested) commands. Reactive. */
  search(query: string, options?: SearchOptions): readonly Match[]
  /** Ids of the commands run most recently, newest first. Reactive. */
  recents(): readonly string[]
  clearRecents(): void
  /** Remove every command and group, and every hotkey and effect they hold. */
  dispose(): void
}
