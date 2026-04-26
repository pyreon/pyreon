/**
 * Pattern B — stale-closure on async fetch race.
 *
 * Real-world shape: a user-detail panel that fetches `/users/:id` when the
 * selected user changes. The fetch handler captures the userId at click
 * time. If the user clicks user A → user B before A's fetch resolves, the
 * A-resolution arrives second and overwrites B's data with A's response.
 * The UI shows B's name with A's avatar, A's bio, A's posts, etc.
 *
 * Two implementations below:
 *   1. signalVersion — uses Pyreon signals + a free-floating async fetch.
 *      Reproduces the bug: late-arriving response overwrites current data.
 *   2. actorVersion — uses the e5 actor. The async response goes through
 *      a `result` message; the reducer rejects it if `state.requestId`
 *      doesn't match. Structurally impossible to overwrite with stale data.
 *
 * The signal version COULD be fixed with an AbortController OR a request
 * counter inside the handler — but those are vigilance-based fixes that a
 * developer must remember to apply at every fetch site. The actor version
 * makes the request-counter check the SHAPE of the message-handling code,
 * not an opt-in.
 */

import { signal } from '@pyreon/reactivity'
import { actor } from './actor'

export interface UserData {
  id: number
  name: string
}

interface FakeFetcher {
  (id: number, delayMs: number): Promise<UserData>
}

// Test helper: returns a fetcher that resolves after `delayMs` with a
// canonical user shape. Lets the tests control resolution order.
export function makeFakeFetcher(): FakeFetcher {
  return (id, delayMs) =>
    new Promise<UserData>((res) => {
      setTimeout(() => res({ id, name: `user-${id}` }), delayMs)
    })
}

// ─── Signal version (buggy) ────────────────────────────────────────────────

export function signalVersion(fetcher: FakeFetcher): {
  selectUser: (id: number, delayMs: number) => Promise<void>
  getCurrent: () => UserData | null
} {
  const current = signal<UserData | null>(null)
  // No request counter — the next-arriving fetch wins, regardless of
  // which click triggered it. Classic stale-closure async bug.
  async function selectUser(id: number, delayMs: number): Promise<void> {
    const data = await fetcher(id, delayMs)
    current.set(data) // RACE: late arrival overwrites whatever's there
  }
  return { selectUser, getCurrent: () => current() }
}

// ─── Actor version (structurally bug-free) ─────────────────────────────────

interface ActorState {
  current: UserData | null
  requestId: number
}

type Msg =
  | { type: 'select'; id: number; delayMs: number; fetcher: FakeFetcher }
  | { type: 'fetched'; requestId: number; data: UserData }

export function actorVersion(fetcher: FakeFetcher): {
  selectUser: (id: number, delayMs: number) => void
  getCurrent: () => UserData | null
  flush: () => Promise<void>
} {
  const a = actor<ActorState, Msg>(
    { current: null, requestId: 0 },
    (state, msg) => {
      if (msg.type === 'select') {
        const next: ActorState = {
          current: state.current,
          requestId: state.requestId + 1,
        }
        // Side effect: kick off the fetch with the new requestId baked in.
        // When it resolves, send a `fetched` message with that id.
        msg.fetcher(msg.id, msg.delayMs).then((data) => {
          a.send({ type: 'fetched', requestId: next.requestId, data })
        })
        return next
      }
      if (msg.type === 'fetched') {
        // STRUCTURAL CHECK: ignore responses for outdated requests.
        // The reducer ALWAYS sees the current `state.requestId`, so a stale
        // response (with msg.requestId < state.requestId) can never sneak in.
        if (msg.requestId !== state.requestId) return state
        return { current: msg.data, requestId: state.requestId }
      }
      return state
    },
  )
  return {
    selectUser: (id, delayMs) => a.send({ type: 'select', id, delayMs, fetcher }),
    getCurrent: () => a.getState().current,
    flush: () => new Promise<void>((res) => queueMicrotask(res)),
  }
}
