// Whole-class follow-up to the Text value-interpolation arrow-unwrap fix:
// EVERY emit path that READS a JSX value must unwrap a zero-arg accessor arrow
// (`() => expr`), the same way `<Show when>` / `.disabled` already do.
//
// Two sibling paths still emitted a native closure/lambda from an accessor:
//
//   * `emitSwiftSignalRead` / `emitKotlinSignalRead` — the value-READ helper —
//     did NOT unwrap. Most callers pre-unwrap; `<Image src={() => url()} />` did
//     not, so it emitted Swift `URL(string: { url })` (a type error: closure vs
//     String) and Kotlin `AsyncImage(model = { url })` (a lambda as the Coil
//     model — renders nothing). Fix: unwrap INSIDE the helper (idempotent for
//     the pre-unwrapping callers; removes the "remember to unwrap" footgun).
//
//   * `kotlinTextArg` (the Heading-only Kotlin text builder, a parallel of the
//     Text loop) did NOT unwrap → `<Heading>{() => sig()}</Heading>` emitted
//     `Text(text = "${{ sig }}", …)` — a lambda in the string template →
//     renders the lambda's toString at runtime. (Swift Heading reuses the shared
//     `emitSwiftTextCore`, so it has no twin here.)
//
// The closure/lambda forms COMPILE — swiftc's Image case is a real type error,
// but the Kotlin cases only misrender at runtime — so the string-shape
// assertions (closure form ABSENT) are the load-bearing ones.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const app = (jsx: string) => `import { Stack, Heading, Image } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const sig = signal('s')
  const url = signal('http://x/i.png')
  return (<Stack>${jsx}</Stack>)
}`

const line = (jsx: string, target: 'swift' | 'kotlin', match: RegExp) =>
  transform(app(jsx), { target }).code.split('\n').find((l) => match.test(l)) ?? ''

describe('value-read paths unwrap the accessor arrow (Image src + Kotlin Heading)', () => {
  it('Image src={() => url()} reads the value, not a closure/lambda', () => {
    const sw = line('<Image src={() => url()} />', 'swift', /AsyncImage|URL\(string/)
    expect(sw).toContain('URL(string: url)')
    expect(sw).not.toMatch(/\{ url \}/)
    const kt = line('<Image src={() => url()} />', 'kotlin', /AsyncImage/)
    expect(kt).toContain('model = url')
    expect(kt).not.toMatch(/\{ url \}/)
  })

  it('Kotlin Heading {() => sig()} reads the value, not a lambda ${{ … }}', () => {
    const kt = line('<Heading>{() => sig()}</Heading>', 'kotlin', /Text\(/)
    expect(kt).toContain('text = "${sig}"')
    expect(kt).not.toMatch(/\$\{\{/)
  })

  it('bare forms are unchanged (no regression)', () => {
    expect(line('<Image src={url()} />', 'swift', /URL\(string/)).toContain('URL(string: url)')
    expect(line('<Image src={url()} />', 'kotlin', /AsyncImage/)).toContain('model = url')
    expect(line('<Heading>{sig()}</Heading>', 'kotlin', /Text\(/)).toContain('text = "${sig}"')
  })

  // Compile-PROOF. The Swift Image case was a genuine compile ERROR before the
  // fix (closure passed to a String parameter); the others compiled but
  // misrendered — so this proves the fix stays type-clean on both toolchains.
  it.skipIf(!isSwiftcAvailable())('Swift: Image-src emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(app('<Image src={() => url()} />'), { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: Image-src + Heading emits compile on kotlinc', () => {
    const img = validateKotlin(transform(app('<Image src={() => url()} />'), { target: 'kotlin' }).code)
    expect(img.ok, img.error ?? '').toBe(true)
    const head = validateKotlin(transform(app('<Heading>{() => sig()}</Heading>'), { target: 'kotlin' }).code)
    expect(head.ok, head.error ?? '').toBe(true)
  })
})
