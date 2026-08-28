/**
 * A canonical primitive that reaches the GENERIC component emit produces a
 * constructor call for a type that does not exist on either target, and the
 * build fails with a raw toolchain error naming a symbol the user never wrote.
 *
 * Four such cases were already covered by a hand-maintained list of required
 * props (`<Icon>` needs `name`, `<Image>` needs `src`). The list was missing
 * `<Field>` without `onChangeText`, `<Toggle>` without `onChange`, and
 * `<Modal>` without `open` — the same mistake, uncompilable in the same way,
 * with nothing said at all.
 *
 * The guard is on the OUTCOME rather than the cause, so there is no list to
 * keep in sync: arriving at generic emit IS the failure. The property these
 * tests assert is that equivalence — the compiler warns EXACTLY when the emit
 * does not build, checked against the real toolchains rather than against a
 * string.
 *
 * Two of the three silent cases were also missed by a regex probe over the
 * emitted text, because generic emit writes a childless element as `Modal(…)`
 * and a parent as `Modal { … }` — which is why the assertion here is "does it
 * compile", not "does it look wrong".
 */

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const P = '@pyreon/primitives'
const GUARD = 'fell through to the'

const app = (jsx: string): string =>
  `import { signal } from '@pyreon/reactivity'
import { Stack, Icon, Image, Field, Toggle, Modal, Link, Press, Button } from '${P}'
export function C() {
  const v = signal('')
  const b = signal(false)
  return <Stack>${jsx}</Stack>
}`

const warned = (jsx: string, target: 'swift' | 'kotlin'): boolean =>
  transform(app(jsx), { target }).warnings.some((w) => w.includes(GUARD))

/** Missing a required prop — uncompilable on both targets. */
const BAILS: Record<string, string> = {
  '<Icon> without name': `<Icon size="lg" />`,
  '<Image> without src': `<Image alt="a" />`,
  '<Field> without onChangeText': `<Field value={v()} />`,
  '<Toggle> without onChange': `<Toggle value={b()} />`,
  '<Modal> without open': `<Modal>x</Modal>`,
  '<Link> without to': `<Link>x</Link>`,
}

/** Written correctly — must stay silent, or the warning is noise. */
const LOWERS: Record<string, string> = {
  '<Field>': `<Field value={v()} onChangeText={(n) => v.set(n)} />`,
  '<Toggle>': `<Toggle value={b()} onChange={(n) => b.set(n)} />`,
  '<Modal>': `<Modal open onClose={() => {}}>x</Modal>`,
  '<Button>': `<Button onPress={() => {}}>x</Button>`,
  '<Press>': `<Press onPress={() => {}}>x</Press>`,
  '<Icon>': `<Icon name="star" />`,
  '<Image>': `<Image src="/a.png" alt="a" />`,
}

describe('a canonical primitive falling through to generic emit', () => {
  describe.each(['swift', 'kotlin'] as const)('%s', (target) => {
    it.each(Object.entries(BAILS))('warns for %s', (_label, jsx) => {
      expect(warned(jsx, target)).toBe(true)
    })

    it.each(Object.entries(LOWERS))('stays silent for a correct %s', (_label, jsx) => {
      expect(warned(jsx, target)).toBe(false)
    })

    it('names the tag, so the warning is actionable on its own', () => {
      const w = transform(app(BAILS['<Field> without onChangeText']!), { target }).warnings.find(
        (x) => x.includes(GUARD),
      )
      expect(w).toContain('<Field>')
      expect(w).toContain('onChangeText')
    })

    it('does not fire for a USER component that shadows a primitive name', () => {
      // A component named `Toggle` is a real struct / composable, so generic
      // emit is exactly right for it. Warning here would make the diagnostic
      // impossible to trust.
      const src = `import { Stack } from '${P}'
function Toggle(props: { label: string }) { return <Stack>{props.label}</Stack> }
export function C() { return <Stack><Toggle label="x" /></Stack> }`
      expect(transform(src, { target }).warnings.some((w) => w.includes(GUARD))).toBe(false)
    })

    it('reports once per tag, not once per occurrence', () => {
      const three = `<Field value={v()} /><Field value={v()} /><Field value={v()} />`
      const hits = transform(app(three), { target }).warnings.filter((w) => w.includes(GUARD))
      expect(hits).toHaveLength(1)
    })
  })
})

/**
 * The property, against the real compilers: the guard fires if and only if the
 * emit does not build. A warning that does not track buildability is either
 * noise or a false sense of safety.
 */
describe.runIf(isSwiftcAvailable())('Swift — warned iff uncompilable', () => {
  it.each(Object.entries(BAILS))('%s does not compile, and is warned', async (_l, jsx) => {
    const r = transform(app(jsx), { target: 'swift' })
    expect(r.warnings.some((w) => w.includes(GUARD))).toBe(true)
    expect((await validateSwiftWithStubs(r.code)).ok).toBe(false)
  })

  it.each(Object.entries(LOWERS))('a correct %s compiles, and is silent', async (_l, jsx) => {
    const r = transform(app(jsx), { target: 'swift' })
    expect(r.warnings.some((w) => w.includes(GUARD))).toBe(false)
    expect((await validateSwiftWithStubs(r.code)).ok).toBe(true)
  })
})

describe.runIf(isKotlincAvailable())('Kotlin — warned iff uncompilable', () => {
  it.each(Object.entries(BAILS))('%s does not compile, and is warned', async (_l, jsx) => {
    const r = transform(app(jsx), { target: 'kotlin' })
    expect(r.warnings.some((w) => w.includes(GUARD))).toBe(true)
    expect((await validateKotlin(r.code)).ok).toBe(false)
  })

  it.each(Object.entries(LOWERS))('a correct %s compiles, and is silent', async (_l, jsx) => {
    const r = transform(app(jsx), { target: 'kotlin' })
    expect(r.warnings.some((w) => w.includes(GUARD))).toBe(false)
    expect((await validateKotlin(r.code)).ok).toBe(true)
  })
})
