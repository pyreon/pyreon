import { batch, computed, getCurrentScope, isServer, runUntracked } from '@pyreon/reactivity'
import type { Entry } from './entry'
import { createRecents } from './recents'
import { createRunner } from './run'
import { createSearch } from './search'
import { bindShortcuts } from './shortcut-binding'
import { bump, createStore, findCommand, makeEntry, pushEntry, removeEntries, textsEpoch, topList } from './store'
import type { Command, CommandGroup, Commands, CreateCommandsOptions } from './types'

export { isCommandEnabled } from './entry'

type Source = Command | (() => Command)

/** A registry of commands. See `Commands`. */
export function createCommands(options?: CreateCommandsOptions): Commands {
  const store = createStore(options?.groups ?? [])
  const recents = createRecents(options?.recents)
  const warnedConflicts = new Set<string>()
  const find = (id: string): Command | undefined => findCommand(store, id)
  const searcher = createSearch({ version: () => store.version(), topList: () => topList(store), find, groups: () => store.groups(), epoch: () => textsEpoch(store) }, recents)
  const runner = createRunner(find, recents, () => api, options?.onError)
  const topCommands = computed<readonly Command[]>(() => {
    store.version()

    return topList(store).map((entry) => entry.read())
  })

  function addEntries(sources: readonly Source[]): Entry[] {
    const added: Entry[] = []
    const host = { fire: (id: string) => runner.execute(id, { source: 'shortcut' }), report: runner.reportError, warned: warnedConflicts }
    batch(() => {
      for (const source of sources) {
        const entry = makeEntry(store, source)
        pushEntry(store, entry)
        bindShortcuts(entry, typeof source === 'function', entry.read(), host)
        added.push(entry)
      }
      bump(store)
    })

    return added
  }

  function register(input: Source | readonly Command[]): () => void {
    if (isServer || store.disposed) return () => {}
    const sources: Source[] = typeof input === 'function' ? [input] : Array.isArray(input) ? [...(input as readonly Command[])] : [input as Command]
    const added = runUntracked(() => addEntries(sources))
    let done = false
    const unregister = (): void => {
      if (done) return
      done = true
      removeEntries(store, added)
    }
    getCurrentScope()?.add(unregister)

    return unregister
  }

  function registerGroup(group: CommandGroup): () => void {
    if (isServer || store.disposed) return () => {}
    store.groups.set([...store.groups.peek().filter((g) => g.id !== group.id), group])
    let done = false

    return () => {
      if (done) return
      done = true
      if (store.groups.peek().includes(group)) store.groups.set(store.groups.peek().filter((g) => g !== group))
    }
  }

  const api: Commands = {
    register,
    registerGroup,
    commands: () => (isServer ? [] : topCommands()),
    groups: () => store.groups(),
    get: (id) => (isServer ? undefined : find(id)),
    run: (target, runOptions) => runner.execute(target, runOptions),
    search: (query, searchOptions) => searcher.search(query, searchOptions),
    recents: () => recents.ids(),
    clearRecents: () => recents.clear(),
    dispose() {
      if (store.disposed) return
      removeEntries(store, [...store.entries])
      store.disposed = true
      store.epoch?.dispose()
      store.epoch = null
      searcher.clear()
      store.groups.set([])
    },
  }

  return api
}
