// <Image src> canonical dispatch (asset-pipeline arc, 2026-06-11).
//
// Pre-arc, EVERY src emitted as remote (AsyncImage/Coil) — the
// ImageProps contract documented bundled `Image(...)` but the emit
// never implemented it (typed-but-unimplemented). The dispatch:
// http(s):// → remote; bare name → bundled (asset catalog /
// pyreonDrawable density lookup); path-style → web-only warning +
// remote fallthrough (fails visibly, never silently).
//
// Bisect sites: imageSrcKind / imageSrcKindKotlin; the bundled
// branches in emitSwiftImage / emitKotlinImage; the path-style
// warning pushes.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
  export function App() {
    return (
      <Stack>
        <Image src="pyreon-logo.png" alt="Pyreon" width={28} height={28} fit="contain" data-testid="brand-logo" />
        <Image src="hero.png" alt="Hero" fit="none" />
        <Image src="https://x.test/r.png" alt="r" width={10} height={10} />
        <Image src="/img/web-only.png" alt="p" />
      </Stack>
    )
  }
`

describe('Image src dispatch — Swift', () => {
  it('bare name → asset-catalog Image with fit mapping + frame + a11y + testid', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain(
      'Image("pyreon-logo").resizable().scaledToFit().frame(width: 28, height: 28).accessibilityLabel("Pyreon").accessibilityIdentifier("brand-logo")',
    )
  })

  it('fit="none" keeps the intrinsic-size bare Image (no resizable)', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('Image("hero").accessibilityLabel("Hero")')
    expect(out).not.toContain('Image("hero").resizable()')
  })

  it('http(s) stays AsyncImage; path-style warns + falls through to remote', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('AsyncImage(url: URL(string: "https://x.test/r.png"))')
    expect(r.code).toContain('AsyncImage(url: URL(string: "/img/web-only.png"))')
    expect((r.warnings ?? []).join(' ')).toContain('path-style src is web-only')
  })
})

describe('Image src dispatch — Kotlin', () => {
  it('bare name → painterResource(pyreonDrawable) with ContentScale + testid threading', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain(
      'Image(painter = painterResource(pyreonDrawable("pyreon-logo")), contentDescription = "Pyreon", contentScale = ContentScale.Fit, modifier = Modifier.testTag("brand-logo").width(28.dp).height(28.dp))',
    )
  })

  it('http(s) stays Coil AsyncImage; path-style warns', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('AsyncImage(model = "https://x.test/r.png"')
    expect((r.warnings ?? []).join(' ')).toContain('path-style src is web-only')
  })

  it('default fit is cover (ContentScale.Crop) — the web object-fit default', () => {
    const out = transform(
      `export function A() { return <Stack><Image src="x.png" alt="x" /></Stack> }`,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('contentScale = ContentScale.Crop')
  })
})
