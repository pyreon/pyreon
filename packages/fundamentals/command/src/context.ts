import { createContext, provide, useContext } from '@pyreon/core'
import { createCommands } from './commands'
import { detached } from './entry'
import type { Command, Commands } from './types'

const CommandsContext = createContext<Commands | null>(null)

let fallback: Commands | null = null

/** The registry an app uses when it provides none. Created on first use; inert on the server. */
function defaultCommands(): Commands {
  fallback ??= detached(() => createCommands())
  return fallback
}

/** The registry provided by the nearest `provideCommands`, or the app-wide default. */
export function useCommands(): Commands {
  return useContext(CommandsContext) ?? defaultCommands()
}

/** Make `commands` the registry of this component and everything below it. */
export function provideCommands(commands: Commands): void {
  provide(CommandsContext, commands)
}

/**
 * Register a command for the lifetime of the component: when it unmounts the command and its shortcut go away, so the
 * list always matches what is on screen. Pass a function to read signals: its fields update in place and the shortcut
 * is re-registered only when it changed.
 */
export function useCommand(command: Command | (() => Command)): void {
  useCommands().register(command)
}

/** @internal Testing: dispose the app-wide default registry and start the next `useCommands()` with a fresh one. */
export function _resetDefaultCommands(): void {
  fallback?.dispose()
  fallback = null
}
