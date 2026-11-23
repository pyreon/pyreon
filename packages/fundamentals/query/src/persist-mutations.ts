import type { MutationStatus } from '@tanstack/query-core'
import type {
  PersistedClient,
  PersistedQueryClientRestoreOptions,
  PersistedQueryClientSaveOptions,
  Persister,
  PersistQueryClientOptions,
} from '@tanstack/query-persist-client-core'
import {
  persistQueryClient as tanstackPersistQueryClient,
  persistQueryClientRestore as tanstackPersistQueryClientRestore,
  persistQueryClientSave as tanstackPersistQueryClientSave,
  persistQueryClientSubscribe as tanstackPersistQueryClientSubscribe,
} from '@tanstack/query-persist-client-core'

// ─── The persisted-mutation contract ──────────────────────────────────────────
//
// A mutation leaves persisted storage only once it has SETTLED (succeeded or
// failed) or been removed from the cache. Until then it is persisted, whether
// it is paused or in flight.
//
// TanStack's default (`defaultShouldDehydrateMutation`) persists a mutation
// only while `isPaused`. Every resume clears `isPaused` before the request
// settles, so the persister's next write drops the mutation, and a page that
// dies in that window (a tab closed mid-request, a resume fired by teardown)
// loses it for good. The window is not one write: it is the whole time a
// request is in flight.
//
// The contract has two halves, and both are needed:
// 1. dehydrate every `pending` mutation, paused or not;
// 2. on restore, mark a restored `pending` mutation as paused. Nothing in the
//    new page is running it (its retryer died with the old page), and query-
//    core only resumes mutations that are paused (`resumePausedMutations`), so
//    without this an in-flight mutation would be restored and never sent.
//
// Delivery becomes AT-LEAST-ONCE: a request the server received but whose
// response never reached the dying page is sent again. Endpoints should be
// idempotent (send a client-generated id with the variables).

/**
 * The `shouldDehydrateMutation` that `@pyreon/query/persist` uses by default:
 * persist every mutation that has not settled yet (`status === 'pending'`),
 * paused or in flight. Pass your own `dehydrateOptions.shouldDehydrateMutation`
 * to override it.
 */
export function shouldPersistMutation(mutation: {
  readonly state: { readonly status: MutationStatus }
}): boolean {
  return mutation.state.status === 'pending'
}

function markRestoredMutationsPaused(
  client: PersistedClient | undefined,
): PersistedClient | undefined {
  if (!client?.clientState?.mutations?.length) return client
  return {
    ...client,
    clientState: {
      ...client.clientState,
      mutations: client.clientState.mutations.map((m) =>
        m.state.status === 'pending' && !m.state.isPaused
          ? { ...m, state: { ...m.state, isPaused: true } }
          : m,
      ),
    },
  }
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as PromiseLike<T> | null)?.then === 'function'
}

function durablePersister(persister: Persister): Persister {
  return {
    persistClient: (client) => persister.persistClient(client),
    removeClient: () => persister.removeClient(),
    restoreClient: () => {
      const restored = persister.restoreClient()
      return isPromiseLike(restored)
        ? Promise.resolve(restored).then(markRestoredMutationsPaused)
        : markRestoredMutationsPaused(restored)
    },
  }
}

type DurableOptions = Partial<Pick<PersistQueryClientOptions, 'dehydrateOptions'>> & {
  persister: Persister
}

function durable<T extends DurableOptions>(
  options: T,
): T & Pick<PersistQueryClientOptions, 'dehydrateOptions'> {
  return {
    ...options,
    persister: durablePersister(options.persister),
    dehydrateOptions: {
      shouldDehydrateMutation: shouldPersistMutation,
      ...options.dehydrateOptions,
    },
  }
}

/**
 * Restores a persisted client and keeps persisting it (TanStack's
 * `persistQueryClient`), with Pyreon's mutation contract: an unsettled
 * mutation stays persisted until it settles, and comes back paused so it is
 * resumed. Returns `[unsubscribe, restorePromise]`.
 */
export function persistQueryClient(
  options: PersistQueryClientOptions,
): [() => void, Promise<void>] {
  return tanstackPersistQueryClient(durable(options))
}

/** TanStack's `persistQueryClientRestore`, restoring unsettled mutations as paused. */
export function persistQueryClientRestore(
  options: PersistedQueryClientRestoreOptions,
): Promise<void> {
  return tanstackPersistQueryClientRestore(durable(options))
}

/** TanStack's `persistQueryClientSave`, persisting every unsettled mutation by default. */
export function persistQueryClientSave(options: PersistedQueryClientSaveOptions): Promise<void> {
  return tanstackPersistQueryClientSave(durable(options))
}

/** TanStack's `persistQueryClientSubscribe`, persisting every unsettled mutation by default. */
export function persistQueryClientSubscribe(options: PersistedQueryClientSaveOptions): () => void {
  return tanstackPersistQueryClientSubscribe(durable(options))
}
