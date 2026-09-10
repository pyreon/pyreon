/**
 * `TreeBase`'s type-to-select, and the shared matcher underneath it.
 *
 * Typeahead is the WAI-ARIA "type a character to move focus to the next item
 * that begins with the typed characters" pattern, and its rules are not the
 * obvious ones. `typeaheadMatch` distinguishes two cases deliberately:
 *
 *   * a buffer of the SAME character repeated is a CYCLE — it starts after
 *     the current item, so pressing `b` twice walks from one `b` to the
 *     next rather than sticking on the first;
 *   * a longer buffer is a REFINEMENT — it starts AT the current item, so
 *     typing `be` after `b` keeps the item `b` already selected rather than
 *     skipping past it.
 *
 * Get either backwards and typeahead still "works" in the sense that focus
 * moves; it just moves somewhere the user did not intend, which is the kind
 * of keyboard bug that gets reported as "the tree feels broken" and is very
 * hard to pin down. Neither rule was asserted through the tree.
 *
 * The wrap-around matters for the same reason: a search that stops at the
 * end of the list makes the last item a dead end for the letter it starts
 * with.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { typeaheadMatch } from './keyboard'
import { TreeBase, type TreeNode, type TreeState } from './index'

const TREE: TreeNode[] = [
  { id: 'a', label: 'Apple' },
  { id: 'b', label: 'Banana' },
  { id: 'b2', label: 'Berry' },
  { id: 'c', label: 'Cherry' },
]

const mountTree = (props: Record<string, unknown> = {}): TreeState => {
  let captured: TreeState | undefined
  mountInBrowser(
    h(TreeBase as never, {
      data: TREE,
      ...props,
      children: (s: TreeState) => {
        captured = s
        return h('div', null)
      },
    }),
  )
  if (!captured) throw new Error('render child did not run')
  return captured
}

const key = (k: string): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })

describe('typeaheadMatch distinguishes cycling from refining', () => {
  const labels = ['Apple', 'Banana', 'Berry', 'Cherry']

  it('a repeated character CYCLES from after the current item', () => {
    // `b` then `b` again must walk Banana → Berry. Starting AT the current
    // index would stick on Banana forever and the second press would look
    // like a dropped keystroke.
    expect(typeaheadMatch(labels, 'b', -1), 'first press finds the first b').toBe(1)
    expect(typeaheadMatch(labels, 'bb', 1), 'second press advances').toBe(2)
    expect(typeaheadMatch(labels, 'bbb', 2), 'and wraps back around').toBe(1)
  })

  it('a longer buffer REFINES from the current item', () => {
    // Typing `be` while on Banana must reach Berry; typing `ba` while on
    // Banana must STAY there. Starting after the current index would skip
    // the item the user is refining towards.
    expect(typeaheadMatch(labels, 'ba', 1), 'the current item still matches').toBe(1)
    expect(typeaheadMatch(labels, 'be', 1)).toBe(2)
  })

  it('wraps around the end of the list', () => {
    // Otherwise the last item is a dead end for its own initial.
    expect(typeaheadMatch(labels, 'a', 3), 'from Cherry, `a` wraps to Apple').toBe(0)
  })

  it('is case-insensitive in both directions', () => {
    expect(typeaheadMatch(labels, 'AP', -1)).toBe(0)
    expect(typeaheadMatch(['lower'], 'L', -1)).toBe(0)
  })

  it('returns -1 rather than guessing when nothing matches', () => {
    // A fallback to index 0 would move focus somewhere unrelated on every
    // mistyped key.
    expect(typeaheadMatch(labels, 'z', -1)).toBe(-1)
  })

  it('returns -1 for an empty buffer or an empty list', () => {
    expect(typeaheadMatch(labels, '', 0)).toBe(-1)
    expect(typeaheadMatch([], 'a', 0)).toBe(-1)
  })

  it('a NEGATIVE current index is clamped, not used as an offset', () => {
    // The documented "nothing focused yet" case: the first keystroke must
    // land on the first match, and a modulo over a negative start would
    // land somewhere arbitrary.
    expect(typeaheadMatch(labels, 'ch', -1)).toBe(3)
  })
})

describe('the tree moves focus on printable keys', () => {
  it('a letter focuses the first matching visible node', () => {
    const s = mountTree()
    s.onKeyDown(key('c'))
    expect(s.focused(), 'C → Cherry').toBe('c')
  })

  it('a repeated letter walks to the NEXT match', () => {
    const s = mountTree()
    s.onKeyDown(key('b'))
    expect(s.focused()).toBe('b')
    s.onKeyDown(key('b'))
    expect(s.focused(), 'the second press must advance, not stick').toBe('b2')
  })

  it('leaves focus alone when nothing matches', () => {
    // A miss must not clear focus or jump to the top — either would lose
    // the user's place on a typo.
    const s = mountTree()
    s.onKeyDown(key('c'))
    s.onKeyDown(key('z'))
    expect(s.focused()).toBe('c')
  })

  it('ignores a modified key, so shortcuts are not swallowed', () => {
    // Ctrl-B / Cmd-B belong to the app or the browser. Consuming them as
    // typeahead breaks the shortcut and moves focus at the same time.
    const s = mountTree()
    const ctrlB = new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true })
    s.onKeyDown(ctrlB)
    expect(s.focused(), 'no typeahead from a modified key').toBeNull()
  })

  it('does not treat Space as typeahead', () => {
    // Space is the select key in this pattern; if it also fed the buffer
    // every selection would move focus somewhere else as a side effect.
    const s = mountTree()
    s.onKeyDown(key('b'))
    const before = s.focused()
    s.onKeyDown(key(' '))
    expect(s.focused()).toBe(before)
  })
})
