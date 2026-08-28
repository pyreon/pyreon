/**
 * `<Image fit>` on Swift applied to BUNDLED assets and silently did nothing for
 * a REMOTE url — one prop, one platform, two answers depending on the shape of
 * an unrelated attribute. Kotlin implemented both, so the same source rendered
 * differently per platform with no warning.
 *
 * It was a documented deferral, and the reasoning was sound as far as it went:
 * a remote `AsyncImage(url:)` hands back a view whose inner Image is NOT
 * resizable, so nothing applied on the outside can scale it — the content
 * closure is the only place `.resizable()` can reach. What was wrong was the
 * comparison it justified itself with, "mirroring how `justify` is handled on
 * `<Stack>`": `justify` WARNS by name, and it is dropped on BOTH targets.
 * Silent, and asymmetric, is a different tier entirely.
 *
 * Two more divergences fell out of writing it down:
 *
 *  - `fill` mapped to `.scaledToFill()`, which preserves the aspect ratio and
 *    crops — that is `cover`. CSS `fill` distorts, and so does Kotlin's
 *    `ContentScale.FillBounds`, so `fit="fill"` and `fit="cover"` were
 *    indistinguishable on iOS alone.
 *  - a remote image with NO `fit` rendered at intrinsic size on Swift, while
 *    web (`props.fit ?? 'cover'`) and the bundled branch both default to cover.
 */

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const REMOTE = 'https://x.test/a.png'
const BUNDLED = 'logo.png'

const app = (attrs: string, src = REMOTE): string =>
  `import { Stack, Image } from '@pyreon/primitives'
export function C() { return <Stack><Image src="${src}" alt="a"${attrs} /></Stack> }`

const emit = (attrs: string, target: 'swift' | 'kotlin', src = REMOTE): string =>
  transform(app(attrs, src), { target }).code

describe('<Image fit> on a REMOTE src (the half that did nothing)', () => {
  it.each([
    ['cover', '.resizable().scaledToFill()'],
    ['contain', '.resizable().scaledToFit()'],
  ])('swift lowers fit=%s through the content closure', (fit, expected) => {
    const out = emit(` fit="${fit}"`, 'swift')
    expect(out).toContain('} placeholder: {')
    expect(out).toContain(expected)
  })

  it('fill is a bare resizable, not scaledToFill', () => {
    // CSS `fill` distorts; `.scaledToFill()` crops. They are different pixels.
    const out = emit(' fit="fill"', 'swift')
    expect(out).toContain('image.resizable()\n')
    expect(out).not.toContain('scaledToFill')
  })

  it('none keeps the plain init — intrinsic size, no closure', () => {
    const out = emit(' fit="none"', 'swift')
    expect(out).not.toContain('placeholder:')
    expect(out).toContain('AsyncImage(url: URL(string: "https://x.test/a.png"))')
  })

  it('no fit at all defaults to cover, as web and the bundled branch do', () => {
    expect(emit('', 'swift')).toContain('.resizable().scaledToFill()')
  })
})

describe('the two src kinds agree, which is the actual invariant', () => {
  it.each(['cover', 'contain', 'fill', 'none'])(
    'fit=%s produces the same scaling for bundled and remote',
    (fit) => {
      const remote = emit(` fit="${fit}"`, 'swift')
      const bundled = emit(` fit="${fit}"`, 'swift', BUNDLED)
      for (const mod of ['.scaledToFill()', '.scaledToFit()']) {
        expect(remote.includes(mod)).toBe(bundled.includes(mod))
      }
    },
  )
})

describe('an ABSENT fit is `cover` on every target', () => {
  // `ImageProps` documents "Default `cover`" and the web arm reads
  // `props.fit ?? 'cover'`. Kotlin's remote branch left `contentScale` off
  // entirely, so Compose fell back to `ContentScale.Fit` — an image that FILLS
  // its box on web and iOS LETTERBOXED on Android, from one source, silently.
  it.each(['swift', 'kotlin'] as const)('%s: omitting fit == writing fit="cover"', (target) => {
    expect(emit('', target)).toBe(emit(' fit="cover"', target))
  })

  it('and that default is CROP, not Compose\'s Fit', () => {
    expect(emit('', 'kotlin')).toContain('ContentScale.Crop')
  })
})

describe('the three targets agree on what each fit MEANS', () => {
  it('cover crops on both', () => {
    expect(emit(' fit="cover"', 'swift')).toContain('.scaledToFill()')
    expect(emit(' fit="cover"', 'kotlin')).toContain('ContentScale.Crop')
  })
  it('fill distorts on both', () => {
    expect(emit(' fit="fill"', 'swift')).not.toContain('scaledTo')
    expect(emit(' fit="fill"', 'kotlin')).toContain('ContentScale.FillBounds')
  })
  it('cover and fill are DIFFERENT on swift, as they are on web and android', () => {
    expect(emit(' fit="cover"', 'swift')).not.toBe(emit(' fit="fill"', 'swift'))
  })
})

/**
 * Against the real compilers. Writing this surfaced two more stub gaps — Swift
 * lacked AsyncImage's content-closure init, and Kotlin's AsyncImage stub had no
 * `contentScale` parameter, so EVERY `fit` value had been failing the Kotlin
 * gate while real device builds were fine (the CLI adds the ContentScale import
 * conditionally). A stub narrower than the runtime leaves a shipped prop with
 * no coverage rather than falsely reddening a correct one — quiet, and just as
 * costly.
 */
const MODES = ['', ' fit="cover"', ' fit="contain"', ' fit="fill"', ' fit="none"']

describe.runIf(isSwiftcAvailable())('Swift — every fit compiles', () => {
  it.each(MODES)('remote "%s"', async (attrs) => {
    const r = await validateSwiftWithStubs(emit(attrs, 'swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.each(MODES)('bundled "%s"', async (attrs) => {
    const r = await validateSwiftWithStubs(emit(attrs, 'swift', BUNDLED))
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it('with width/height too', async () => {
    expect((await validateSwiftWithStubs(emit(' fit="cover" width={100} height={50}', 'swift'))).ok).toBe(true)
  })
})

describe.runIf(isKotlincAvailable())('Kotlin — every fit compiles', () => {
  it.each(MODES)('remote "%s"', async (attrs) => {
    const r = await validateKotlin(emit(attrs, 'kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
