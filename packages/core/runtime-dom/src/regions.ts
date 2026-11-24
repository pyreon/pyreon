import { reportRegionLost } from './hydration-debug'
import { _batch, PARKED, type Parked, _takeParked } from './parked-text'

/**
 * The hydration side of parked server content (`parked-text.ts`): what user
 * code must not see, and what a build leaves unclaimed. Registered by
 * `hydrateRoot`, so a client-only bundle carries none of it.
 *
 * #4599 `_setChild` REGIONS. An element the template leaves EMPTY and
 * `_setChild` fills holds the server's rendering of the value, marker-less. The
 * verifier parks it when that content is not a lone text, marked with its
 * first server child (PENDING). The rule: hydration removes only what it
 * recorded as server content, and claims by element identity, never by
 * position. The claim is in the slot hydrator (`hydrateMountSlot`), which
 * `_setChild` already calls.
 */

/**
 * The user-code hook (`_userCodeHook`, run by `_ref` and spreads with the
 * element they receive): hide the server content of every PENDING region of
 * the running build inside that element (itself included) in a fragment, so
 * the ref or spread sees each such element empty, as a fresh render's clone has
 * it. Code that reaches a region OUTSIDE its element through the DOM sees the
 * server content, as it does any adopted node. A region an earlier text write replaced keeps its stale first child as
 * its mark, which no later check matches again.
 */
export function _hideRegions(target: Element): void {
  if (_batch === null) return
  for (const el of _batch as (Element & Parked)[]) {
    const s = el[PARKED]
    // Only regions the code's element holds: a ref on an unrelated sibling
    // must not detach and reattach server nodes (an iframe reloads, media
    // pauses, focus is lost, a custom element disconnects).
    if (el.nodeType === 1 && s != null && s.nodeType !== 11 && el.firstChild === s && target.contains(el)) {
      // Re-marked in place: still parked, still in this batch.
      const f = document.createDocumentFragment()
      while (el.firstChild !== null) f.appendChild(el.firstChild)
      el[PARKED] = f
      if (process.env.NODE_ENV !== 'production') {
        ;(globalThis as { __pyreon_count__?: (name: string) => void }).__pyreon_count__?.('runtime.tpl.hide')
      }
    }
  }
}

/**
 * Settle a closed batch's regions (`_parkCloser`, run first by
 * `sweepParkedTexts` in `template.ts`, which then settles the text
 * placeholders). After a completed bind: an unclaimed region
 * whose element still holds exactly the recorded content is emptied (the
 * client renders it empty, as its clone would) and a hidden one is dropped,
 * each reported in dev (a region user code filled, whose value mounted fresh,
 * is not: that is not a server/client difference). After a bind that THREW:
 * hidden content is put back, ahead of any node user code inserted, and nothing
 * is removed (a claimed region's cleanup keeps its nodes, see `claimRegion`).
 */
export function _settleRegions(parked: Node[], done: boolean): void {
  for (const el of parked as Element[]) {
    if (el.nodeType !== 1) continue
    const s = _takeParked(el)
    if (s == null) continue
    if (s.nodeType === 11) {
      // Server nodes first; nodes user code inserted follow them. (A text
      // write took its region's fragment already: `_takeHidden`.)
      if (!done) el.insertBefore(s, el.firstChild)
      else if (process.env.NODE_ENV !== 'production' && !(s as { _fellBack?: true })._fellBack) {
        reportRegionLost(el, s, el.textContent ?? '')
      }
    } else if (done && el.firstChild === s) {
      if (process.env.NODE_ENV !== 'production') reportRegionLost(el, el, '')
      el.textContent = ''
    }
  }
}
