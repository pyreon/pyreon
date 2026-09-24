/**
 * Callout typo suggestion, and the unclosed-fence heuristic.
 *
 * Both exist because remark-directive fails SILENTLY in two ways that
 * look identical to the author: an unknown type renders as a plain
 * block, and an unclosed `:::` swallows the rest of the file into the
 * callout's body. In both cases the page builds, nothing warns, and what
 * ships is wrong.
 *
 * The suggestion has a precision job rather than a recall one. Telling
 * someone who wrote `:::qux` that they meant `:::tip` is worse than
 * saying nothing — they will believe it. The ratio bound is what
 * separates `warn` → `warning` (a real typo, distance 3 of 7) from
 * `qux` → `tip` (distance 3 of 3, i.e. an entirely different word), and
 * that boundary is the whole contract.
 *
 * `looksUnclosed` has the same shape: it fires only on the AND of two
 * signals, because either alone is noisy enough that authors would learn
 * to ignore the warning — which costs more than not having it.
 */
import { describe, expect, it } from 'vitest'
import {
  calloutEditDistance, isCalloutType, looksUnclosed, suggestCalloutType,
} from '../pipeline/remark-plugins/callout'

const directive = (children: unknown[], endLine: number) =>
  ({ children, position: { end: { line: endLine } } }) as never

describe('a typo gets a suggestion; a different word does not', () => {
  it('suggests the obvious near-misses', () => {
    // The control. Without it every "does not suggest" spec passes
    // against a function that suggests nothing.
    expect(suggestCalloutType('warn')).toBe('warning')
    expect(suggestCalloutType('nvote')).toBe('note')
    // The five types are tip / warning / note / danger / info — there is
    // no `caution`, which is itself worth pinning, since Docusaurus and
    // Starlight both have one and an author arriving from either will
    // reach for it.
    expect(suggestCalloutType('dnager')).toBe('danger')
    expect(isCalloutType('caution'), 'not one of ours').toBe(false)
  })

  it('suggests a one-character slip', () => {
    for (const [typo, real] of [['nite', 'note'], ['tipp', 'tip'], ['dagner', 'danger']] as const) {
      const s = suggestCalloutType(typo)
      expect(s, typo).toBe(real)
    }
  })

  it('does NOT suggest for an unrelated short word', () => {
    // `qux` is distance 3 from `tip` — the same absolute distance as
    // `warn` → `warning`. Only the RATIO separates them, and getting it
    // wrong tells the author they meant a callout they have never used.
    for (const word of ['qux', 'foo', 'bar', 'xyz']) {
      expect(suggestCalloutType(word), word).toBeNull()
    }
  })

  it('does NOT suggest for a long unrelated word', () => {
    for (const word of ['foobarbaz', 'somethingelse', 'aside-panel']) {
      expect(suggestCalloutType(word), word).toBeNull()
    }
  })

  it('suggests for the empty string only if something is within two edits', () => {
    // `''` → `tip` is distance 3, ratio 1.0 — no suggestion. This is the
    // shape a bare `:::` produces.
    expect(suggestCalloutType('')).toBeNull()
  })

  it('returns the type itself when it is already valid', () => {
    // Distance 0. The caller only asks after `isCalloutType` said no, so
    // this is defensive — but it must not return a DIFFERENT type.
    expect(suggestCalloutType('note')).toBe('note')
  })

  it('edit distance is symmetric and zero for equals', () => {
    expect(calloutEditDistance('note', 'note')).toBe(0)
    expect(calloutEditDistance('warn', 'warning')).toBe(3)
    expect(calloutEditDistance('warning', 'warn')).toBe(3)
    expect(calloutEditDistance('', 'tip')).toBe(3)
  })

  it('isCalloutType accepts exactly the known set', () => {
    // Case matters: `:::Note` is not a callout, and treating it as one
    // would silently accept a form the docs never document.
    expect(isCalloutType('note')).toBe(true)
    expect(isCalloutType('warning')).toBe(true)
    expect(isCalloutType('Note')).toBe(false)
    expect(isCalloutType('notes')).toBe(false)
    expect(isCalloutType('')).toBe(false)
  })
})

describe('the unclosed-fence heuristic fires on the AND of both signals', () => {
  const headings = (n: number) => Array.from({ length: n }, () => ({ type: 'heading' }))
  const paras = (n: number) => Array.from({ length: n }, () => ({ type: 'paragraph' }))

  it('fires when a callout swallowed several headings AND runs to the file end', () => {
    // The real shape: a missing `:::` makes remark consume every
    // remaining line into the callout body, and the page renders as one
    // giant tinted box.
    expect(looksUnclosed(directive(headings(3), 100), 101)).toBe(true)
  })

  it('fires on a huge child count at the file end', () => {
    // The other signal — a body with no headings but thirty blocks.
    expect(looksUnclosed(directive(paras(30), 100), 100)).toBe(true)
  })

  it('does NOT fire on a long callout that is NOT at the end', () => {
    // A genuinely long callout mid-document. Warning here trains authors
    // to ignore the message, which costs more than not having it.
    expect(looksUnclosed(directive(headings(5), 20), 200)).toBe(false)
    expect(looksUnclosed(directive(paras(50), 20), 200)).toBe(false)
  })

  it('does NOT fire on a short callout at the file end', () => {
    // The ordinary case: the last thing on the page is a small note.
    expect(looksUnclosed(directive(paras(3), 100), 100)).toBe(false)
    expect(looksUnclosed(directive(headings(1), 100), 100)).toBe(false)
  })

  it('treats "near the end" as within three lines', () => {
    // The boundary. Off by one either way turns a heuristic into either
    // a false alarm on every trailing callout or silence on the real one.
    expect(looksUnclosed(directive(headings(2), 97), 100)).toBe(true)
    expect(looksUnclosed(directive(headings(2), 96), 100)).toBe(false)
  })

  it('is quiet for a directive with no position', () => {
    // A node another plugin synthesised. `endLine` falls back to 0, so
    // `nearEnd` is only true for a near-empty file — never a false alarm
    // on a real page.
    expect(looksUnclosed({ children: headings(5) } as never, 500)).toBe(false)
  })

  it('is quiet for a directive with no children', () => {
    expect(looksUnclosed({ position: { end: { line: 10 } } } as never, 10)).toBe(false)
  })

  it('needs TWO headings, not one', () => {
    // One heading inside a callout is unusual but legal — a titled note.
    expect(looksUnclosed(directive([...headings(1), ...paras(5)], 100), 100)).toBe(false)
    expect(looksUnclosed(directive([...headings(2), ...paras(5)], 100), 100)).toBe(true)
  })
})
