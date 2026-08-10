import type { ComponentIntelligence } from '../../core/types'
import { focusComponents, suggestNames } from '../focus'

function ci(name: string, project?: string): ComponentIntelligence {
  return {
    name,
    controls: [],
    axes: [],
    scenarios: [],
    tags: [],
    ...(project ? { project } : {}),
  }
}

describe('focusComponents', () => {
  it('matches a bare name', () => {
    const out = focusComponents([ci('Button'), ci('Card')], 'Button')
    expect(out.kind).toBe('matched')
    expect(out.kind === 'matched' && out.components.map((c) => c.name)).toEqual(['Button'])
  })

  it('matches a project-qualified key', () => {
    const out = focusComponents([ci('Button', 'core'), ci('Button', 'admin')], 'core/Button')
    expect(out.kind === 'matched' && out.components[0]?.project).toBe('core')
  })

  it('REFUSES an ambiguous bare name instead of picking one', () => {
    // Picking the first is how a verify reports on the wrong component while
    // looking completely successful.
    const out = focusComponents([ci('Button', 'core'), ci('Button', 'admin')], 'Button')
    expect(out.kind).toBe('ambiguous')
    expect(out.kind === 'ambiguous' && out.message).toContain('core/Button')
    expect(out.kind === 'ambiguous' && out.message).toContain('admin/Button')
  })

  it('accepts a case-only difference but SAYS that it did', () => {
    const out = focusComponents([ci('Button')], 'button')
    expect(out.kind).toBe('matched')
    expect(out.kind === 'matched' && out.note).toContain('case-insensitive')
  })

  it('still refuses when two components differ only in case', () => {
    const out = focusComponents([ci('Button', 'a'), ci('BUTTON', 'b')], 'button')
    expect(out.kind).toBe('ambiguous')
  })

  it('reports an unknown name as an ERROR — a typo must never look like a pass', () => {
    // The whole reason this module exists: filtering to nothing and reporting
    // "0 failing" is green, fast, and about nothing.
    const out = focusComponents([ci('Button')], 'Nonexistent')
    expect(out.kind).toBe('unknown')
  })

  it('suggests the near miss for a typo', () => {
    const out = focusComponents([ci('Button'), ci('Card')], 'Buton')
    expect(out.kind === 'unknown' && out.message).toContain('Button')
  })

  it('distinguishes "no such component" from "no components at all"', () => {
    // Different next moves: fix the name, versus fix discovery.
    const empty = focusComponents([], 'Button')
    expect(empty.kind === 'unknown' && empty.message).toContain('found no components at all')
    const populated = focusComponents([ci('Card')], 'Button')
    expect(populated.kind === 'unknown' && populated.message).not.toContain('no components at all')
  })
})

describe('suggestNames', () => {
  it('ranks a one-character typo first', () => {
    expect(suggestNames(['Card', 'Button', 'Badge'], 'Buton')[0]).toBe('Button')
  })

  it('keeps a substring match that edit distance would score badly', () => {
    // `Btn` → `ButtonGroup` is a real intent; distance alone rejects it.
    expect(suggestNames(['ButtonGroup', 'Card'], 'Button')).toContain('ButtonGroup')
  })

  it('offers NOTHING rather than an unrelated name', () => {
    // A confident wrong suggestion costs more than no suggestion.
    expect(suggestNames(['Button', 'Card'], 'Zzzzzzzz')).toEqual([])
  })

  it('is case-insensitive', () => {
    expect(suggestNames(['Button'], 'BUTTON')).toEqual(['Button'])
  })

  it('caps the list so the error stays readable', () => {
    const names = ['Button', 'Buttonz', 'Buttonx', 'Buttony', 'Buttonw']
    expect(suggestNames(names, 'Button').length).toBeLessThanOrEqual(3)
  })

  it('deduplicates a name exported from several files', () => {
    expect(suggestNames(['Button', 'Button', 'Button'], 'Buton')).toEqual(['Button'])
  })

  it('stays cheap for an enormous lookup across a large catalog', () => {
    // Edit distance is O(n·m) and this runs on the ERROR path, where the
    // "lookup" is whatever reached argv. Without the length short-circuit a
    // 20k-character argument against 1419 names measured 1622ms; the bound is
    // sound rather than a heuristic (distance is at least the length gap), so
    // the suggestions above are unchanged.
    const names = Array.from({ length: 1419 }, (_, i) => `Component${i}`)
    const started = performance.now()
    expect(suggestNames(names, 'x'.repeat(20_000))).toEqual([])
    expect(performance.now() - started).toBeLessThan(250)
  })

  it('still suggests across a large catalog — the bound must not silence it', () => {
    // The mirror error: a short-circuit that skips too much would make the
    // suggestion machinery quietly useless on exactly the catalogs that need it.
    const names = [...Array.from({ length: 1419 }, (_, i) => `Component${i}`), 'Button']
    expect(suggestNames(names, 'Buton')).toContain('Button')
  })
})
