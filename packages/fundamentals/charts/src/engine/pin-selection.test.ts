import { describe, expect, it } from 'vitest'
import { pinSelection } from './legend-toggle'

// `pinSelection` is the one place the web host, iOS and Android agree on what a
// pick does to the pinned set. It was inline in `<Chart>`'s `pickDatum` until
// the native hosts needed it — and two emitters re-deriving it is exactly how
// three targets come to disagree about what a SECOND tap does.

describe('pinSelection', () => {
  it("single keeps at most one, and a re-pick CLEARS it", () => {
    // The clear is the half worth pinning: "keep one" alone would replace, and
    // a user tapping the same bar twice expects it to let go.
    expect(pinSelection([], 2, false)).toEqual([2])
    expect(pinSelection([2], 5, false)).toEqual([5])
    expect(pinSelection([2], 2, false)).toEqual([])
  })

  it('multiple toggles membership and preserves the order of the rest', () => {
    expect(pinSelection([], 1, true)).toEqual([1])
    expect(pinSelection([1], 4, true)).toEqual([1, 4])
    expect(pinSelection([1, 4, 7], 4, true)).toEqual([1, 7])
    expect(pinSelection([1, 4, 7], 1, true)).toEqual([4, 7])
  })

  it('a MISS leaves the selection alone, in either mode', () => {
    // Clearing is an explicit unselect/restore, not a stray tap on the
    // background — which on a phone is most taps.
    for (const multiple of [false, true]) {
      expect(pinSelection([1, 4], -1, multiple), String(multiple)).toEqual([1, 4])
    }
  })

  it('returns a NEW array on a change and the SAME one on a miss', () => {
    // The identity matters to both hosts: the web's `fireOnChange` compares by
    // reference to decide whether `onSelectChange` fires, and the native hosts
    // write it into state. A miss that allocated would fire a callback for a
    // tap that changed nothing.
    const cur = [1, 4]
    expect(pinSelection(cur, -1, true)).toBe(cur)
    expect(pinSelection(cur, 9, true)).not.toBe(cur)
    // …and it never mutates what it was handed.
    expect(cur).toEqual([1, 4])
  })

  it('is idempotent in the sense that matters: toggle twice is the identity', () => {
    for (const start of [[], [3], [1, 3, 5]]) {
      const once = pinSelection(start, 3, true)
      expect(pinSelection(once, 3, true).slice().sort(), JSON.stringify(start)).toEqual(start.slice().sort())
    }
  })
})
