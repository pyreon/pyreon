import { For, Show } from '@pyreon/core'
import { useOnline } from '@pyreon/hooks'
import { QueryClient, useMutation, useQuery } from '@pyreon/query'
import { createSyncStoragePersister, PersistQueryClientProvider } from '@pyreon/query/persist'
import { useInstallPrompt, useServiceWorkerUpdate } from '@pyreon/zero/client'
import { signal } from '@pyreon/reactivity'

/** Rewritten in `dist` by the e2e to simulate a deployed update. */
const VERSION = 'version-one'

const client = new QueryClient()

// A restored (reloaded) mutation finds its function by key: functions do not
// serialise, so the default is registered at module load, before restoration.
client.setMutationDefaults(['add-item'], {
  mutationFn: async (name: string) => {
    const res = await fetch('/api/items', { method: 'POST', body: JSON.stringify({ name }) })
    if (!res.ok) throw new Error(`POST /api/items failed: ${res.status}`)
    return (await res.json()) as { name: string }
  },
  onSuccess: () => client.invalidateQueries({ queryKey: ['items'] }),
})

const noopPersister = {
  persistClient: () => undefined,
  restoreClient: () => undefined,
  removeClient: () => undefined,
}
const persister =
  typeof window === 'undefined'
    ? noopPersister
    : createSyncStoragePersister({ storage: localStorage, throttleTime: 0 })

function Page() {
  const online = useOnline()
  const update = useServiceWorkerUpdate()
  const install = useInstallPrompt()
  const name = signal('')
  const items = useQuery(() => ({
    queryKey: ['items'],
    queryFn: async () => (await (await fetch('/api/items')).json()) as string[],
  }))
  const add = useMutation<{ name: string }, Error, string>({ mutationKey: ['add-item'] })

  return (
    <main>
      <h1 id="page">Home page</h1>
      <p id="version">{VERSION}</p>
      <p id="net">{() => (online() ? 'online' : 'offline')}</p>
      <p id="install">{() => (install.canInstall() ? 'installable' : 'not-installable')}</p>
      <p id="installed">{() => (install.isInstalled() ? 'installed' : 'browser-tab')}</p>
      <Show when={() => update.updateReady()}>
        <button id="reload" onClick={() => update.apply()}>
          New version available. Reload
        </button>
      </Show>
      <input id="name" onInput={(e: Event) => name.set((e.target as HTMLInputElement).value)} />
      <button id="add" onClick={() => add.mutate(name())}>
        Add
      </button>
      <p id="mutation">
        {() => {
          const r = add.result()
          return r.isPaused ? 'paused' : r.status
        }}
      </p>
      <p id="mutation-error">{() => add.error()?.message ?? ''}</p>
      <ul id="items">
        <For each={() => items.data() ?? []} by={(x: string) => x}>
          {(x: string) => <li>{x}</li>}
        </For>
      </ul>
    </main>
  )
}

export default function Home() {
  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: Infinity }}>
      <Page />
    </PersistQueryClientProvider>
  )
}
