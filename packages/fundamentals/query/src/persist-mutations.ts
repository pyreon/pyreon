import type {
  DehydratedState,
  Mutation,
  MutationCacheNotifyEvent,
  MutationKey,
  QueryClient,
} from '@tanstack/query-core'
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
// Pyreon keeps everything TanStack persists, and also keeps a mutation while
// its request is in flight when a later page could send it again; it hands a
// persisted mutation to another page only once the page that owns it is gone:
//
// 1. Which mutations: `shouldPersistMutation`. Pending, not opted out with
//    `meta: { persist: false }`, and storable (its variables survive JSON; its
//    context, meta and key can be written). Then: PAUSED, as TanStack persists
//    it; or IN FLIGHT and resumable, meaning its `mutationKey` resolves to a
//    registered `mutationFn` (the function a restored copy runs), or it is
//    keyless and runs the client's default `mutationFn`. A keyless
//    `useMutation({ mutationFn: login })` in flight never reaches storage, and
//    a keyed mutation left out gets a dev warning saying why.
// 2. Ownership: each persisted mutation holds a Web Lock while it is pending,
//    and a page that has persisted one holds an owner lock until a pagehide
//    finds it owning none. A mutation lock is never released while storage may
//    still hold that mutation as pending. A page that restores a
//    mutation whose lock is held leaves it alone and keeps it in storage; once
//    the lock is released it reads the entry's CURRENT owner from storage and
//    takes it over only if that owner is gone. Without Web Locks an in-flight
//    mutation is not persisted (TanStack's behaviour).
// 3. Writes: the throttled writes TanStack makes, plus one immediate write
//    (coalesced per microtask) when a mutation becomes owned and when it
//    settles, the latter LANDED before its lock is released, and on page hide. A
//    provider that is no longer subscribed still removes its settled mutations
//    from storage.
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
  /** The owning page's id; its owner lock is held while it owns anything. */
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
  [FLUSH]?: (client: PersistedClient) => void | Promise<void>
}

const OWNER_PREFIX = 'pyreon-query-owner:'
const MUTATION_PREFIX = 'pyreon-query-mutation:'

function lockManager(): LockManagerLike | undefined {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator
  return nav?.locks && typeof nav.locks.request === 'function' ? nav.locks : undefined
}

/** Acquire `name` and keep it until `release()`; `null` when `ifAvailable` and it is held, or refused. */
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
    readonly isPaused: boolean
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
 * Whether a later page could send this mutation: a restored copy runs the
 * function the client resolves for its `mutationKey` (`setMutationDefaults`,
 * the client's default `mutationFn`, or a `hydrate` default). A keyed mutation
 * is resumable when that function exists. A keyless one is resumable only when
 * the function it runs IS the client's default, since an inline `mutationFn`
 * cannot be found again by another page.
 */
function isResumable(client: QueryClient, mutation: MutationView): boolean {
  const key = mutation.options.mutationKey
  const restored = client.defaultMutationOptions({
    ...client.getDefaultOptions().hydrate?.mutations,
    ...(key ? { mutationKey: key } : {}),
  })
  if (typeof restored.mutationFn !== 'function') return false

  return key ? true : restored.mutationFn === mutation.options.mutationFn
}

/** The first field of a dehydrated mutation that cannot be written, or `null` (the failure reason is made writable instead). */
function storageProblem(mutation: MutationView): string | null {
  return (
    jsonProblem(mutation.state.variables, 'variables', true) ??
    jsonProblem(mutation.state.context, 'the onMutate context', false) ??
    // (A mutationKey cannot hold a cycle or a BigInt: TanStack hashes it as JSON.)
    jsonProblem(mutation.options.meta, 'meta', false)
  )
}

// The storability check reads the variables, context and meta, which do not
// change while a mutation is pending, and it runs on every cache event (TanStack
// dehydrates eagerly), so it is cached per mutation and redone only when one of
// those objects is replaced.
const storageChecks = new WeakMap<
  object,
  { variables: unknown; context: unknown; meta: unknown; problem: string | null }
>()

function cachedStorageProblem(mutation: MutationView): string | null {
  const hit = storageChecks.get(mutation)
  const { variables, context } = mutation.state
  const meta = mutation.options.meta
  if (hit && hit.variables === variables && hit.context === context && hit.meta === meta) {
    return hit.problem
  }
  const problem = storageProblem(mutation)
  storageChecks.set(mutation, { variables, context, meta, problem })

  return problem
}

type Verdict = { persist: true } | { persist: false; warning?: string }

function persistVerdict(mutation: MutationView, client: QueryClient): Verdict {
  if (mutation.state.status !== 'pending') return { persist: false }
  if ((mutation.options.meta as { persist?: unknown } | undefined)?.persist === false) {
    return { persist: false }
  }
  const problem = cachedStorageProblem(mutation)
  if (problem) {
    return {
      persist: false,
      warning:
        `${problem}, so a later page would send a different request (or none). Pass serialisable values ` +
        `(for a file, upload it first and send its id), or set meta: { persist: false } on the mutation to keep ` +
        `it out of storage without this warning.`,
    }
  }
  // Paused: TanStack persists it, and so does this, whatever its function.
  if (mutation.state.isPaused || isResumable(client, mutation)) return { persist: true }
  if (!mutation.options.mutationKey) return { persist: false }

  return {
    persist: false,
    warning:
      `no mutationFn is registered for this key (client.setMutationDefaults(key, { mutationFn })), so a later ` +
      `page could not send it. It is kept in storage only while it is paused offline, not while its request is ` +
      `in flight. Register the function, or set meta: { persist: false } to silence this.`,
  }
}

/**
 * Whether `@pyreon/query/persist` may write `mutation` to storage (the Web
 * Locks ownership rule applies on top):
 * - it is pending (not settled), and not opted out with
 *   `meta: { persist: false }` (do this for any mutation whose variables are
 *   secrets, such as a sign-in);
 * - it can be stored: its variables survive JSON (no `File`, `Date`, `Map`,
 *   class instance, BigInt or cycle), and its `onMutate` context, `meta` and
 *   `mutationKey` can be written;
 * - it is paused (as TanStack persists it), or its request is in flight and a
 *   later page could send it: its `mutationKey` resolves to a registered
 *   `mutationFn` (a keyless mutation must run the client's default one).
 */
export function shouldPersistMutation(mutation: MutationView, client: QueryClient): boolean {
  return persistVerdict(mutation, client).persist
}

// ─── One session per QueryClient ──────────────────────────────────────────────

interface SaveTarget {
  persister: FlushablePersister
  buster: string
  dehydrateOptions: PersistQueryClientOptions['dehydrateOptions']
}

interface Owned {
  name: string
  lock: HeldLock
}

interface Session {
  client: QueryClient
  locks: LockManagerLike | undefined
  /** Locks this page holds, per mutation it owns. */
  held: Map<Mutation, Owned>
  /** Mutation locks requested and not granted yet. */
  requested: Set<Mutation>
  /** Locks taken over from a gone page, bound to the mutation once hydrated. */
  adopted: Map<object, Owned & { owner: string }>
  /** Mutations a live page elsewhere owns: written back unchanged, never run here. */
  passthrough: Map<string, TaggedMutation>
  warned: WeakSet<Mutation>
  /** The persister this client last restored from or saved to (re-read before a takeover). */
  source: FlushablePersister
  /** Set while subscribed: what a flush writes. */
  target: SaveTarget | undefined
  /** A write is scheduled for the end of this task; these run after it. */
  flushQueued: QueuedWrite[] | undefined
  /**
   * The page is going away (`pagehide`): its last write is final. Teardown
   * aborts in-flight requests, and the rejection that reaches the dying page
   * would settle each mutation as an error and write it OUT of storage, losing
   * exactly what the write before was there to keep (#4723's class). Cleared by
   * `pageshow` when the page comes back from the back/forward cache.
   */
  frozen: boolean
  /** Lock releases held back while frozen: a mutation that failed during teardown stays stored and owned. */
  deferred: Array<() => void>
  defaultPredicate: (mutation: Mutation) => boolean
}

// Keyed by the client and held weakly: a session lives exactly as long as its
// QueryClient, and it holds Web Locks only while its page owns a mutation.
const sessions = new WeakMap<QueryClient, Session>()

function sessionFor(client: QueryClient, persister: Persister): Session {
  const existing = sessions.get(client)
  if (existing) {
    existing.source = persister

    return existing
  }
  const session: Session = {
    client,
    locks: lockManager(),
    held: new Map(),
    requested: new Set(),
    adopted: new Map(),
    passthrough: new Map(),
    warned: new WeakSet(),
    source: persister,
    target: undefined,
    flushQueued: undefined,
    frozen: false,
    deferred: [],
    defaultPredicate: (mutation) => defaultPredicate(session, mutation),
  }
  sessions.set(client, session)
  client.getMutationCache().subscribe((event) => onMutationEvent(session, event))

  return session
}

// ─── The page's owner lock ────────────────────────────────────────────────────
//
// ONE per page, whatever the number of clients: taken with the page's first
// mutation lock and held until a `pagehide` finds the page owning nothing. A
// page that has not persisted a mutation holds no Web Lock (keeping it eligible
// for the back/forward cache). While it is held, "the owner is alive" is true,
// and that is the backstop when a mutation lock is let go: a live owner settled
// its mutation, whatever a slower write or another tab's copy left in storage.

interface PageOwner {
  owner: { id: string; lock: Promise<HeldLock | null> } | undefined
  /** Sessions owning a mutation right now (dropped as soon as they own none). */
  owning: Set<Session>
}

// Keyed by the page's LockManager (one per page), held weakly.
const pageOwners = new WeakMap<LockManagerLike, PageOwner>()

function pageOwnerFor(locks: LockManagerLike): PageOwner {
  let page = pageOwners.get(locks)
  if (!page) {
    page = { owner: undefined, owning: new Set() }
    pageOwners.set(locks, page)
  }

  return page
}

function ownerId(locks: LockManagerLike): string {
  const page = pageOwnerFor(locks)
  if (!page.owner) {
    // Web Locks and randomUUID are both secure-context APIs: where one exists, so does the other.
    const id = crypto.randomUUID()
    page.owner = { id, lock: hold(locks, OWNER_PREFIX + id, false) }
  }

  return page.owner.id
}

/** This page's owner id, if it has one now. */
function currentOwner(session: Session): string | undefined {
  return session.locks ? pageOwners.get(session.locks)?.owner?.id : undefined
}

/** Record whether `session` owns anything (requested, held or adopted locks). */
function trackOwnership(session: Session): void {
  if (!session.locks) return
  const { owning } = pageOwnerFor(session.locks)
  if (session.held.size > 0 || session.adopted.size > 0 || session.requested.size > 0) {
    owning.add(session)
  } else {
    owning.delete(session)
  }
}

/** At `pagehide`: let go of the owner lock if no client on the page owns a mutation. */
function releasePageOwnerIfIdle(session: Session): void {
  const page = session.locks ? pageOwners.get(session.locks) : undefined
  if (!page?.owner || page.owning.size > 0) return
  const { lock } = page.owner
  page.owner = undefined
  void lock.then((held) => held?.release())
}

function onMutationEvent(session: Session, event: MutationCacheNotifyEvent): void {
  const mutation = event.mutation as Mutation
  if (event.type === 'added') {
    const adopted = session.adopted.get(mutation.state)
    if (!adopted) return
    session.adopted.delete(mutation.state)
    session.held.set(mutation, { name: adopted.name, lock: adopted.lock })
    trackOwnership(session)
    // Storage still names the gone owner: say who owns it now.
    writeNow(session, () => undefined, { retag: { lock: adopted.name, owner: adopted.owner } })

    return
  }
  const settled =
    event.type === 'removed' ||
    (event.type === 'updated' && (event.action.type === 'success' || event.action.type === 'error'))
  if (!settled) return
  const owned = session.held.get(mutation)
  if (!owned) return
  session.held.delete(mutation)
  trackOwnership(session)
  const release = (): void => owned.lock.release()
  if (session.frozen) {
    // After pagehide. A success really happened: remove it from storage (only
    // that entry), then let go. A failure is most likely teardown aborting the
    // request: keep it stored and owned; if the page comes back from the
    // back/forward cache, `pageshow` writes and releases; if it does not, the
    // lock dies with the page and the next page sends it.
    if (event.type === 'updated' && event.action.type === 'success') {
      void editStored(session.source, [{ remove: owned.name }]).then(release)
    } else {
      session.deferred.push(release)
    }

    return
  }
  // THE INVARIANT: the lock is released only after the write that drops the
  // mutation has SETTLED (landed or failed; an async persister's included), so
  // a page that takes the lock next does not find it and send it again.
  // - A FAILED write (a full storage) leaves the mutation stored as pending: the
  //   lock still goes, with a dev warning, and once this page is gone the next
  //   page sends it again (at-least-once).
  // - A write that NEVER settles keeps this lock, and the page's owner lock, for
  //   the page's lifetime. That fails safe while the page lives (another tab
  //   sees a live owner); once it is gone, the mutation is still stored as
  //   pending and the next page sends it again (at-least-once).
  // - A persister without the immediate write (`FLUSH`), such as TanStack's own
  //   createSyncStoragePersister imported directly, resolves before its
  //   throttled write lands: only the owner check protects it, and a page that
  //   dies inside the throttle window leaves the mutation to be sent again.
  //   Use the `/persist` persisters.
  writeNow(session, release, { remove: owned.name })
}

function defaultPredicate(session: Session, mutation: Mutation): boolean {
  const verdict = persistVerdict(mutation, session.client)
  if (!verdict.persist) {
    if (verdict.warning && process.env.NODE_ENV !== 'production' && !session.warned.has(mutation)) {
      session.warned.add(mutation)
      console.warn(
        `[Pyreon] @pyreon/query/persist did not persist ${keyText(mutation)}: ${verdict.warning}`,
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
  trackOwnership(session)
  const name = `${MUTATION_PREFIX}${ownerId(locks)}:${mutation.mutationId}`
  void hold(locks, name, false).then((lock) => {
    session.requested.delete(mutation)
    if (!lock || mutation.state.status !== 'pending') {
      lock?.release()
      trackOwnership(session)

      return
    }
    session.held.set(mutation, { name, lock })
    trackOwnership(session)
    // Now that it is owned, write it right away rather than after the throttle:
    // a tab that dies without a pagehide (a crash, a killed process) must still
    // leave it in storage. Writes of mutations that start together coalesce.
    writeNow(session, () => undefined)
  })
}

/** Turn a value JSON cannot write into a plain `{ name, message }` (a retry's failure reason). */
function writableFailure(reason: Error | null): Error | null {
  if (jsonProblem(reason, 'failureReason', false) === null) return reason
  // A plain object, not an Error: JSON writes an Error as `{}`.
  return { name: String(reason?.name ?? 'Error'), message: String(reason?.message ?? '') }
}

/**
 * Tag each written mutation this page owns with its lock, make every retry's
 * `failureReason` writable, and append the mutations live pages elsewhere own.
 * A dehydrated mutation carries its mutation's `state` object itself, which is
 * how an entry finds its owner.
 */
function tagMutations(session: Session, client: PersistedClient): PersistedClient {
  const byState = new Map<object, string>()
  for (const [mutation, owned] of session.held) byState.set(mutation.state, owned.name)
  // A page that holds a mutation lock holds its owner lock too.
  const owner = currentOwner(session) ?? ''
  const tagged: TaggedMutation[] = (client.clientState.mutations as TaggedMutation[]).map(
    (entry) => {
      const failureReason = writableFailure(entry.state.failureReason)
      const state =
        failureReason === entry.state.failureReason
          ? entry.state
          : { ...entry.state, failureReason }
      const lock = byState.get(entry.state)

      return lock ? { ...entry, state, pyreonOwner: { lock, owner } } : { ...entry, state }
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

/** Write to a persister now, skipping its throttle when it can, and through the throttle too; resolves once it has landed. */
async function writeThrough(persister: FlushablePersister, client: PersistedClient): Promise<void> {
  // Hand it to the throttled path first: its pending write must not be an OLDER
  // snapshot that lands after this one and undoes it, and if the immediate
  // write fails, that throttled write (with the persister's `retry`) is the one
  // that can still land.
  const throttled = persister.persistClient(client)
  const direct = persister[FLUSH]
  try {
    // A persister without the immediate write is done when its own write resolves.
    await (direct ? direct(client) : throttled)
  } catch (error) {
    // Settled, failed: the caller still releases (see THE INVARIANT).
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[Pyreon] @pyreon/query/persist could not write to storage (${String(error)}). A mutation that settled ` +
          `may stay stored as pending, and a later page will send it again. Free up storage space, or keep ` +
          `less in the persisted cache (for example with dehydrateOptions.shouldDehydrateQuery).`,
      )
    }
  }
}

/** What a page that is not subscribed changes in storage: only entries it owns. */
type StoredEdit =
  /** Drop a settled mutation's entry. */
  | { remove: string }
  /** Name this page as the owner of an entry it took over. */
  | { retag: { lock: string; owner: string } }
  /** Nothing: the write exists for a subscribed page. */
  | undefined

interface QueuedWrite {
  after: () => void
  edit: StoredEdit
}

/**
 * Write once at the end of this task, however many mutations asked, then run
 * each `after` (lock releases). Subscribed: the whole current state. Not
 * subscribed (a provider that unmounted, a restore-only client): only the
 * stored entries this page owns change, so nothing it was told to stop
 * persisting comes back.
 */
function writeNow(session: Session, after: () => void, edit?: StoredEdit): void {
  const queued = session.flushQueued
  if (queued) {
    queued.push({ after, edit })

    return
  }
  const fresh: QueuedWrite[] = [{ after, edit }]
  session.flushQueued = fresh
  queueMicrotask(() => void runWrites(session, fresh))
}

async function runWrites(session: Session, queued: QueuedWrite[]): Promise<void> {
  session.flushQueued = undefined
  const target = session.target
  // Nothing is written after the page's final write (see `frozen`).
  if (!session.frozen) {
    if (target) {
      await writeThrough(target.persister, snapshot(session, target))
    } else {
      await editStored(
        session.source,
        queued.map((q) => q.edit),
      )
    }
  }
  for (const q of queued) q.after()
}

async function editStored(source: FlushablePersister, edits: StoredEdit[]): Promise<void> {
  const removed = new Set<string>()
  const retagged = new Map<string, string>()
  for (const edit of edits) {
    if (edit && 'remove' in edit) removed.add(edit.remove)
    else if (edit) retagged.set(edit.retag.lock, edit.retag.owner)
  }
  // Another tab may write the shared key between this read and this write and
  // put back a copy it still keeps: so read back after a removal, and remove
  // again once if it came back.
  for (let attempt = 0; attempt < 2; attempt++) {
    const stored = await source.restoreClient()
    // Nothing stored (removed, or never written): nothing to correct.
    if (!stored) return
    const entries = stored.clientState.mutations as TaggedMutation[]
    const lockOf = (m: TaggedMutation): string => m.pyreonOwner?.lock ?? ''
    if (attempt > 0 && !entries.some((m) => removed.has(lockOf(m)))) return
    const mutations = entries
      .filter((m) => !removed.has(lockOf(m)))
      .map((m) => {
        const owner = retagged.get(lockOf(m))

        return owner ? { ...m, pyreonOwner: { lock: lockOf(m), owner } } : m
      })
    await writeThrough(source, { ...stored, clientState: { ...stored.clientState, mutations } })
    if (removed.size === 0) return
  }
}

/** Write the current state now (the page is being hidden). */
function flush(session: Session, target: SaveTarget): void {
  if (!session.frozen) void writeThrough(target.persister, snapshot(session, target))
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
  locks: LockManagerLike,
  entry: TaggedMutation,
  tag: OwnerTag,
  lock: HeldLock,
): DehydratedMutation {
  const owner = ownerId(locks)
  const restored = asPaused(plain(entry))
  session.adopted.set(restored.state, { name: tag.lock, lock, owner })
  trackOwnership(session)

  return restored
}

/** A restore TanStack discarded (expired, busted, failed) never hydrated what it adopted. */
function releaseUnclaimed(session: Session): void {
  for (const owned of session.adopted.values()) owned.lock.release()
  session.adopted.clear()
  trackOwnership(session)
}

/** The stored entry for `lock` as it is NOW: its current owner, or `undefined` if it is gone. */
async function storedEntry(session: Session, lock: string): Promise<TaggedMutation | undefined> {
  const current = await session.source.restoreClient()
  // Gone from storage altogether (`removeClient`, a cleared site) counts as settled.
  const entries = (current?.clientState.mutations ?? []) as TaggedMutation[]

  return entries.find((m) => m.pyreonOwner?.lock === lock)
}

/** A live page owns `entry`: keep writing it back, and take it over if its owner dies. */
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
    // The holder let go. Read who owns it NOW (a page that took it over
    // re-tagged it): alive means it settled the mutation; gone, with the entry
    // still stored, means it died with the request in flight.
    const current = await storedEntry(session, tag.lock)
    const owner = current?.pyreonOwner?.owner
    if (!current || !owner || (await ownerAlive(locks, owner))) {
      lock.release()
      // Write without the copy this page was keeping for its owner.
      writeNow(session, () => undefined, { remove: tag.lock })

      return
    }
    hydrate(session.client, { mutations: [adopt(session, locks, current, tag, lock)], queries: [] })
    void session.client.resumePausedMutations()
  })
}

async function claimEntry(
  session: Session,
  locks: LockManagerLike,
  entry: TaggedMutation,
  tag: OwnerTag,
): Promise<DehydratedMutation | undefined> {
  // This page's own mutation (a remount): it is still in this client's cache.
  if (tag.owner === currentOwner(session)) return undefined
  const lock = await hold(locks, tag.lock, true)
  if (!lock) {
    watch(session, locks, entry, tag)

    return undefined
  }
  if (await ownerAlive(locks, tag.owner)) {
    // The owner is alive and has let go: it settled the mutation; this copy is stale.
    lock.release()

    return undefined
  }

  return adopt(session, locks, entry, tag, lock)
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
    if (tag && locks) {
      const claimed = await claimEntry(session, locks, entry, tag)
      if (claimed) kept.push(claimed)
    } else {
      // Untagged: written by TanStack's own persistence (or without Web Locks).
      // Restored exactly as TanStack restores it.
      kept.push(plain(entry))
    }
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
  const session = sessionFor(options.queryClient, options.persister)
  const persister: Persister = {
    // TanStack's own (throttled) saves stop too once the page has made its final write.
    persistClient: (client) =>
      session.frozen ? undefined : options.persister.persistClient(tagMutations(session, client)),
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

/** While subscribed: immediate writes go to this persister, and the page hiding writes too. */
function attach(options: DurableOptions): () => void {
  const session = sessionFor(options.queryClient, options.persister)
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
    if (document.visibilityState === 'hidden') flush(session, target)
  }
  const onPageHide = (): void => {
    flush(session, target)
    session.frozen = true
    releasePageOwnerIfIdle(session)
  }
  // Only a page coming back from the back/forward cache was frozen (a page's
  // first pageshow finds nothing to do).
  const onPageShow = (): void => {
    if (!session.frozen) return
    session.frozen = false
    // Write what changed while frozen, then let go of the locks of the
    // mutations that settled meanwhile.
    const deferred = session.deferred.splice(0)
    writeNow(session, () => {
      for (const release of deferred) release()
    })
  }
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  return () => {
    detachTarget(session, target)
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
  }
}

/** Run a restore, then release whatever it adopted that TanStack did not hydrate. */
function restoring<T>(session: Session, restore: Promise<T>): Promise<T> {
  return restore.finally(() => releaseUnclaimed(session))
}

/**
 * TanStack's `persistQueryClient` (restore, then keep persisting), with
 * Pyreon's mutation contract (see `shouldPersistMutation`). Returns
 * `[unsubscribe, restorePromise]`.
 */
export function persistQueryClient(
  options: PersistQueryClientOptions,
): [() => void, Promise<void>] {
  const session = sessionFor(options.queryClient, options.persister)
  const opts = durable(options)
  let detach: (() => void) | undefined
  let stopped = false
  const [unsubscribe, restored] = tanstackPersistQueryClient(opts)
  const done = restoring(session, restored).then(() => {
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
  return restoring(
    sessionFor(options.queryClient, options.persister),
    tanstackPersistQueryClientRestore(durable(options)),
  )
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
  write: (client: PersistedClient) => void | Promise<void>,
): P {
  ;(persister as FlushablePersister)[FLUSH] = write

  return persister
}
