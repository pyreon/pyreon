import { runUntracked } from '@pyreon/reactivity'
import { isCommandEnabled, resolveText } from './entry'
import type { Recents } from './recents'
import type { Command, Commands, RunContext, RunOptions } from './types'

export interface Runner {
  execute(target: string | Command, options?: RunOptions): Promise<void>
  reportError(error: unknown, command: Command): void
}

/** Running a command by id or by value: checks it, builds the context, awaits it, remembers it. */
export function createRunner(find: (id: string) => Command | undefined, recents: Recents, commands: () => Commands, onError: ((error: unknown, command: Command) => void) | undefined): Runner {
  function reportError(error: unknown, command: Command): void {
    if (onError !== undefined) {
      onError(error, command)

      return
    }
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.error(`[Pyreon] command "${command.id}" failed`, error)
    }
  }

  async function execute(target: string | Command, options?: RunOptions): Promise<void> {
    const command = typeof target === 'string' ? runUntracked(() => find(target)) : target
    if (command === undefined) {
      throw new Error(`[Pyreon] commands.run: no command with the id "${String(target)}" is registered. It may belong to a screen that is not mounted.`)
    }
    if (!runUntracked(() => isCommandEnabled(command))) {
      const reason = resolveText(command.disabledReason)
      throw new Error(`[Pyreon] commands.run: "${command.id}" is disabled${reason === undefined ? '' : ` (${reason})`}`)
    }
    if (command.run === undefined) return
    const context: RunContext = {
      id: command.id,
      source: options?.source ?? 'programmatic',
      query: options?.query ?? '',
      signal: options?.signal ?? new AbortController().signal,
      commands: commands(),
    }
    await command.run(context)
    recents.mark(command.id)
  }

  return { execute, reportError }
}
