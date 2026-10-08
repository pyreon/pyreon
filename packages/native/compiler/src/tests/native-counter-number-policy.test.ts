import { transform } from '../index'
import { validateSwiftWithStubs, validateKotlin } from './first-party-plugins'

const fixtures = [
  {
    name: 'large exponential numbers',
    init: '1e21',
    bounds: ', { min: 0, max: 2e21 }',
    body: 'c.inc(); c.reset()',
  },
  { name: 'fractional seed', init: '0.25', bounds: '', body: 'c.inc(); c.dec(1); c.reset()' },
  {
    name: 'fractional bound',
    init: '0',
    bounds: ', { min: 0.25, max: 2 }',
    body: 'c.inc(); c.set(1); c.reset()',
  },
  {
    name: 'fractional mutation',
    init: '0',
    bounds: ', { min: 0, max: 3 }',
    body: 'c.inc(0.5); c.dec(1); c.set(2); c.reset()',
  },
  {
    name: 'typed fractional source',
    init: '0',
    bounds: '',
    body: 'c.inc(step()); c.set(2)',
    head: 'const step = signal(0.25)',
  },
]

describe.each(['swift', 'kotlin'] as const)('counter numeric policy on %s', (target) => {
  it.each(fixtures)('compiles $name with integral defaults and reset preserved', (fixture) => {
    const source = `import { useCounter } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Button } from '@pyreon/primitives'
export function App() {
  ${fixture.head ?? ''}
  const c = useCounter(${fixture.init}${fixture.bounds})
  return <Button onPress={() => { ${fixture.body} }}>{c.count()}</Button>
}`
    const out = transform(source, { target })
    expect(out.warnings).toEqual([])
    const verdict = target === 'swift' ? validateSwiftWithStubs(out.code) : validateKotlin(out.code)
    expect(verdict.ok, verdict.error).toBe(true)
  })
})
