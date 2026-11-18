/**
 * `url-state-debounce-ms`: renames the removed `useUrlState` option `debounce`
 * to `debounceMs`, only inside the options literal of a `useUrlState` call
 * imported from `@pyreon/url-state`.
 *
 * Bisect-verified: with the property edit removed from the transform, the
 * rewrite specs return `null`.
 */
import { describe, expect, it } from 'vitest'
import { CODEMODS, selectCodemods } from '../codemods'
import { urlStateDebounceMs } from '../codemods/url-state-debounce-ms'

const run = (src: string, path = 'a.ts') => urlStateDebounceMs.transform(src, path)
const imp = `import { useUrlState } from '@pyreon/url-state'\n`

describe('url-state-debounce-ms', () => {
  it('renames the option in single-param and schema mode, keeping quote style', () => {
    const src = `${imp}const q = useUrlState('q', '', { debounce: 300 })\nconst s = useUrlState({ a: 1 }, { "debounce": 50, replace: false })\n`
    expect(run(src)).toBe(
      `${imp}const q = useUrlState('q', '', { debounceMs: 300 })\nconst s = useUrlState({ a: 1 }, { "debounceMs": 50, replace: false })\n`,
    )
  })

  it('expands a shorthand property and follows an aliased import', () => {
    const src = `import { useUrlState as u } from '@pyreon/url-state'\nconst debounce = 200\nconst q = u('q', '', { debounce })\n`
    expect(run(src)).toContain(`u('q', '', { debounceMs: debounce })`)
  })

  it('handles TSX sources', () => {
    const src = `${imp}export const C = () => { const q = useUrlState('q', '', { debounce: 1 }); return <div>{q()}</div> }\n`
    expect(run(src, 'a.tsx')).toContain(`{ debounceMs: 1 }`)
  })

  it('leaves default values, ambiguous calls, other functions and migrated code alone', () => {
    // A default value that happens to have a `debounce` key is not the options.
    expect(run(`${imp}const f = useUrlState('f', { debounce: 3 })\n`)).toBeNull()
    // Two arguments, first not a literal: the second may be a default.
    expect(run(`${imp}const f = useUrlState(key, { debounce: 3 })\n`)).toBeNull()
    // Not imported from @pyreon/url-state.
    expect(run(`import { useUrlState } from './mine'\nuseUrlState('q', '', { debounce: 3 })\n`)).toBeNull()
    expect(run(`${imp}other('q', '', { debounce: 3 })\n`)).toBeNull()
    // Idempotent, and an object that already has debounceMs is not touched.
    expect(run(`${imp}useUrlState('q', '', { debounceMs: 3 })\n`)).toBeNull()
    expect(run(`${imp}useUrlState('q', '', { debounceMs: 3, debounce: 3 })\n`)).toBeNull()
  })

  it('is registered and selected for an upgrade across 0.54.0', () => {
    expect(CODEMODS).toContain(urlStateDebounceMs)
    expect(selectCodemods('0.53.0', '0.54.0').map((c) => c.id)).toContain('url-state-debounce-ms')
    expect(selectCodemods('0.54.0', '0.55.0').map((c) => c.id)).not.toContain('url-state-debounce-ms')
  })
})
