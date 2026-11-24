/**
 * @pyreon/command: a command palette for Pyreon. This entry is the registry (commands, shortcuts through
 * `@pyreon/hotkeys`, recents, search); the pure matcher is `@pyreon/command/core`.
 */
import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

registerSingleton(__pkgName, __pkgVersion, import.meta.url)

export * from './core'
export { createCommands, isCommandEnabled } from './commands'
export { _resetDefaultCommands, provideCommands, useCommand, useCommands } from './context'
export { createPalette } from './palette'
export type { Palette, PaletteMessages, PaletteMove, PaletteOptions, PaletteStatus, Props, ResultGroup, ResultItem } from './palette-types'
export { formatShortcut, hasCommandModifier, shortcutKeys } from './shortcuts'
export type { Command, CommandGroup, Commands, CreateCommandsOptions, Match, RecentsStorage, RunContext, RunOptions, SearchOptions, Text } from './types'
