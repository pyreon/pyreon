// `useUrlState` binds ONE router search parameter, on both targets.
//
// The prerequisite was a real bug: PyreonRouter advertised `query` in its
// header on both platforms and implemented none of it, so a path carrying
// `?…` went into matchPath whole. That is fixed in the router packages; this
// covers the compiler half.
//
// The helper type is emitted INLINE rather than shipped as a co-located
// runtime because it needs the ACTIVE router — a standalone runtime would have
// to import PyreonRouter and stop being self-contained. Same reasoning as
// `PyreonSchemaError`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const q = useUrlState('q', 'all'); return (<Stack><Text>{q()}</Text></Stack>) }`

describe('useUrlState lowering', () => {
  it('binds the parameter through the router (Swift)', () => {
    const { code } = transform(SRC, { target: 'swift' })
    expect(code).toContain('struct PyreonUrlState')
    expect(code).toContain('PyreonUrlState(router: pyreonRouter, key: "q", defaultValue: "all")')
    // Optional-chained: the environment router IS optional, so a component
    // rendered outside a RouterProvider degrades to the default rather than
    // crashing — the same choice useNavigate/useParams make.
    expect(code).toContain('router?.setQueryParam(key, value)')
  })

  it('binds the parameter through the router (Kotlin)', () => {
    const { code } = transform(SRC, { target: 'kotlin' })
    expect(code).toContain('class PyreonUrlState')
    expect(code).toContain('PyreonUrlState(useRouter(), "q", "all")')
    expect(code).toContain('router.setQueryParam(key, value)')
  })

  // The call shape is what keeps shared source shared: `q()` reads on the web,
  // and must read on both native targets too. Emitting a bare `q` would
  // interpolate the container instead of the value — wrong, and silent.
  it('preserves the CALL, so `q()` reads the value on both targets', () => {
    expect(transform(SRC, { target: 'swift' }).code).toContain('\\(q())')
    expect(transform(SRC, { target: 'kotlin' }).code).toContain('${q()}')
  })

  it('no longer warns, now that the binding lowers', () => {
    expect(transform(SRC, { target: 'swift' }).warnings).toHaveLength(0)
    expect(transform(SRC, { target: 'kotlin' }).warnings).toHaveLength(0)
  })

  // v1 is string-valued. Coercing a number silently would be worse than
  // leaving it to the unlowered-hook diagnostic, so it declines WITH a reason.
  it('declines a non-string default rather than coercing it', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const p = useUrlState('page', 1); return (<Stack />) }`
    const { code, warnings } = transform(src, { target: 'swift' })
    expect(code).not.toContain('PyreonUrlState(')
    expect(warnings.some((w) => w.includes('STRING default'))).toBe(true)
  })

  // A dynamic key cannot be baked into the emit — the same conservative rule
  // useFetch applies to its URL and useStorage to its key.
  it('declines a non-literal key', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack } from '@pyreon/primitives'
export function C() { const k = 'q'; const v = useUrlState(k, ''); return (<Stack />) }`
    expect(transform(src, { target: 'swift' }).code).not.toContain('PyreonUrlState(')
  })

  // The helper is emitted once per file, not once per binding.
  it('emits the helper exactly once for two bindings', () => {
    const src = `import { useUrlState } from '@pyreon/url-state'
import { Stack, Text } from '@pyreon/primitives'
export function C() { const a = useUrlState('a', ''); const b = useUrlState('b', ''); return (<Stack><Text>{a()}{b()}</Text></Stack>) }`
    const { code } = transform(src, { target: 'swift' })
    expect(code.split('struct PyreonUrlState').length - 1).toBe(1)
  })
})
