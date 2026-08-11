/**
 * Store mutations as a timeline you can step through — Atlas roadmap §9.
 *
 * ── The moat ──────────────────────────────────────────────────────────────
 *
 * `@pyreon/store` publishes a MUTATION STREAM: every write announces its store,
 * whether it was a direct set or a `patch`, and the per-key old/new values.
 * Storybook has no equivalent because React state has no such stream — a
 * component's state changes are private to the component.
 *
 * That stream makes two things possible that a workbench otherwise cannot do:
 *
 *   1. Render a component's real store state beside it, live.
 *   2. STEP BACK through the writes an interaction produced, and see which key
 *      changed at each step — the "what actually happened when I clicked" view.
 *
 * ── Why keep it pure ──────────────────────────────────────────────────────
 *
 * Everything here is data-in/data-out: recording, stepping, and describing a
 * step. The panel renders it and the store subscription feeds it, so the
 * stepping rules are testable against literals rather than against a mounted
 * component and a real store.
 */

/** One key's change within a single mutation. */
export interface StoreChange {
  key: string
  oldValue: unknown
  newValue: unknown
}

/** One recorded write. */
export interface StoreStep {
  /** Monotonic index — the position in the timeline, stable across re-reads. */
  index: number
  storeId: string
  /** `patch` is a multi-key write; `direct` is a single `.set`. */
  type: 'direct' | 'patch'
  changes: readonly StoreChange[]
  /** The store's full state AFTER this write. */
  state: Readonly<Record<string, unknown>>
}

export interface StoreTimeline {
  steps: readonly StoreStep[]
  /**
   * Which step the viewer is looking at; `steps.length - 1` is live.
   *
   * Kept as an index rather than a boolean "is time-travelling", because the
   * panel has to render the SELECTED state, and a boolean cannot say which.
   */
  cursor: number
}

export function emptyTimeline(): StoreTimeline {
  return { steps: [], cursor: -1 }
}

/**
 * How many writes to keep.
 *
 * A timeline is a debugging aid, not a log: an interaction that writes in a
 * loop would otherwise grow it without bound for the life of the workbench
 * session, and nobody scrolls back past a few dozen steps. Bounded here rather
 * than at the subscription so the cap is testable and the reason lives with it.
 */
export const MAX_STEPS = 200

/**
 * Append a write.
 *
 * The cursor FOLLOWS the tail unless the viewer has stepped back — a new write
 * while you are inspecting step 3 must not yank you to the end, or the panel
 * becomes unusable on any component that writes on a timer.
 */
export function record(
  timeline: StoreTimeline,
  step: Omit<StoreStep, 'index'>,
): StoreTimeline {
  const wasLive = timeline.cursor === timeline.steps.length - 1
  const next = [...timeline.steps, { ...step, index: timeline.steps.length }]
  // Trim from the FRONT, and renumber, so `index` stays equal to the array
  // position. A step whose index no longer matches its slot is a bug generator
  // for every consumer that uses one to look up the other.
  const trimmed = next.length > MAX_STEPS ? next.slice(next.length - MAX_STEPS) : next
  const steps = trimmed.map((s, i) => (s.index === i ? s : { ...s, index: i }))
  const dropped = next.length - steps.length
  return {
    steps,
    cursor: wasLive ? steps.length - 1 : Math.max(0, timeline.cursor - dropped),
  }
}

/** Move the cursor, clamped. */
export function seek(timeline: StoreTimeline, index: number): StoreTimeline {
  if (timeline.steps.length === 0) return timeline
  const clamped = Math.min(Math.max(index, 0), timeline.steps.length - 1)
  return clamped === timeline.cursor ? timeline : { ...timeline, cursor: clamped }
}

export function stepBack(timeline: StoreTimeline): StoreTimeline {
  return seek(timeline, timeline.cursor - 1)
}

export function stepForward(timeline: StoreTimeline): StoreTimeline {
  return seek(timeline, timeline.cursor + 1)
}

/** Is the viewer looking at the newest write? */
export function isLive(timeline: StoreTimeline): boolean {
  return timeline.steps.length === 0 || timeline.cursor === timeline.steps.length - 1
}

/** The state to render — the selected step's, or nothing recorded yet. */
export function stateAt(timeline: StoreTimeline): Readonly<Record<string, unknown>> | undefined {
  return timeline.steps[timeline.cursor]?.state
}

/** Start over — used when the scenario changes, so steps never bleed across. */
export function clear(): StoreTimeline {
  return emptyTimeline()
}

/**
 * A one-line description of a step.
 *
 * Names the KEYS that changed rather than the values: a value can be an object
 * of any size and the line has to stay scannable, while the key is what tells
 * you whether this is the write you were looking for.
 */
export function describeStep(step: StoreStep): string {
  const keys = step.changes.map((c) => c.key)
  const verb = step.type === 'patch' ? 'patch' : 'set'
  if (keys.length === 0) return `${step.storeId} · ${verb} (no keys changed)`
  if (keys.length <= 3) return `${step.storeId} · ${verb} ${keys.join(', ')}`
  return `${step.storeId} · ${verb} ${keys.slice(0, 3).join(', ')} +${keys.length - 3} more`
}

/**
 * Keys that changed more than once across the timeline, most-written first.
 *
 * The cheap version of "what is thrashing": a key written repeatedly during
 * one interaction is either a loop or a chain of dependent writes, and both are
 * worth seeing. Not a verdict — some keys legitimately move often — so it is
 * presented as a count, not a warning.
 */
export function hotKeys(timeline: StoreTimeline): { key: string; writes: number }[] {
  const counts = new Map<string, number>()
  for (const step of timeline.steps) {
    for (const change of step.changes) {
      counts.set(change.key, (counts.get(change.key) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .filter(([, writes]) => writes > 1)
    .map(([key, writes]) => ({ key, writes }))
    .sort((a, b) => b.writes - a.writes || a.key.localeCompare(b.key))
}
