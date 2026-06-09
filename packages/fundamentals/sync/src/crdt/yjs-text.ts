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

  // The single update path: Y.Text → base, on every committed change (local and
  // remote). Whole-string re-read keeps the bridge simple; the signal's Object.is
  // guard skips a no-op echo.
  const observer = () => base.set(ytext.toString())
  ytext.observe(observer)

  const facade = wrapSignal(base, {
    set: (next: string) => {
      const prev = ytext.toString()
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

  let disposed = false
  facade.dispose = () => {
    if (disposed) return
    disposed = true
    ytext.unobserve(observer)
  }
  onCleanup(facade.dispose)

  return facade
}
