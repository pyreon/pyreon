/**
 * `qualifyIdentities` keeps same-named components apart by the directory they
 * live in. A third colliding component must qualify against the SAME escalation
 * the first two used, a component that already carries a qualifier keeps it,
 * and components that never collide are returned untouched.
 */
import { describe, expect, it } from 'vitest'
import type { ComponentIntelligence } from '../types'
import { qualifyIdentities } from '../graph'

const c = (name: string, source?: string, extra: Partial<ComponentIntelligence> = {}): ComponentIntelligence =>
  ({ name, props: [], controls: [], scenarios: [], ...(source ? { source } : {}), ...extra }) as ComponentIntelligence
const qualifiers = (xs: ComponentIntelligence[]) => xs.map((x) => x.pathQualifier)

describe('qualifyIdentities', () => {
  it('qualifies two colliding names by directory', () => {
    expect(qualifiers(qualifyIdentities([c('Button', 'src/a/Button.tsx'), c('Button', 'src/b/Button.tsx')]))).toEqual([
      'src/a',
      'src/b',
    ])
  })

  it('a third collision qualifies the same way, not by falling back to the file', () => {
    const out = qualifyIdentities([
      c('Button', 'src/a/Button.tsx'),
      c('Button', 'src/b/Button.tsx'),
      c('Button', 'src/c/Button.tsx'),
    ])
    expect(qualifiers(out)).toEqual(['src/a', 'src/b', 'src/c'])
  })

  it('returns components that never collide untouched, source or not', () => {
    const input = [c('Button'), c('Card')]
    const out = qualifyIdentities(input)
    expect(out).toEqual(input)
    expect(qualifiers(out)).toEqual([undefined, undefined])
  })

  it('keeps a qualifier a component already carries', () => {
    const out = qualifyIdentities([c('Button', 'src/a/Button.tsx', { pathQualifier: 'keep' }), c('Button', 'src/b/Button.tsx')])
    expect(out[0]?.pathQualifier).toBe('keep')
  })
})
