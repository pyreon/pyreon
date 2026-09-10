/**
 * The component catalog an AI assistant reads before writing JSX.
 *
 * The one claim this surface must never get wrong is **verified vs
 * unverified**. "correct (verified)" tells an assistant these exact prop
 * values were mounted and checked; if nothing checked them, the
 * assistant copies unchecked props into real code believing they were
 * proven. That is worse than saying nothing, because a stated
 * verification stops it from checking anything itself — so the weaker
 * wording on the unverified branch is load-bearing, not politeness.
 *
 * The failing-scenario findings are the same contract inverted. Atlas
 * records WHICH check failed and what to change; if `collectFindings`
 * drops one, the catalog knows a component is broken and the assistant
 * is never told. That has already happened once: the collector named
 * five checks from a hand-written list and never learned about
 * `ssrParity`, so hydration failures were recorded and silently
 * discarded. It now reads keys off the verdict object, and the spec
 * below pins a check name that list never had.
 *
 * Everything else is optional-field rendering — a catalog scanned from a
 * package with no tags, no summaries, no controls must produce a usable
 * index rather than `undefined` in a sentence.
 */
import { describe, expect, it } from 'vitest'
import {
  componentStats, formatControl, isVerified, renderCatalogIndex, renderComponent, wasChecked,
} from '../atlas'
import type { AtlasCatalog, AtlasComponent, AtlasScenario } from '../atlas'

const scenario = (name: string, over: Partial<AtlasScenario> = {}): AtlasScenario =>
  ({ id: name, name, args: { a: 1 }, ...over }) as AtlasScenario

const passing = (name = 'ok') => scenario(name, { verify: { ok: true, checked: 3 } as never })
const failing = (name: string, verify: Record<string, unknown>) =>
  scenario(name, { verify: { ok: false, checked: 2, ...verify } as never })
const unchecked = (name = 'un') => scenario(name, { verify: { ok: true, checked: 0 } as never })

const catalog = (components: Partial<AtlasComponent>[]): AtlasCatalog =>
  ({ version: 2, components } as AtlasCatalog)

describe('verified means a check RAN and passed — nothing weaker', () => {
  it('an ok verdict with zero checks is NOT verified', () => {
    // The whole point. `ok: true, checked: 0` means "nothing examined
    // this", and reporting it as verified is the claim that must not be
    // made.
    expect(isVerified(passing())).toBe(true)
    expect(isVerified(unchecked()), 'ok with checked:0 is not a pass').toBe(false)
    expect(isVerified(scenario('none'))).toBe(false)
  })

  it('wasChecked reports whether anything ran, independent of the outcome', () => {
    expect(wasChecked(passing())).toBe(true)
    expect(wasChecked(failing('f', {}))).toBe(true)
    expect(wasChecked(unchecked())).toBe(false)
    expect(wasChecked(scenario('none'))).toBe(false)
  })

  it('counts verified, failing and unverified as three DISTINCT states', () => {
    // Folding "not verified" into "failing" cries wolf; folding it into
    // "verified" is the lie. They have to be three numbers.
    const stats = componentStats({
      name: 'C',
      scenarios: [passing('a'), failing('b', {}), unchecked('c'), scenario('d')],
    } as AtlasComponent)
    expect(stats).toEqual({ scenarios: 4, verified: 1, failed: 1, unverified: 2 })
  })

  it('reports zeroes for a component with no scenarios at all', () => {
    expect(componentStats({ name: 'C' } as AtlasComponent))
      .toEqual({ scenarios: 0, verified: 0, failed: 0, unverified: 0 })
  })
})

describe('the component view never claims an unchecked example is correct', () => {
  it('labels a verified example as verified and shows its args', () => {
    // The control. Without it the "must not claim" specs pass against a
    // renderer that never offers an example.
    const out = renderComponent(
      catalog([{ name: 'Button', scenarios: [scenario('s', { args: { size: 'lg' },
        verify: { ok: true, checked: 2 } as never })] }]),
      'Button',
    )
    expect(out).toContain('correct (verified)')
    expect(out).toContain('"size":"lg"')
  })

  it('marks an UNCHECKED example as unverified, in those words', () => {
    // An assistant that reads "correct" stops checking. The offer is
    // still useful; the claim is what must be withheld.
    const out = renderComponent(
      catalog([{ name: 'Button', scenarios: [unchecked('s')] }]),
      'Button',
    )
    expect(out).toContain('UNVERIFIED')
    expect(out).not.toContain('correct (verified)')
  })

  it('offers nothing rather than an empty-args example', () => {
    // `{}` presented as an example teaches that the component takes no
    // props.
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [scenario('s', { args: {} })] }]),
      'B',
    )
    expect(out).toContain('No scenario with props')
  })

  it('prefers a VERIFIED example over an unverified one', () => {
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [
        scenario('un', { args: { bad: 1 }, verify: { ok: true, checked: 0 } as never }),
        scenario('ok', { args: { good: 2 }, verify: { ok: true, checked: 5 } as never }),
      ] }]),
      'B',
    )
    expect(out).toContain('correct (verified)')
    expect(out).toContain('"good":2')
  })

  it('does NOT offer a failing scenario as an example', () => {
    // Handing over args that are known to fail is the worst of the three
    // outcomes.
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [failing('bad', { a11y: { status: 'fail', findings: [] } })] }]),
      'B',
    )
    expect(out).not.toContain('correct (verified)')
    expect(out).not.toContain('UNVERIFIED —')
  })
})

describe('a failing check reaches the assistant, whatever it is called', () => {
  it('reports the message and the fix together', () => {
    // The fix is the actionable half; a diagnosis without one sends the
    // assistant looking.
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [failing('dark', {
        a11y: { status: 'fail', findings: [{ code: 'contrast', message: 'contrast 2.1:1', fix: 'use ink.strong' }] },
      })] }]),
      'B',
    )
    expect(out).toContain('avoid: "dark"')
    expect(out).toContain('contrast 2.1:1 → use ink.strong')
  })

  it('reports a check the collector was never told about', () => {
    // This is the shipped bug in assertion form: the collector used to
    // name five checks from a hand-written list, so `ssrParity` failures
    // were recorded in the catalog and dropped on the way out. Reading
    // keys off the verdict cannot go stale — a check invented tomorrow
    // is reported the day it lands.
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [failing('hydrate', {
        someCheckInventedLater: { status: 'fail', findings: [{ code: 'x', message: 'mismatch at <li>' }] },
      })] }]),
      'B',
    )
    expect(out).toContain('mismatch at <li>')
  })

  it('collects findings from EVERY failing check, not just the first', () => {
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [failing('multi', {
        a11y: { status: 'fail', findings: [{ code: 'a', message: 'first' }] },
        interaction: { status: 'fail', findings: [{ code: 'b', message: 'second' }] },
      })] }]),
      'B',
    )
    expect(out).toContain('first')
    expect(out).toContain('second')
  })

  it('ignores a check that PASSED or reported no findings', () => {
    // "avoid" lines for a passing check tell the assistant to work
    // around something that works.
    const out = renderComponent(
      catalog([{ name: 'B', scenarios: [failing('mixed', {
        a11y: { status: 'pass', findings: [{ code: 'a', message: 'should not appear' }] },
        interaction: { status: 'fail' },
      })] }]),
      'B',
    )
    expect(out).not.toContain('should not appear')
    expect(out).not.toContain('undefined')
  })

  it('says nothing for a scenario that was never checked', () => {
    // An unchecked scenario is not a failing one.
    const out = renderComponent(catalog([{ name: 'B', scenarios: [unchecked('u')] }]), 'B')
    expect(out).not.toContain('avoid:')
  })
})

describe('controls are described so the reactive ones are unmistakable', () => {
  it('formats each control kind', () => {
    // A reactive prop passed a VALUE silently freezes — the `()=>…`
    // marker is the only signal in the whole surface.
    expect(formatControl({ name: 'size', options: ['sm', 'lg'] } as never)).toBe('size(sm|lg)')
    expect(formatControl({ name: 'open', kind: 'boolean' } as never)).toBe('open(bool)')
    expect(formatControl({ name: 'count', kind: 'reactive' } as never)).toBe('count(()=>…)')
    expect(formatControl({ name: 'label', kind: 'string' } as never)).toBe('label(string)')
  })

  it('prefers options over kind when both are present', () => {
    expect(formatControl({ name: 'v', kind: 'string', options: ['a'] } as never)).toBe('v(a)')
  })

  it('ignores an EMPTY options array rather than rendering ()', () => {
    expect(formatControl({ name: 'v', kind: 'string', options: [] } as never)).toBe('v(string)')
  })

  it('separates required from optional and calls out the reactive ones', () => {
    const out = renderComponent(
      catalog([{ name: 'B', controls: [
        { name: 'label', kind: 'string', required: true },
        { name: 'size', kind: 'string' },
        { name: 'count', kind: 'reactive', reactive: true },
      ] }]),
      'B',
    )
    expect(out).toContain('required: label(string)')
    expect(out).toContain('optional: size(string), count(()=>…)')
    expect(out).toContain('pass a signal accessor, not a value')
    expect(out).toContain('count')
  })

  it('omits each section when it is empty', () => {
    const out = renderComponent(catalog([{ name: 'Bare' }]), 'Bare')
    expect(out).not.toContain('required:')
    expect(out).not.toContain('optional:')
    expect(out).not.toContain('reactive (')
    expect(out).not.toContain('undefined')
  })
})

describe('an unknown component name suggests rather than denies', () => {
  it('offers near matches, case-insensitively', () => {
    const out = renderComponent(catalog([{ name: 'ButtonGroup' }, { name: 'Card' }]), 'button')
    expect(out).toContain('Did you mean: ButtonGroup')
  })

  it('lists known names when nothing is close', () => {
    // An assistant told only "no such component" concludes it must build
    // one.
    const out = renderComponent(catalog([{ name: 'Card' }]), 'zzz')
    expect(out).toContain('Known: Card')
    expect(out).not.toContain('Did you mean')
  })
})

describe('the index stays honest about what was checked', () => {
  it('states the verified/failing/unverified split on every line', () => {
    const out = renderCatalogIndex(catalog([
      { name: 'A', summary: 'An A', tags: ['form'],
        controls: [{ name: 'x', kind: 'string' }],
        scenarios: [passing('p'), failing('f', {}), unchecked('u')] },
    ]))
    expect(out).toContain('## A [form]')
    expect(out).toContain('An A')
    expect(out).toContain('props: x(string)')
    expect(out).toContain('scenarios: 3 (1 verified, 1 failing, 1 unverified)')
    expect(out, 'the reader must not assume catalogued means checked')
      .toContain('Unverified means nothing')
  })

  it('renders a component with no tags, summary or controls', () => {
    const out = renderCatalogIndex(catalog([{ name: 'Bare' }]))
    expect(out).toContain('## Bare')
    expect(out).not.toContain('[]')
    expect(out).not.toContain('undefined')
  })

  it('filters by tag and lists the available tags when none match', () => {
    // A silent empty result reads as "no such components exist".
    const cat = catalog([{ name: 'A', tags: ['form'] }, { name: 'B', tags: ['nav', 'form'] }])
    expect(renderCatalogIndex(cat, 'nav')).toContain('## B')
    expect(renderCatalogIndex(cat, 'nav')).not.toContain('## A')
    const miss = renderCatalogIndex(cat, 'zzz')
    expect(miss).toContain('No components tagged "zzz"')
    expect(miss).toContain('form, nav')
  })

  it('reports "(none)" rather than an empty tag list', () => {
    const miss = renderCatalogIndex(catalog([{ name: 'A' }]), 'zzz')
    expect(miss).toContain('(none)')
  })

  it('tells the reader how to POPULATE an empty catalog', () => {
    // "The catalog is empty" with no next step leaves the assistant
    // guessing that the project has no components.
    expect(renderCatalogIndex(catalog([]))).toContain('atlas scan')
  })
})
