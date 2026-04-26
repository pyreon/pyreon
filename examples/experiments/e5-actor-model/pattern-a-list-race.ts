/**
 * Pattern A — stale-capture race between sibling handlers.
 *
 * Real-world shape (this is the documented Pyreon anti-pattern from
 * `.claude/rules/anti-patterns.md`): a parent passes a signal to N
 * children. Each child captures the *value* (not the signal accessor) at
 * component-setup time, then references the captured copy in its handler.
 *
 * When child 1's handler updates the parent state, child 2's captured
 * snapshot is stale. Child 2's handler computes next-state from the stale
 * snapshot and overwrites child 1's update.
 *
 * The fix in idiomatic Pyreon is "always call `list()` inside the
 * handler" — but that's a vigilance-based discipline. Forgetting it is a
 * silent corruption bug.
 *
 * Two implementations below:
 *   1. signalVersion — simulates N children each capturing list() at
 *      setup. Reproduces the bug.
 *   2. actorVersion — children only know how to send `remove` messages;
 *      they CANNOT capture state, the only API is `send`. The bug is
 *      structurally impossible because there's no way to express it.
 */

import { signal } from '@pyreon/reactivity'
import { actor } from './actor'

interface Item {
  id: number
  label: string
}

const initialList: Item[] = [
  { id: 1, label: 'one' },
  { id: 2, label: 'two' },
  { id: 3, label: 'three' },
]

// ─── Signal version (buggy via stale capture) ──────────────────────────────

interface ChildHandlerSignal {
  remove: () => void
}

export function signalVersion(): {
  list: ReturnType<typeof signal<Item[]>>
  setupChild: (id: number) => ChildHandlerSignal
} {
  const list = signal<Item[]>([...initialList])
  // Real Pyreon footgun: the child captures the list value at SETUP.
  // The handler then operates on the stale `items` snapshot.
  function setupChild(id: number): ChildHandlerSignal {
    const items = list() // ← STALE CAPTURE: this is the bug
    return {
      remove: () => {
        const next = items.filter((x) => x.id !== id)
        list.set(next)
      },
    }
  }
  return { list, setupChild }
}

// ─── Actor version (structurally bug-free) ─────────────────────────────────

type Msg = { type: 'remove'; id: number }

interface ChildHandlerActor {
  remove: () => void
}

export function actorVersion(): {
  getList: () => Item[]
  setupChild: (id: number) => ChildHandlerActor
  flush: () => Promise<void>
} {
  const a = actor<Item[], Msg>([...initialList], (state, msg) => {
    if (msg.type === 'remove') {
      // Reducer always reads current `state` — no closure over a
      // pre-fire snapshot is even POSSIBLE because the API the child
      // sees is `send`, not `getState`.
      return state.filter((x) => x.id !== msg.id)
    }
    return state
  })
  // The child API exposes ONLY a way to send a message. There's no
  // accessor for the child to capture and stale-read. Bug is impossible
  // because the unsafe API doesn't exist.
  function setupChild(id: number): ChildHandlerActor {
    return { remove: () => a.send({ type: 'remove', id }) }
  }
  return {
    getList: a.getState,
    setupChild,
    flush: () => new Promise<void>((res) => queueMicrotask(res)),
  }
}
