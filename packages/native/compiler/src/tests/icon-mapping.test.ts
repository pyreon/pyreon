// Canonical icon mapping (asset-pipeline arc PR-1.3, 2026-06-11).
//
// Pre-arc, the Swift emit passed the raw name through as an SF Symbol
// id (works only when the author writes SF ids — not canonical), and
// the Kotlin emit referenced `pyreonIcon(name)` — a runtime that
// existed ONLY as a kotlinc stub: any REAL Gradle build with an <Icon>
// failed on the unresolved reference (the same stub-masked class as
// the fetch arc's missing imports; no example used Icon, so the device
// gate never saw it).
//
// Bisect sites: ICON_MAP in canonical-primitives.ts; the mapped/
// unmapped branches in emitSwiftIcon / emitKotlinIcon; the per-glyph
// Icons.Filled conditional imports in cli build.ts.

import { describe, expect, it } from 'vitest'
import { ICON_MAP } from '../canonical-primitives'
import { transform } from '../index'

const SRC = `
  export function App() {
    return (
      <Stack>
        <Icon name="star" color="primary" size="md" data-testid="hdr-icon" />
        <Icon name="check-circle" />
        <Icon name="definitely-not-mapped" />
      </Stack>
    )
  }
`

describe('canonical icon mapping — Swift', () => {
  it('mapped names emit the SF Symbol id (not the canonical name)', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('Image(systemName: "star.fill")')
    expect(out).toContain('Image(systemName: "checkmark.circle.fill")')
  })

  it('unmapped names warn + pass through raw (SF ids stay usable)', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('Image(systemName: "definitely-not-mapped")')
    expect((r.warnings ?? []).join(' ')).toContain('not in the canonical icon map')
  })

  it('testid threads on the icon', () => {
    const out = transform(SRC, { target: 'swift' }).code
    expect(out).toContain('.accessibilityIdentifier("hdr-icon")')
  })
})

describe('canonical icon mapping — Kotlin', () => {
  it('mapped names emit compile-time Icons.Filled references (no phantom pyreonIcon)', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('imageVector = Icons.Filled.Star')
    expect(out).toContain('imageVector = Icons.Filled.CheckCircle')
    expect(out).not.toContain('pyreonIcon(')
  })

  it('unmapped names warn + render the Warning placeholder (visible, never silent)', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('imageVector = Icons.Filled.Warning')
    expect((r.warnings ?? []).join(' ')).toContain('not in the canonical icon map')
  })

  it('testid threads through the layout modifier (the Text/Heading lesson)', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('modifier = Modifier.testTag("hdr-icon").size(20.dp)')
  })
})

describe('ICON_MAP integrity', () => {
  it('every entry carries both platform ids', () => {
    for (const [name, entry] of Object.entries(ICON_MAP)) {
      expect(entry.sf.length, `${name}.sf`).toBeGreaterThan(0)
      expect(entry.material.length, `${name}.material`).toBeGreaterThan(0)
      // Material identifiers are PascalCase vals on Icons.Filled.
      expect(entry.material, `${name}.material casing`).toMatch(/^[A-Z][A-Za-z0-9]*$/)
    }
  })
})
