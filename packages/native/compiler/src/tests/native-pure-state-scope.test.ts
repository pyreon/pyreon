import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const imports = `import { useCounter, useToggle } from '@pyreon/hooks'
import { Button } from '@pyreon/primitives'`
const component = (name: string, hook: string, methods: string, read: string) => `
export function ${name}() {
  const state = ${hook}
  return <Button onPress={() => { ${methods} }}>{${read}}</Button>
}`
const counter = component(
  'First',
  'useCounter(2, { min: 1, max: 3 })',
  'state.inc(); state.reset()',
  'state.count()',
)
const otherCounter = component(
  'Second',
  'useCounter(20, { min: 10, max: 30 })',
  'state.dec(); state.reset()',
  'state.count()',
)
const toggle = component(
  'Second',
  'useToggle(false)',
  'state.toggle(); state.setTrue()',
  "state.value() ? 'yes' : 'no'",
)
const unbounded = component(
  'Second',
  'useCounter(7)',
  'state.set(100); state.reset()',
  'state.count()',
)
const pairs = [
  { name: 'distinct counter bounds and reset values', first: counter, second: otherCounter },
  { name: 'counter and toggle share a local name', first: counter, second: toggle },
  { name: 'bounded and unbounded counters share a local name', first: counter, second: unbounded },
]

function block(code: string, name: string, target: 'swift' | 'kotlin') {
  const marker = (n: string) =>
    target === 'swift' ? `struct ${n}: View {` : `@Composable\nfun ${n}() {`
  const start = code.indexOf(marker(name))
  expect(start).toBeGreaterThanOrEqual(0)
  const other = code.indexOf(marker(name === 'First' ? 'Second' : 'First'), start + 1)
  return code.slice(start, other < 0 ? undefined : other).trim()
}

// Compile real source through the public transform, both alone and together.
// Component-local semantics must not depend on unrelated declaration order.
it.each(['swift', 'kotlin'] as const)(
  '%s isolates pure-state metadata in every component',
  (target) => {
    for (const { name, first, second } of pairs) {
      const aloneFirst = transform(`${imports}${first}`, { target })
      const aloneSecond = transform(`${imports}${second}`, { target })
      for (const ordered of [first + second, second + first]) {
        const together = transform(`${imports}${ordered}`, { target })
        expect(together.warnings, name).toEqual([])
        expect
          .soft(block(together.code, 'First', target), name)
          .toBe(block(aloneFirst.code, 'First', target))
        expect
          .soft(block(together.code, 'Second', target), name)
          .toBe(block(aloneSecond.code, 'Second', target))
      }
    }
  },
)

it.each(['swift', 'kotlin'] as const)(
  '%s is independent of earlier files and transforms',
  (target) => {
    const source = `${imports}${counter}${toggle}`
    const fresh = transform(source, { target })
    transform(`${imports}${otherCounter}`, { target })
    expect(transform(source, { target })).toEqual(fresh)
  },
)

it('mixed same-named hooks compile through real kotlinc', (ctx) => {
  if (!isKotlincAvailable()) return ctx.skip()
  const result = validateKotlin(
    transform(`${imports}${counter}${toggle}`, { target: 'kotlin' }).code,
  )
  expect(result.ok, result.error ?? '').toBe(true)
})

it('mixed same-named hooks typecheck through real swiftc', (ctx) => {
  if (!isSwiftcAvailable()) return ctx.skip()
  const result = validateSwiftWithStubs(
    transform(`${imports}${counter}${toggle}`, { target: 'swift' }).code,
  )
  expect(result.ok, result.error ?? '').toBe(true)
})
