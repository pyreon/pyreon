import { type Signal, onCleanup, signal, wrapSignal } from '@pyreon/reactivity'
import { LOCAL_ORIGIN } from './types'
import type { YjsCrdtDoc } from './yjs-adapter'

/** A `Signal<string>` backed by a collaborative `Y.Text`. */
export interface SyncedText extends Signal<string> {
  /** Insert `content` at character `index`. */
  insert(index: number, content: string): void
  /** Delete `length` characters starting at `index`. */
  delete(index: number, length: number): void
  /** Detach the Y.Text observer. Idempotent. */
  dispose(): void
}

/**
 * Bind a `Signal<string>` to a Yjs `Y.Text` — a COLLABORATIVE string with
 * character-level CRDT merge. Unlike `syncedSignal` (scalar last-writer-wins,
 * which drops the loser's value), two peers editing different regions BOTH keep
 * their edits: `Y.Text` merges inserts/deletes positionally with no lost
 * characters. This is the headline collaborative-editing primitive.
 *
 * Engine-specific (lives in `@pyreon/sync/yjs`): collaborative text is inherently
 * coupled to the CRDT's text type, so it is NOT behind the engine-neutral seam.
 *
 * Use `.insert` / `.delete` (positional ops Y.Text merges faithfully) for true
 * concurrent editing. `.set(fullText)` applies a minimal common-prefix/suffix
 * diff (one replace) — convenient for a controlled `<textarea>`'s single-region
 * edits, but a whole-text replace from two peers resolves by that diff, not a
 * positional merge, so prefer the positional ops where concurrency matters.
 */
export function syncedText(doc: YjsCrdtDoc, key: string): SyncedText {
  const ytext = doc.yDoc.getText(key)
  const base = signal(ytext.toString())
  let disposed = false

  // The single update path: Y.Text → base, on every committed change (local and
  // remote). Whole-string re-read keeps the bridge simple; the signal's Object.is
  // guard skips a no-op echo.
  const observer = () => base.set(ytext.toString())
  ytext.observe(observer)

  // `prev` for the .set diff. FAST PATH: the observer above is the SOLE base
  // writer and Yjs fires it synchronously when the OUTERMOST transaction
  // commits, so the mirror INVARIANT is two-axis — base === ytext.toString()
  // iff the observer is ATTACHED (`!disposed`) AND yjs is IDLE. `base.peek()`
  // then yields prev with zero work instead of a second O(items) tree walk +
  // allocation per keystroke (the observer already pays one).
  //
  // Yjs represents BOTH non-idle states in ONE field: `_transactionCleanups`
  // (typed public on Y.Doc) gains its entry in the same statement pair that
  // opens a transaction and is cleared only AFTER the last observer/cleanup
  // ran — so the single `length === 0` check covers the outer-`doc.transact`
  // window AND the observer-phase window (a sibling observer calling .set
  // before ours saw the same transaction's text edit), and any FUTURE window
  // is a non-idle state under the same check by construction. Both windows +
  // the post-dispose path are locked by `tests/synced-text-premise.test.ts`.
  //
  // The `_transaction === null` read is REDUNDANT belt-and-braces — implied by
  // empty cleanups on every yjs 13.x path (per-clause bisect: dropping it
  // fails zero tests; the other two clauses each fail exactly one spec). It is
  // kept ONLY as a one-property-read hedge against yjs-internals drift, never
  // as covering a distinct window.
  const prevText = (): string =>
    !disposed && doc.yDoc._transactionCleanups.length === 0 && doc.yDoc._transaction === null
      ? base.peek()
      : ytext.toString()

  const facade = wrapSignal(base, {
    set: (next: string) => {
      const prev = prevText()
      if (prev === next) return
      // Minimal single-region diff: keep the common prefix + suffix, replace the
      // middle. Covers the dominant controlled-input edit shape.
      const minLen = Math.min(prev.length, next.length)
      let p = 0
      while (p < minLen && prev[p] === next[p]) p++
      let s = 0
      while (s < minLen - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) {
        s++
      }
      doc.yDoc.transact(() => {
        const delCount = prev.length - p - s
        if (delCount > 0) ytext.delete(p, delCount)
        const insStr = next.slice(p, next.length - s)
        if (insStr.length > 0) ytext.insert(p, insStr)
      }, LOCAL_ORIGIN)
    },
  }) as SyncedText

  facade.insert = (index: number, content: string) => {
    doc.yDoc.transact(() => ytext.insert(index, content), LOCAL_ORIGIN)
  }
  facade.delete = (index: number, length: number) => {
    doc.yDoc.transact(() => ytext.delete(index, length), LOCAL_ORIGIN)
  }

  facade.dispose = () => {
    if (disposed) return
    disposed = true
    ytext.unobserve(observer)
  }
  onCleanup(facade.dispose)

  return facade
}
