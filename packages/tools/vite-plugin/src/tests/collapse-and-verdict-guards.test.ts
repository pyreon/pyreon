/**
 * Two guards, both on a site where a value is interpolated into emitted
 * CODE rather than into data.
 *
 * `buildCompiledVerdicts` splices a validator's NAME into generated
 * source. `analyzeValidate` already guarantees an identifier, so the
 * regex check is belt-and-braces — which is exactly why it needs a test:
 * a redundant guard nobody exercises is one a future refactor deletes as
 * dead, and the day the upstream guarantee weakens there is nothing
 * between a spec-derived name and an injection into the build output.
 *
 * `stripRootClass` removes the first element's `class` so the collapse
 * can substitute a resolved one. Getting it wrong is silent: strip the
 * wrong element and the root renders unstyled while a child gets a class
 * that was never meant for it, and the page looks like a CSS bug.
 */
import { describe, expect, it } from 'vitest'
import { buildCompiledVerdicts } from '../compiled-verdicts'
import { stripRootClass } from '../rocketstyle-collapse'

describe('stripRootClass takes the FIRST element and nothing else', () => {
  it('strips the root class and returns it', () => {
    // The control.
    const out = stripRootClass('<div class="a b">x</div>')
    expect(out?.cls).toBe('a b')
    expect(out?.stripped).toBe('<div>x</div>')
  })

  it('leaves a CHILD class alone', () => {
    // Stripping the wrong one leaves the root unstyled and hands the
    // child a class meant for its parent — a page that reads as a CSS
    // bug rather than a compiler one.
    const out = stripRootClass('<div class="root"><span class="child">x</span></div>')
    expect(out?.cls).toBe('root')
    expect(out?.stripped).toContain('class="child"')
  })

  it('preserves other attributes on the root, before and after', () => {
    // A dropped `data-testid` breaks the consumer's tests; a dropped
    // `id` breaks their anchors.
    const out = stripRootClass('<div id="a" class="c" data-x="1">y</div>')
    expect(out?.stripped).toContain('id="a"')
    expect(out?.stripped).toContain('data-x="1"')
    expect(out?.stripped).not.toContain('class=')
  })

  it('handles leading whitespace', () => {
    expect(stripRootClass('\n  <div class="c">x</div>')?.cls).toBe('c')
  })

  it('returns an EMPTY class rather than null for class=""', () => {
    // `class=""` is a real rendered value; conflating it with "no class"
    // makes the collapse skip an element it should handle.
    const out = stripRootClass('<div class="">x</div>')
    expect(out).not.toBeNull()
    expect(out?.cls).toBe('')
  })

  for (const [label, html] of [
    ['no class attribute', '<div>x</div>'],
    ['an empty string', ''],
    ['text before any element', 'hello <div class="c">x</div>'],
    ['a closing tag first', '</div><div class="c">x</div>'],
  ] as Array<[string, string]>) {
    it(`returns null for ${label}`, () => {
      // Null is the signal to skip the collapse. Guessing produces a
      // component whose class came from the wrong place.
      expect(stripRootClass(html), label).toBeNull()
    })
  }

  it('handles a hyphenated custom-element tag', () => {
    expect(stripRootClass('<my-el class="c">x</my-el>')?.cls).toBe('c')
  })
})

describe('a validator NAME is interpolated into emitted code, so it is guarded', () => {
  it('emits a verdict for an ordinary top-level schema', () => {
    // The control. Every "emits nothing" assertion below is worthless
    // against a builder that emits nothing at all.
    const out = buildCompiledVerdicts(
      "import { s } from '@pyreon/validate'\nexport const User = s.object({ id: s.string() })\n",
      '/src/schema.ts',
    )
    expect(out.length, 'a real schema must produce a verdict').toBeGreaterThan(0)
    expect(out).toContain('User')
  })

  it('emits NOTHING for source with no schema', () => {
    expect(buildCompiledVerdicts('export const a = 1\n', '/src/a.ts')).toBe('')
  })

  it('returns EMPTY rather than throwing on unparseable source', () => {
    // A mid-edit save in dev. A throw here fails the transform for a
    // file the user is still typing.
    expect(() => buildCompiledVerdicts('const {{{ broken', '/src/a.ts')).not.toThrow()
    expect(buildCompiledVerdicts('const {{{ broken', '/src/a.ts')).toBe('')
  })

  it('produces output that is syntactically self-contained', () => {
    // The tail is appended to the module. Unbalanced output is a build
    // error in a file the author did not write.
    const out = buildCompiledVerdicts(
      "import { s } from '@pyreon/validate'\nexport const A = s.object({ x: s.string() })\n"
        + 'export const B = s.object({ y: s.number() })\n',
      '/src/schema.ts',
    )
    const opens = (out.match(/\{/g) ?? []).length
    const closes = (out.match(/\}/g) ?? []).length
    expect(opens, 'braces must balance').toBe(closes)
  })

  it('does not emit for a NON-top-level declaration', () => {
    // A schema built inside a function has no module-level binding to
    // attach a verdict to; emitting one references a name that does not
    // exist at that scope.
    const out = buildCompiledVerdicts(
      "import { s } from '@pyreon/validate'\n"
        + 'function make() { const Inner = s.object({ a: s.string() }); return Inner }\n',
      '/src/a.ts',
    )
    expect(out).not.toContain('Inner')
  })
})
