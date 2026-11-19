import { getHotkeyConflicts, registerHotkey } from '@pyreon/hotkeys'
import { computed, effect, onCleanup, runUntracked } from '@pyreon/reactivity'
import type { Entry } from './entry'
import { isCommandEnabled, warn } from './entry'
import { hasCommandModifier } from './shortcuts'
import type { Command } from './types'

const DESCRIPTION = 'command:'
const MAX_WARNED = 100

export function shortcutsOf(command: Command): string[] {
  const s = command.shortcut
  if (s === undefined) return []
  return (typeof s === 'string' ? [s] : [...s]).filter((x) => typeof x === 'string' && x.trim() !== '')
}

/** Warn (development) when a shortcut of this command is also bound to another command or another hotkey in the same scope. */
function warnConflicts(id: string, warned: Set<string>): void {
  if (process.env.NODE_ENV === 'production') return
  for (const conflict of getHotkeyConflicts()) {
    if (!conflict.descriptions.includes(DESCRIPTION + id)) continue
    const names = conflict.descriptions.map((d, i) => (d?.startsWith(DESCRIPTION) ? `"${d.slice(DESCRIPTION.length)}"` : `another hotkey (${conflict.shortcuts[i]})`))
    const signature = `${conflict.scope}|${names.join(',')}|${conflict.shortcuts.join(',')}`
    if (warned.has(signature)) continue
    if (warned.size >= MAX_WARNED) warned.clear()
    warned.add(signature)
    warn(`commands: ${names.join(' and ')} share the shortcut "${conflict.shortcuts[0]}" in scope "${conflict.scope}", so both run when it is pressed. Give one of them another shortcut or disable it.`)
  }
}

export interface ShortcutHost {
  /** Run a command because its shortcut was pressed; rejects with the command's error. */
  fire(id: string): Promise<void>
  report(error: unknown, command: Command): void
  warned: Set<string>
}

function registerAll(entry: Entry, key: string, host: ShortcutHost): (() => void)[] {
  const unregister: (() => void)[] = []
  for (const shortcut of key.split('\n')) {
    try {
      unregister.push(
        registerHotkey(
          shortcut,
          () => {
            host.fire(entry.id).catch((error: unknown) => host.report(error, entry.read()))
          },
          { enableOnInputs: hasCommandModifier(shortcut), description: DESCRIPTION + entry.id },
        ),
      )
    } catch (error) {
      warn(`commands: the shortcut ${JSON.stringify(shortcut)} of "${entry.id}" could not be registered: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return unregister
}

/**
 * Register the shortcuts of a command through `@pyreon/hotkeys` while it is the entry for its id and is enabled, and only
 * then. The effect depends on one string (the shortcuts joined), so a title or a subtitle that changed does not touch the
 * hotkeys, and a changed shortcut moves them.
 */
export function bindShortcuts(entry: Entry, isGetter: boolean, first: Command, host: ShortcutHost): void {
  if (!isGetter && shortcutsOf(first).length === 0) return
  const wanted = computed(() => {
    if (!entry.top()) return ''
    const command = entry.read()
    const shortcuts = shortcutsOf(command)
    if (shortcuts.length === 0 || !isCommandEnabled(command)) return ''

    return shortcuts.join('\n')
  })
  const registration = effect(() => {
    const key = wanted()
    if (key === '') return
    const unregister = registerAll(entry, key, host)
    runUntracked(() => warnConflicts(entry.id, host.warned))
    onCleanup(() => {
      for (const u of unregister) u()
    })
  })
  entry.disposers.push(
    () => registration.dispose(),
    () => wanted.dispose?.(),
  )
}
