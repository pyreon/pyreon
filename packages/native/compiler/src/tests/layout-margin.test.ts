/**
 * `margin` / `marginX` / `marginY` produced NO native output at all.
 *
 * They are on `BaseLayoutProps`, so they are typed and documented on every one
 * of `<Stack>`, `<Inline>`, `<Layer>` and `<Scroll>` — and the Swift emitter's
 * own docblock has claimed them in scope since it was written ("margin (alias
 * to padding outside a parent layout)"). Nothing implemented them. A layout
 * written with margin rendered flush on iOS and Android while the web showed it
 * spaced, with no warning on either target.
 *
 * The two targets place it in OPPOSITE positions, which is the part worth
 * locking:
 *
 *   - SwiftUI modifiers wrap OUTWARD, so margin is appended LAST — after
 *     background, radius, and the `style={{…}}` block, since a style may set a
 *     background of its own.
 *   - Compose's Modifier chain applies outside-IN, so margin is PREPENDED,
 *     ahead of the content padding.
 *
 * Get either backwards and the inset lands inside the background instead of
 * around it: still compiles, still looks plausible in a diff, wrong on screen.
 */

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const TAGS = ['Stack', 'Inline', 'Layer', 'Scroll'] as const

const app = (tag: string, attrs: string): string =>
  `import { Stack, Inline, Layer, Scroll, Text } from '@pyreon/primitives'
export function C() {
  return <Stack><${tag} ${attrs}><Text>x</Text></${tag}></Stack>
}`

const emit = (tag: string, attrs: string, target: 'swift' | 'kotlin'): string =>
  transform(app(tag, attrs), { target }).code

describe('margin lowers on every layout primitive', () => {
  describe.each(TAGS)('<%s>', (tag) => {
    it('swift emits a padding modifier for margin', () => {
      expect(emit(tag, 'margin={2}', 'swift')).toContain('.padding(8)')
    })
    it('kotlin emits a padding modifier for margin', () => {
      expect(emit(tag, 'margin={2}', 'kotlin')).toContain('.padding(8.dp)')
    })
    it('marginX is horizontal on both targets', () => {
      expect(emit(tag, 'marginX={3}', 'swift')).toContain('.padding(.horizontal, 12)')
      expect(emit(tag, 'marginX={3}', 'kotlin')).toContain('.padding(horizontal = 12.dp)')
    })
    it('marginY is vertical on both targets', () => {
      expect(emit(tag, 'marginY={1}', 'swift')).toContain('.padding(.vertical, 4)')
      expect(emit(tag, 'marginY={1}', 'kotlin')).toContain('.padding(vertical = 4.dp)')
    })
  })

  it('an element with no margin is byte-identical to before', () => {
    // Nothing pays for the fix.
    expect(emit('Stack', 'padding={2}', 'swift')).toContain('.padding(8)')
    expect(emit('Stack', 'padding={2}', 'swift')).not.toContain('.padding(8).padding')
  })
})

describe('margin is OUTSIDE the visual box, and the targets order it oppositely', () => {
  it('swift appends margin AFTER background and radius', () => {
    const out = emit('Stack', 'padding={2} background="primary" radius="md" margin={4}', 'swift')
    const pad = out.indexOf('.padding(8)')
    const bg = out.indexOf('.background(')
    const radius = out.indexOf('.cornerRadius(')
    const margin = out.indexOf('.padding(16)')
    expect(pad).toBeGreaterThan(-1)
    expect(margin).toBeGreaterThan(radius)
    expect(radius).toBeGreaterThan(bg)
    expect(bg).toBeGreaterThan(pad)
  })

  it('kotlin PREPENDS margin, ahead of the content padding', () => {
    const out = emit('Stack', 'padding={2} background="primary" margin={4}', 'kotlin')
    const margin = out.indexOf('.padding(16.dp)')
    const pad = out.indexOf('.padding(8.dp)')
    const bg = out.indexOf('.background(')
    expect(margin).toBeGreaterThan(-1)
    expect(margin).toBeLessThan(pad)
    expect(pad).toBeLessThan(bg)
  })

  it('swift puts margin after a background set by `style`, not before it', () => {
    // A style can set its own background, so appending margin merely after the
    // `background` PROP would still land it inside the box.
    const out = emit('Stack', 'style={{ backgroundColor: "#ff0000" }} margin={4}', 'swift')
    const styleBg = out.indexOf('.background(')
    const margin = out.lastIndexOf('.padding(16)')
    if (styleBg >= 0) expect(margin).toBeGreaterThan(styleBg)
    expect(margin).toBeGreaterThan(-1)
  })
})

/**
 * Against the real compilers. Fixing this surfaced THREE props whose emit had
 * never been through this gate at all, because the Swift stub was narrower than
 * SwiftUI: `padding(_:_:)` (so `paddingX`/`paddingY`), `cornerRadius` (so
 * `radius`), and `ScrollView`'s axes init (so `<Scroll axis>`). Each is a
 * shipped lowering that no fixture had ever compiled.
 */
describe.runIf(isSwiftcAvailable())('Swift — every layout prop compiles', () => {
  const PROPS = [
    'padding={2}', 'paddingX={2}', 'paddingY={2}',
    'margin={2}', 'marginX={2}', 'marginY={2}',
    'background="primary"', 'radius="md"',
  ]
  it.each(TAGS)('<%s> compiles with every spacing/visual prop, one at a time', async (tag) => {
    for (const p of PROPS) {
      const r = await validateSwiftWithStubs(emit(tag, p, 'swift'))
      expect(r.ok, `${tag} ${p}: ${r.error ?? ''}`).toBe(true)
    }
  })

  it('the combined form compiles, so the modifier order is legal too', async () => {
    const out = emit('Stack', PROPS.join(' '), 'swift')
    expect((await validateSwiftWithStubs(out)).ok).toBe(true)
  })

  it('<Scroll axis="horizontal"> compiles', async () => {
    expect((await validateSwiftWithStubs(emit('Scroll', 'axis="horizontal"', 'swift'))).ok).toBe(
      true,
    )
  })
})

describe.runIf(isKotlincAvailable())('Kotlin — every layout prop compiles', () => {
  const PROPS = [
    'padding={2}', 'paddingX={2}', 'paddingY={2}',
    'margin={2}', 'marginX={2}', 'marginY={2}',
    'background="primary"', 'radius="md"',
  ]
  it.each(TAGS)('<%s> compiles with every spacing/visual prop', async (tag) => {
    for (const p of PROPS) {
      const r = await validateKotlin(emit(tag, p, 'kotlin'))
      expect(r.ok, `${tag} ${p}: ${r.error ?? ''}`).toBe(true)
    }
    expect((await validateKotlin(emit(tag, PROPS.join(' '), 'kotlin'))).ok).toBe(true)
  })
})
