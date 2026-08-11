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
  // commits, so between transactions `base` is an exact mirror of
  // `ytext.toString()` — `base.peek()` yields prev with zero work instead of a
  // second O(docLen) tree walk + allocation per keystroke (the observer already
  // pays one). The mirror does NOT hold on three paths, all falling back to a
  // real materialization (each locked by `tests/synced-text-premise.test.ts`):
  //   • inside an outer `doc.transact(...)` — observers are deferred to its
  //     end, so base is stale w.r.t. mutations already applied in it
  //     (`_transaction !== null`, typed public on Y.Doc);
  //   • during a transaction's observer/cleanup phase — a SIBLING observer can
  //     run before ours and call .set while base lags the same transaction's
  //     text edit (`_transactionCleanups` non-empty; Yjs clears it after all
  //     observers ran);
  //   • after dispose() — the observer is detached, base is permanently stale.
  const prevText = (): string =>
    !disposed && doc.yDoc._transaction === null && doc.yDoc._transactionCleanups.length === 0
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
