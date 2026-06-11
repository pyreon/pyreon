// <Text font> emit (asset-pipeline arc PR-1.4, 2026-06-11).
//
// iOS bakes the PostScript name literal (Font.custom needs it — the
// CLI supplies the canonical→PostScript map from the sfnt name table);
// Android uses a runtime res/font lookup (pyreonFont), so it needs no
// map. An unmapped font warns + falls back to the canonical name on
// iOS (visible, never a silent system-font swap).
//
// Bisect sites: the font branch in emitSwiftText (the _fontMap read +
// warning) and emitKotlinText (the pyreonFont arg).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `export function A() {
  return <Stack><Text font="Brand" data-testid="t">Hi</Text></Stack>
}`

describe('font emit — Swift', () => {
  it('mapped font → Font.custom with the PostScript name literal', () => {
    const out = transform(SRC, { target: 'swift', fonts: { Brand: 'Trattatello' } }).code
    expect(out).toContain('.font(.custom("Trattatello", size: 17))')
  })

  it('unmapped font warns + falls back to the canonical name', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('.font(.custom("Brand", size: 17))')
    expect((r.warnings ?? []).join(' ')).toContain('no bundled font')
  })

  it('font composes with the testid', () => {
    const out = transform(SRC, { target: 'swift', fonts: { Brand: 'Trattatello' } }).code
    expect(out).toContain('.accessibilityIdentifier("t")')
  })
})

describe('font emit — Kotlin', () => {
  it('font → fontFamily = pyreonFont(<resource name>); no map needed', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('fontFamily = pyreonFont("brand")')
  })

  it('font composes with the testid modifier', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('fontFamily = pyreonFont("brand")')
    expect(out).toContain('Modifier.testTag("t")')
  })
})
