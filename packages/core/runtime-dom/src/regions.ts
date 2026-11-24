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
 * position.
 */

/**
 * The user-code hook (`_userCodeHook`, run by `_ref` and spreads): hide the
 * server content of every PENDING region of the running build in a fragment,
 * so the ref or spread sees each element empty, as a fresh render's clone has
 * it. A region an earlier text write replaced keeps its stale first child as
 * its mark, which no later check matches again.
 */
export function _hideRegions(): void {
  if (_batch === null) return
  for (const el of _batch as (Element & Parked)[]) {
    const s = el[PARKED]
    if (el.nodeType === 1 && s != null && s.nodeType !== 11 && el.firstChild === s) {
      // Re-marked in place: still parked, still in this batch.
      const f = document.createDocumentFragment()
      f.append(...el.childNodes)
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
 * each reported in dev. After a bind that THREW: hidden content is put back and
 * nothing is removed.
 */
export function _settleRegions(parked: Node[], done: boolean): void {
  for (const el of parked as Element[]) {
    if (el.nodeType !== 1) continue
    const s = _takeParked(el)
    if (s == null) continue
    if (s.nodeType === 11) {
      if (!done) el.appendChild(s)
      else if (process.env.NODE_ENV !== 'production') reportRegionLost(el, s, el.textContent ?? '')
    } else if (done && el.firstChild === s) {
      if (process.env.NODE_ENV !== 'production') reportRegionLost(el, el, '')
      el.textContent = ''
    }
  }
}
