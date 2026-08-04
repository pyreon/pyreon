/**
 * Render extensions — the composable answer to "what does this need to render
 * like my app?".
 *
 * The single `wrapper` it replaces could only ever hold one provider: a second
 * one silently won, so two packages could not both contribute and no package
 * could ship its own setup at all.
 */
import { describe, expect, it } from 'vitest'
import {
  defineExtension,
  resolveExtensions,
  validateExtension,
  validateExtensions,
} from '../extension'

const wrap = (() => null) as never

describe('defineExtension', () => {
  it('returns the object unchanged — it exists for the types', () => {
    const extension = { name: 'theme', wrap }
    expect(defineExtension(extension)).toBe(extension)
  })
})

describe('validateExtension', () => {
  it('accepts a wrap-only extension', () => {
    expect(validateExtension({ name: 'theme', wrap }, 0)).toBeUndefined()
  })

  it('accepts a setup-only extension', () => {
    // Document-level work — a font link, a global stylesheet — has no wrapper.
    expect(validateExtension({ name: 'fonts', setup: () => {} }, 0)).toBeUndefined()
  })

  it('requires a name, because an anonymous failure is unattributable', () => {
    // When one of five wrappers throws during mount, every scenario fails. The
    // name is the difference between a fix and a bisect.
    expect(validateExtension({ wrap }, 2)).toContain('needs a non-empty string `name`')
  })

  it('rejects a non-function wrap rather than mounting it', () => {
    // Mounting a non-component takes EVERY scenario down — the most expensive
    // failure available from the cheapest typo.
    expect(validateExtension({ name: 'x', wrap: 'nope' }, 0)).toContain('must be a component')
  })

  it('rejects an extension that would do nothing', () => {
    // Almost always a factory called with wrong options. Saying so beats a
    // silent no-op the author will not think to question.
    expect(validateExtension({ name: 'x' }, 0)).toContain('would do nothing')
  })

  it('names the INDEX, so a long list is navigable', () => {
    expect(validateExtension({}, 3)).toContain('extensions[3]')
  })
})

describe('validateExtensions', () => {
  it('accepts a well-formed list', () => {
    expect(validateExtensions([{ name: 'a', wrap }, { name: 'b', wrap }])).toBeUndefined()
  })

  it('rejects a non-array', () => {
    expect(validateExtensions({ name: 'a' })).toContain('must be an array')
  })

  it('rejects a DUPLICATE name', () => {
    // Usually the same preset added twice — by a copy-paste, or by two packages
    // both pulling it in. Two theme providers is a real bug with baffling
    // symptoms.
    expect(validateExtensions([{ name: 'ui', wrap }, { name: 'ui', wrap }])).toContain('duplicate')
  })

  it('an empty list is fine', () => {
    expect(validateExtensions([])).toBeUndefined()
  })
})

describe('resolveExtensions', () => {
  const a = { name: 'a', wrap }
  const b = { name: 'b', wrap }

  it('keeps declaration order — first listed is outermost', () => {
    // The order the equivalent JSX would be written by hand: a theme provider
    // is written before the router it contains, so it is listed first.
    expect(resolveExtensions({ extensions: [a, b] }).map((e) => e.name)).toEqual(['a', 'b'])
  })

  it('appends `wrapper` as the INNERMOST layer', () => {
    // So an extension list can put a theme OUTSIDE a project's existing
    // wrapper without that wrapper having to change.
    const resolved = resolveExtensions({ extensions: [a], wrapper: wrap })
    expect(resolved.map((e) => e.name)).toEqual(['a', 'wrapper'])
  })

  it('handles the wrapper-only config that every project starts from', () => {
    expect(resolveExtensions({ wrapper: wrap }).map((e) => e.name)).toEqual(['wrapper'])
  })

  it('is empty when a config configures neither', () => {
    expect(resolveExtensions({})).toEqual([])
  })
})
