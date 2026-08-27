import { describe, expect, it } from 'vitest'
import { transform } from '../index'

/**
 * `useUrlState`'s key is BAKED into the native emit, so it has to be known at
 * build time. It used to require an INLINE literal, and anything else took a
 * bare `return null` — dropping the whole declaration with no warning, which
 * left every later reference pointing at a binding that no longer existed. Both
 * targets then failed to compile (`unresolved reference 'v'`) with nothing
 * naming the cause.
 *
 * A shared key constant is the ordinary way to write this — the reader and
 * whatever writes the param both want the same string — so a module-scope
 * `const` now resolves. What still cannot be known warns by name.
 */
const P = '@pyreon/primitives'

const app = (pre: string, call: string): string => `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '${P}'
${pre}
export function C() {
  const v = ${call}
  return <Stack><Text>{String(v())}</Text></Stack>
}`

const run = (pre: string, call: string, target: 'swift' | 'kotlin' = 'kotlin') =>
  transform(app(pre, call), { target })

describe('useUrlState key resolution', () => {
  it.each(['swift', 'kotlin'] as const)('%s: an inline literal key still lowers', (t) => {
    const r = run('', `useUrlState('q', '')`, t)
    expect(r.code).toMatch(/query|Query/)
    expect(r.warnings).toEqual([])
  })

  it.each(['swift', 'kotlin'] as const)('%s: a module-scope const key lowers too', (t) => {
    const r = run(`const FILTER_KEY = 'filter'`, `useUrlState(FILTER_KEY, '')`, t)
    expect(r.warnings).toEqual([])
    // The RESOLVED value is what gets baked, not the identifier.
    expect(r.code).toContain('"filter"')
    // and the binding exists, which is the half that used to vanish
    expect(r.code).toMatch(/\bv\b/)
  })

  it('an exported const key resolves as well', () => {
    const r = run(`export const FILTER_KEY = 'filter'`, `useUrlState(FILTER_KEY, '')`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"filter"')
  })

  it('a no-interpolation template const resolves — it is a string spelled differently', () => {
    const r = run('const K = `filter`', `useUrlState(K, '')`)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"filter"')
  })

  it('an UNRESOLVABLE key warns by name instead of vanishing', () => {
    // `let` is deliberately not collected: it can be reassigned, so baking its
    // initial value would emit a stale key.
    const r = run(`let k = 'filter'`, `useUrlState(k, '')`)
    expect(r.warnings.length).toBe(1)
    expect(r.warnings[0]).toContain('statically-known key')
    expect(r.warnings[0]).toContain('module-scope')
  })

  it('a computed key warns rather than dropping the declaration', () => {
    const r = run(`const base = 'fil'`, `useUrlState(base + 'ter', '')`)
    expect(r.warnings.length).toBe(1)
    expect(r.warnings[0]).toContain('statically-known key')
  })

  it('the default-value warning reports the RESOLVED key, not the identifier', () => {
    // Otherwise the message names a symbol rather than the key it stands for.
    const r = run(`const TAGS = 'tags'`, `useUrlState(TAGS, [])`)
    expect(r.warnings[0]).toContain('"tags"')
    expect(r.warnings[0]).not.toContain('TAGS')
  })
})

/**
 * The same rule, applied to the other hooks that BAKE a string. `useUrlState`
 * was the one that dropped its declaration silently; these three warned by
 * name, which is the right tier — but "must be a string LITERAL" was never the
 * actual requirement. Statically KNOWABLE is, and a module-scope const is.
 */
describe('other baked-string hooks accept a module-scope const', () => {
  const mk = (imp: string, pre: string, body: string): string =>
    `${imp}\nimport { Stack, Text } from '@pyreon/primitives'\n${pre}\nexport function C() {\n  ${body}\n  return <Stack><Text>x</Text></Stack>\n}`

  it('useStorage resolves a const key and bakes the VALUE', () => {
    const r = transform(
      mk(`import { useStorage } from '@pyreon/storage'`, `const THEME_KEY = 'theme'`, `const t = useStorage(THEME_KEY, 'light')`),
      { target: 'kotlin' },
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"theme"')
  })

  it('useStorage still refuses a key it cannot know', () => {
    const r = transform(
      mk(`import { useStorage } from '@pyreon/storage'`, `let k = 'theme'`, `const t = useStorage(k, 'light')`),
      { target: 'kotlin' },
    )
    expect(r.warnings.some((w) => w.includes('statically-known key'))).toBe(true)
  })

  it('createI18n resolves a const locale — and the knock-on warning goes with it', () => {
    // While createI18n declined, its config object fell through to the generic
    // expression path and drew a SECOND warning about an unsynthesizable
    // literal. That one was never about the locale; it disappears once the
    // declaration lowers, which is worth pinning so nobody chases it later.
    const r = transform(
      mk(
        `import { createI18n } from '@pyreon/i18n'`,
        `const DEFAULT_LOCALE = 'en'`,
        `const i = createI18n({ locale: DEFAULT_LOCALE, messages: { en: { hi: 'Hi' } } })`,
      ),
      { target: 'kotlin' },
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"en"')
  })
})
