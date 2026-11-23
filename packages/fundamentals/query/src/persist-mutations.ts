import type { DehydratedState, Mutation, MutationKey, QueryClient } from '@tanstack/query-core'
import { dehydrate, hydrate } from '@tanstack/query-core'
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
import { isServer } from '@pyreon/reactivity'

// ─── The persisted-mutation contract ──────────────────────────────────────────
//
// TanStack persists a mutation only while it is PAUSED. Every resume clears
// `isPaused` before the request settles, so a page that dies while a request
// is in flight (a tab closed mid-request, or a resume fired by teardown) loses
// the mutation (#4723).
//
// Pyreon persists a mutation from the moment it is created until it settles,
// paused or in flight, but ONLY a mutation that a later page could send again
// exactly, and it hands a persisted mutation to another page only once the page
// that owns it is gone:
//
// 1. Which mutations: `shouldPersistMutation`. Pending; not opted out with
//    `meta: { persist: false }`; RESUMABLE (a restored copy would run the same
//    function this one runs, which means a `mutationKey` whose function is
//    registered with `setMutationDefaults`, not an inline `mutationFn`); and its
//    variables survive JSON. A keyless `useMutation({ mutationFn: login })` is
//    never written to storage, so its `{ password }` never is either.
// 2. Ownership: each persisted mutation holds a Web Lock for as long as it is
//    pending, and each page holds an owner lock for its lifetime. A page that
//    restores a mutation whose lock is still held leaves it alone (another live
//    tab is sending it) and keeps it in storage; once the lock is released, it
//    takes the mutation over only if the owner page is gone (if the owner is
//    alive, the owner settled it). Without Web Locks an in-flight mutation is
//    not persisted at all (TanStack's behaviour), so no page can double-send.
// 3. Prompt writes: the storage write lands when a mutation starts being
//    persisted, when it settles, and when the page is hidden, instead of after
//    the persister's throttle, through the flush the `/persist` storage
//    persisters carry (`withFlush`).
//
// Delivery is AT-LEAST-ONCE: a request the server received but whose response
// never reached the closing page is sent again by the next page. Endpoints
// should be idempotent (send a client-generated id with the variables).
//
// Precedence is TanStack's: an explicit `dehydrateOptions.shouldDehydrateMutation`,
// then the client's `defaultOptions.dehydrate.shouldDehydrateMutation`, then
// this default.

type DehydratedMutation = DehydratedState['mutations'][number]

/** Where a persisted mutation's lock lives, written next to it in storage. */
interface OwnerTag {
  /** The mutation's lock: held by whichever page currently owns it. */
  lock: string
  /** The owning page's id; its owner lock is held for the page's lifetime. */
  owner: string
}

type TaggedMutation = DehydratedMutation & { pyreonOwner?: OwnerTag }

interface HeldLock {
  release: () => void
}

interface LockManagerLike {
  request: (
    name: string,
    options: { ifAvailable?: boolean },
    callback: (lock: unknown) => unknown,
  ) => Promise<unknown>
  query: () => Promise<{ held: Array<{ name?: string }> }>
}

/** A persister that can write NOW, skipping its throttle. */
export const FLUSH: unique symbol = Symbol.for('pyreon.query.persist.flush') as never

export type FlushablePersister = Persister & {
  [FLUSH]?: (client: PersistedClient) => void
}

const OWNER_PREFIX = 'pyreon-query-owner:'
const MUTATION_PREFIX = 'pyreon-query-mutation:'

function lockManager(): LockManagerLike | undefined {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator
  return nav?.locks && typeof nav.locks.request === 'function' ? nav.locks : undefined
}

/** Acquire `name` and keep it until `release()`; `null` when `ifAvailable` and it is held. */
function hold(
  locks: LockManagerLike,
  name: string,
  ifAvailable: boolean,
): Promise<HeldLock | null> {
  return new Promise((resolve) => {
    locks
      .request(name, ifAvailable ? { ifAvailable: true } : {}, (lock) => {
        if (!lock) {
          resolve(null)
          return undefined
        }

        return new Promise<void>((release) => resolve({ release: () => release() }))
      })
      .catch(() => resolve(null))
  })
}

async function ownerAlive(locks: LockManagerLike, owner: string): Promise<boolean> {
  const state = await locks.query()
  return state.held.some((l) => l.name === OWNER_PREFIX + owner)
}

// ─── Which mutations survive JSON ─────────────────────────────────────────────

function describeType(value: object): string {
  const name = (value as { constructor?: { name?: string } }).constructor?.name
  return name ? `a ${name}` : 'an object with a custom prototype'
}

/**
 * The first reason `value` does not survive a JSON round trip, or `null`.
 * `strict` (variables): only plain objects, arrays and JSON primitives, because
 * a `File` comes back as `{}` and a `Date` as a string, and the next page would
 * send that. Non-strict (the `onMutate` context): only what makes the whole
 * storage write throw, a cycle or a BigInt.
 */
function jsonProblem(
  value: unknown,
  path: string,
  strict: boolean,
  ancestors: object[] = [],
): string | null {
  if (value === null || typeof value !== 'object') return primitiveProblem(value, path, strict)
  if (ancestors.includes(value)) return `${path} refers back to itself (a circular reference)`
  if (strict && !Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) {
      return `${path} is ${describeType(value)}, which does not survive JSON`
    }
  }

  return Array.isArray(value)
    ? arrayProblem(value, path, strict, [...ancestors, value])
    : objectProblem(value, path, strict, [...ancestors, value])
}

/** A value that is not an object: JSON keeps strings, booleans, finite numbers and null. */
function primitiveProblem(value: unknown, path: string, strict: boolean): string | null {
  switch (typeof value) {
    case 'bigint':
      return `${path} is a BigInt, which JSON cannot store`
    case 'number':
      return strict && !Number.isFinite(value)
        ? `${path} is ${value}, which JSON stores as null`
        : null
    case 'function':
    case 'symbol':
      return strict ? `${path} is a ${typeof value}, which JSON drops` : null
    default:
      // string, boolean, null, and undefined (an object property JSON omits)
      return null
  }
}

function arrayProblem(
  value: unknown[],
  path: string,
  strict: boolean,
  ancestors: object[],
): string | null {
  for (let i = 0; i < value.length; i++) {
    const item = value[i]
    if (strict && (item === undefined || typeof item === 'function')) {
      const what = item === undefined ? 'undefined' : 'a function'

      return `${path}[${i}] is ${what}, which JSON stores as null`
    }
    const problem = jsonProblem(item, `${path}[${i}]`, strict, ancestors)
    if (problem) return problem
  }

  return null
}

function objectProblem(
  value: object,
  path: string,
  strict: boolean,
  ancestors: object[],
): string | null {
  for (const key of Object.keys(value)) {
    const item = (value as Record<string, unknown>)[key]
    const problem = jsonProblem(item, `${path}.${key}`, strict, ancestors)
    if (problem) return problem
  }

  return null
}

/** What the persistence verdict reads from a mutation, whatever its type parameters. */
export interface MutationView {
  readonly state: {
    readonly status: string
    readonly variables: unknown
    readonly context: unknown
  }
  readonly options: {
    readonly mutationKey?: MutationKey | undefined
    readonly mutationFn?: unknown
    readonly meta?: unknown
  }
}

function keyText(mutation: MutationView): string {
  const key = mutation.options.mutationKey
  return key ? `mutationKey ${JSON.stringify(key)}` : 'a mutation without a mutationKey'
}

/**
 * Whether a restored copy of `mutation` would run the same function: the
 * function a fresh page resolves from the client's defaults for its
 * `mutationKey` must be the one this mutation runs. An inline `mutationFn`, or
 * one with no `mutationKey`, cannot be recreated by another page.
 */
function isResumable(client: QueryClient, mutation: MutationView): boolean {
  const key = mutation.options.mutationKey
  const restored = client.defaultMutationOptions({
    ...client.getDefaultOptions().hydrate?.mutations,
    ...(key ? { mutationKey: key } : {}),
  })

  return (
    typeof restored.mutationFn === 'function' && restored.mutationFn === mutation.options.mutationFn
  )
}

/**
 * Whether `@pyreon/query/persist` may write `mutation` to storage (before the
 * Web Locks ownership rule, which applies on top):
 * - it is pending (not settled);
 * - it is not opted out with `meta: { persist: false }` (do this for any
 *   mutation whose variables are secrets, such as a sign-in);
 * - it is resumable: its `mutationKey` resolves, through
 *   `client.setMutationDefaults`, to the very function it runs;
 * - its variables survive JSON (no `File`, `Date`, `Map`, class instance,
 *   BigInt or cycle) and its `onMutate` context can be serialised.
 */
export function shouldPersistMutation(mutation: MutationView, client: QueryClient): boolean {
  return persistVerdict(mutation, client) === null
}

function persistVerdict(mutation: MutationView, client: QueryClient): string | null | 'skip' {
  if (mutation.state.status !== 'pending') return 'skip'
  if ((mutation.options.meta as { persist?: unknown } | undefined)?.persist === false) return 'skip'
  if (!isResumable(client, mutation)) return 'skip'

  return (
    jsonProblem(mutation.state.variables, 'variables', true) ??
    jsonProblem(mutation.state.context, 'the onMutate context', false)
  )
}

// ─── One session per QueryClient ──────────────────────────────────────────────

interface SaveTarget {
  persister: FlushablePersister
  buster: string
  dehydrateOptions: PersistQueryClientOptions['dehydrateOptions']
}

interface Session {
  client: QueryClient
  locks: LockManagerLike | undefined
  owner: string
  /** Locks this page holds, per mutation it owns. */
  held: Map<Mutation, { name: string; lock: HeldLock }>
  requested: WeakSet<Mutation>
  /** Locks taken over from a gone page, bound to the mutation once hydrated. */
  adopted: Map<object, { name: string; lock: HeldLock }>
  /** Mutations a live page elsewhere owns: written back unchanged, never run here. */
  passthrough: Map<string, TaggedMutation>
  warned: WeakSet<Mutation>
  /** The persister this client restores from (for re-reading storage). */
  source: Persister | undefined
  /** Set while subscribed: what a flush writes, and how. */
  target: SaveTarget | undefined
  defaultPredicate: (mutation: Mutation) => boolean
}

// Keyed by the client and held weakly: a session lives exactly as long as its
// QueryClient. Its owner lock is never released while the page lives (that is
// what "the owner is alive" means to other pages); one lock per client.
const sessions = new WeakMap<QueryClient, Session>()

function sessionFor(client: QueryClient): Session {
  const existing = sessions.get(client)
  if (existing) return existing
  const locks = lockManager()
  const session: Session = {
    client,
    locks,
    // Web Locks and randomUUID are both secure-context APIs: where one exists, so does the other.
    owner: locks ? crypto.randomUUID() : '',
    held: new Map(),
    requested: new WeakSet(),
    adopted: new Map(),
    passthrough: new Map(),
    warned: new WeakSet(),
    source: undefined,
    target: undefined,
    defaultPredicate: (mutation) => defaultPredicate(session, mutation),
  }
  sessions.set(client, session)
  if (session.locks) void hold(session.locks, OWNER_PREFIX + session.owner, false)

  client.getMutationCache().subscribe((event) => {
    const mutation = event.mutation as Mutation
    if (event.type === 'added') {
      const adopted = session.adopted.get(mutation.state)
      if (adopted) {
        session.adopted.delete(mutation.state)
        session.held.set(mutation, adopted)
      }

      return
    }
    const settled =
      event.type === 'removed' ||
      (event.type === 'updated' &&
        (event.action.type === 'success' || event.action.type === 'error'))
    if (!settled) return
    const owned = session.held.get(mutation)
    if (!owned) return
    // Write storage WITHOUT the settled mutation before letting go of its lock,
    // so a page that takes the lock next finds it gone and does not resend it.
    session.held.delete(mutation)
    flush(session)
    owned.lock.release()
  })

  return session
}

function defaultPredicate(session: Session, mutation: Mutation): boolean {
  const verdict = persistVerdict(mutation, session.client)
  if (verdict === 'skip') return false
  if (verdict !== null) {
    if (process.env.NODE_ENV !== 'production' && !session.warned.has(mutation)) {
      session.warned.add(mutation)
      console.warn(
        `[Pyreon] @pyreon/query/persist did not persist ${keyText(mutation)}: ${verdict}, so a later page ` +
          `would send a different request. Pass serialisable variables (for a file, upload it first and send ` +
          `its id), or set meta: { persist: false } on the mutation to keep it out of storage without this warning.`,
      )
    }

    return false
  }
  if (!session.locks) {
    // No Web Locks: no way to tell a live tab from a gone one, so in-flight
    // mutations stay out of storage (TanStack's at-most-once) and paused ones
    // are persisted as TanStack does.
    return mutation.state.isPaused
  }
  if (session.held.has(mutation)) return true
  requestLock(session, session.locks, mutation)

  return false
}

function requestLock(session: Session, locks: LockManagerLike, mutation: Mutation): void {
  if (session.requested.has(mutation)) return
  session.requested.add(mutation)
  const name = `${MUTATION_PREFIX}${session.owner}:${mutation.mutationId}`
  void hold(locks, name, false).then((lock) => {
    if (!lock) return
    if (mutation.state.status !== 'pending') {
      lock.release()
      return
    }
    session.held.set(mutation, { name, lock })
    // Now that it is owned, write it right away rather than after the throttle.
    flush(session)
  })
}

/**
 * Tag each written mutation this page owns with its lock, and append the
 * mutations live pages elsewhere own. A dehydrated mutation carries its
 * mutation's `state` object itself, which is how an entry finds its owner.
 */
function tagMutations(session: Session, client: PersistedClient): PersistedClient {
  const byState = new Map<object, string>()
  for (const [mutation, owned] of session.held) byState.set(mutation.state, owned.name)
  const tagged: TaggedMutation[] = (client.clientState.mutations as TaggedMutation[]).map(
    (entry) => {
      const lock = byState.get(entry.state)
      return lock ? { ...entry, pyreonOwner: { lock, owner: session.owner } } : entry
    },
  )
  tagged.push(...session.passthrough.values())

  return { ...client, clientState: { ...client.clientState, mutations: tagged } }
}

function snapshot(session: Session, target: SaveTarget): PersistedClient {
  const clientState = dehydrate(session.client, {
    ...target.dehydrateOptions,
    shouldDehydrateMutation: mutationPredicate(session, target.dehydrateOptions),
  })

  return tagMutations(session, { buster: target.buster, timestamp: Date.now(), clientState })
}

/** Write the current state now, skipping the persister's throttle when it can. */
function flush(session: Session): void {
  const target = session.target
  if (!target) return
  const now = snapshot(session, target)
  target.persister[FLUSH]?.(now)
  // Also hand it to the throttled path: its pending write must not be an OLDER
  // snapshot that lands after this one and undoes it.
  void target.persister.persistClient(now)
}

function mutationPredicate(
  session: Session,
  dehydrateOptions: PersistQueryClientOptions['dehydrateOptions'],
): (mutation: Mutation) => boolean {
  return (
    dehydrateOptions?.shouldDehydrateMutation ??
    session.client.getDefaultOptions().dehydrate?.shouldDehydrateMutation ??
    session.defaultPredicate
  )
}

// ─── Restoring: take over only what nobody alive owns ─────────────────────────

function asPaused(entry: DehydratedMutation): DehydratedMutation {
  return entry.state.status === 'pending' && !entry.state.isPaused
    ? { ...entry, state: { ...entry.state, isPaused: true } }
    : entry
}

function plain(entry: TaggedMutation): DehydratedMutation {
  const { pyreonOwner: _tag, ...rest } = entry
  return rest
}

/** Take over a gone page's mutation: it comes back paused, owned by this page. */
function adopt(
  session: Session,
  entry: TaggedMutation,
  tag: OwnerTag,
  lock: HeldLock,
): DehydratedMutation {
  const restored = asPaused(plain(entry))
  session.adopted.set(restored.state, { name: tag.lock, lock })
  return restored
}

/** A live page owns `entry`: keep writing it back, and take it over if that page dies. */
function watch(
  session: Session,
  locks: LockManagerLike,
  entry: TaggedMutation,
  tag: OwnerTag,
): void {
  // Restored twice (a remount) while the owner is still alive: already watched.
  if (session.passthrough.has(tag.lock)) return
  session.passthrough.set(tag.lock, entry)
  void hold(locks, tag.lock, false).then(async (lock) => {
    session.passthrough.delete(tag.lock)
    // The browser refused the wait (it aborted it): leave the mutation to its owner.
    if (!lock) return
    // The owner let go. Alive: it settled the mutation. Gone: it died with the
    // request in flight, unless storage no longer has it (settled, then gone).
    const stillStored = async (): Promise<boolean> => {
      const current = await session.source?.restoreClient()
      // Gone from storage altogether (`removeClient`, a cleared site) counts as settled.
      return ((current?.clientState.mutations ?? []) as TaggedMutation[]).some(
        (m) => m.pyreonOwner?.lock === tag.lock,
      )
    }
    if ((await ownerAlive(locks, tag.owner)) || !(await stillStored())) {
      lock.release()
      flush(session)
      return
    }
    hydrate(session.client, { mutations: [adopt(session, entry, tag, lock)], queries: [] })
    void session.client.resumePausedMutations()
  })
}

async function claimRestored(
  session: Session,
  restored: PersistedClient | undefined,
): Promise<PersistedClient | undefined> {
  const entries = (restored?.clientState?.mutations ?? []) as TaggedMutation[]
  if (!restored || entries.length === 0) return restored
  const kept: DehydratedMutation[] = []
  for (const entry of entries) {
    const tag = entry.pyreonOwner
    const locks = session.locks
    // Untagged: written by TanStack's own persistence (or without Web Locks).
    // Restored exactly as TanStack restores it.
    if (!tag || !locks) {
      kept.push(plain(entry))
      continue
    }
    // This page's own mutation (a remount): it is still in this client's cache.
    if (tag.owner === session.owner) continue
    const lock = await hold(locks, tag.lock, true)
    if (!lock) {
      watch(session, locks, entry, tag)
      continue
    }
    if (await ownerAlive(locks, tag.owner)) {
      // The owner is alive and has let go: it settled the mutation; this copy is stale.
      lock.release()
      continue
    }
    kept.push(adopt(session, entry, tag, lock))
  }

  return { ...restored, clientState: { ...restored.clientState, mutations: kept } }
}

// ─── The four entry points ────────────────────────────────────────────────────

type DurableOptions = {
  queryClient: QueryClient
  persister: Persister
  buster?: string
  dehydrateOptions?: PersistQueryClientOptions['dehydrateOptions']
}

function durable<T extends DurableOptions>(options: T): T {
  const session = sessionFor(options.queryClient)
  session.source = options.persister
  const persister: Persister = {
    persistClient: (client) => options.persister.persistClient(tagMutations(session, client)),
    removeClient: () => options.persister.removeClient(),
    restoreClient: async () => claimRestored(session, await options.persister.restoreClient()),
  }

  return {
    ...options,
    persister,
    dehydrateOptions: {
      ...options.dehydrateOptions,
      shouldDehydrateMutation: mutationPredicate(session, options.dehydrateOptions),
    },
  }
}

function detachTarget(session: Session, target: SaveTarget): void {
  // A later subscription on the same client replaced it: leave that one alone.
  if (session.target === target) session.target = undefined
}

/** While subscribed: flush on settle (via the session) and when the page is hidden. */
function attach(options: DurableOptions): () => void {
  const session = sessionFor(options.queryClient)
  const target: SaveTarget = {
    persister: options.persister as FlushablePersister,
    buster: options.buster ?? '',
    dehydrateOptions: options.dehydrateOptions,
  }
  session.target = target
  // No document (a server render, a worker): nothing to be hidden, so only the
  // settle-time writes apply.
  if (isServer) return () => detachTarget(session, target)
  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') flush(session)
  }
  const onPageHide = (): void => flush(session)
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)

  return () => {
    detachTarget(session, target)
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPageHide)
  }
}

/**
 * TanStack's `persistQueryClient` (restore, then keep persisting), with
 * Pyreon's mutation contract (see `shouldPersistMutation`). Returns
 * `[unsubscribe, restorePromise]`.
 */
export function persistQueryClient(
  options: PersistQueryClientOptions,
): [() => void, Promise<void>] {
  const opts = durable(options)
  let detach: (() => void) | undefined
  let stopped = false
  const [unsubscribe, restored] = tanstackPersistQueryClient(opts)
  const done = restored.then(() => {
    if (!stopped) detach = attach(options)
  })

  return [
    () => {
      stopped = true
      detach?.()
      unsubscribe()
    },
    done,
  ]
}

/** TanStack's `persistQueryClientRestore`, taking over only mutations no live page owns. */
export function persistQueryClientRestore(
  options: PersistedQueryClientRestoreOptions,
): Promise<void> {
  return tanstackPersistQueryClientRestore(durable(options))
}

/** TanStack's `persistQueryClientSave`, with Pyreon's mutation contract. */
export function persistQueryClientSave(options: PersistedQueryClientSaveOptions): Promise<void> {
  return tanstackPersistQueryClientSave(durable(options))
}

/** TanStack's `persistQueryClientSubscribe`, with Pyreon's mutation contract and prompt writes. */
export function persistQueryClientSubscribe(options: PersistedQueryClientSaveOptions): () => void {
  const detach = attach(options)
  const unsubscribe = tanstackPersistQueryClientSubscribe(durable(options))
  return () => {
    detach()
    unsubscribe()
  }
}

/** Give a persister the immediate write the mutation contract uses (`FLUSH`). */
export function withFlush<P extends Persister>(
  persister: P,
  write: (client: PersistedClient) => void,
): P {
  ;(persister as FlushablePersister)[FLUSH] = write
  return persister
}
