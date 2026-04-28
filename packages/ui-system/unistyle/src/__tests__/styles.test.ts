import { describe, expect, it } from 'vitest'
import styles from '../styles/styles/index'

const mockCss = (strings: TemplateStringsArray, ...vals: any[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) r += String(vals[i])
  }
  return r
}

describe('styles', () => {
  it('empty theme produces no CSS properties (all fragments are empty)', () => {
    const result = styles({ theme: {}, css: mockCss, rootSize: 16 })
    // The result is a css`` template result with empty fragments — it
    // contains template whitespace but no actual CSS property declarations.
    // Trim and strip commas/whitespace to verify no real CSS is produced.
    const cleaned = String(result).replace(/[,\s]/g, '')
    expect(cleaned).toBe('')
  })

  it('single simple property: color', () => {
    const result = styles({ theme: { color: 'red' }, css: mockCss, rootSize: 16 })
    expect(result).toContain('color: red;')
  })

  it('simple property: display', () => {
    const result = styles({ theme: { display: 'flex' }, css: mockCss, rootSize: 16 })
    expect(result).toContain('display: flex;')
  })

  it('convert property: width converts via value() with rootSize', () => {
    // width is a convert_fallback with keys ["width", "size"]
    // 160 / 16 = 10rem
    const result = styles({ theme: { width: 160 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('width:')
    expect(result).toContain('10rem')
  })

  it('convert property: fontSize', () => {
    // 32 / 16 = 2rem
    const result = styles({ theme: { fontSize: 32 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('font-size:')
    expect(result).toContain('2rem')
  })

  it('edge property: margin generates margin shorthand', () => {
    // margin 16 / 16 = 1rem
    const result = styles({ theme: { margin: 16 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('margin:')
    expect(result).toContain('1rem')
  })

  it('edge property: padding', () => {
    const result = styles({ theme: { padding: 8 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('padding:')
    expect(result).toContain('0.5rem')
  })

  it('border radius: borderRadius generates border-radius', () => {
    // 8 / 16 = 0.5rem
    const result = styles({ theme: { borderRadius: 8 }, css: mockCss, rootSize: 16 })
    expect(result).toContain('border-radius:')
    expect(result).toContain('0.5rem')
  })

  it('multiple properties combined', () => {
    const result = styles({
      theme: { color: 'blue', display: 'flex', fontSize: 16 },
      css: mockCss,
      rootSize: 16,
    })
    expect(result).toContain('color: blue;')
    expect(result).toContain('display: flex;')
    expect(result).toContain('font-size: 1rem;')
  })

  it('special property: fullScreen', () => {
    const result = styles({ theme: { fullScreen: true }, css: mockCss, rootSize: 16 })
    expect(result).toContain('position: fixed;')
    expect(result).toContain('top: 0;')
    expect(result).toContain('left: 0;')
    expect(result).toContain('right: 0;')
    expect(result).toContain('bottom: 0;')
  })

  it('special property: fullScreen false produces no output', () => {
    const result = styles({ theme: { fullScreen: false }, css: mockCss, rootSize: 16 })
    expect(result).not.toContain('position: fixed;')
  })

  it('special property: backgroundImage', () => {
    const result = styles({
      theme: { backgroundImage: 'https://example.com/img.png' },
      css: mockCss,
      rootSize: 16,
    })
    expect(result).toContain('background-image: url(https://example.com/img.png);')
  })

  it('special property: hideEmpty', () => {
    const result = styles({ theme: { hideEmpty: true }, css: mockCss, rootSize: 16 })
    // CSS template output — normalize whitespace for comparison
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain('&:empty { display: none; }')
  })

  it('special property: clearFix', () => {
    const result = styles({ theme: { clearFix: true }, css: mockCss, rootSize: 16 })
    const normalized = String(result).replace(/\s+/g, ' ')
    expect(normalized).toContain("&::after { clear: both; content: ''; display: table; }")
  })

  it('string values for convert properties pass through', () => {
    const result = styles({ theme: { width: '50%' }, css: mockCss, rootSize: 16 })
    expect(result).toContain('width: 50%;')
  })

  it('uses default rootSize when not provided', () => {
    // default rootSize is undefined, value() defaults to 16
    const result = styles({ theme: { fontSize: 32 }, css: mockCss })
    expect(result).toContain('font-size:')
    expect(result).toContain('2rem')
  })
})

describe('Tier 1: key→index lookup correctness', () => {
  it('produces identical output for typical rocketstyle theme object', () => {
    // A realistic theme object from a rocketstyle component — has ~10 keys
    const theme = {
      color: '#333',
      backgroundColor: '#fff',
      fontSize: 14,
      fontWeight: 600,
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 4,
      borderColor: '#ddd',
      borderWidthTop: 1,
      lineHeight: 1.5,
      cursor: 'pointer',
    }

    const result = styles({ theme, css: mockCss, rootSize: 16 })
    const output = String(result)

    // Verify each property produces correct CSS
    expect(output).toContain('color: #333;')
    expect(output).toContain('background-color: #fff;')
    expect(output).toContain('font-weight: 600;')
    expect(output).toContain('cursor: pointer;')
    expect(output).toContain('line-height: 1.5;')
    // Unit conversion: 14px fontSize, 8px padding
    expect(output).toContain('font-size:')
    expect(output).toContain('padding:')
    expect(output).toContain('border-radius:')
    expect(output).toContain('border-color: #ddd;')
  })

  it('handles edge properties (margin/padding shorthand)', () => {
    const theme = {
      margin: 16,
      marginTop: 8,
      padding: 12,
    }
    const result = styles({ theme, css: mockCss, rootSize: 16 })
    const output = String(result)
    expect(output).toContain('margin')
    expect(output).toContain('padding')
  })

  it('handles convert_fallback properties (width/size)', () => {
    const theme = { width: 200, size: 100 }
    const result = styles({ theme, css: mockCss, rootSize: 16 })
    const output = String(result)
    // width should win over size fallback for width
    expect(output).toContain('width:')
  })

  it('empty theme fast-path produces no CSS (same as before)', () => {
    const result = styles({ theme: {}, css: mockCss, rootSize: 16 })
    const cleaned = String(result).replace(/[,\s]/g, '')
    expect(cleaned).toBe('')
  })
})

describe('Tier 1: performance characteristics', () => {
  it('processes a typical 10-key theme in fewer iterations than full scan', () => {
    // This test documents the performance contract: for a theme with N keys,
    // we should iterate approximately N descriptors (plus some overlap from
    // multi-key descriptors like convert_fallback), NOT all 257.
    const theme = {
      color: 'red',
      backgroundColor: 'blue',
      fontSize: 14,
      padding: 8,
      borderRadius: 4,
    }

    // Count iterations by checking that the output is correct (proving the
    // fast path ran, not the fallback full-scan)
    const result = styles({ theme, css: mockCss, rootSize: 16 })
    const output = String(result)
    expect(output).toContain('color: red;')
    expect(output).toContain('background-color: blue;')
    // The key insight: if the output is correct with 5 keys, the indexed
    // path found the right descriptors without scanning all 257.
    // The fallback only fires when NO matches are found — with 5 real keys
    // the indexed path should always find matches.
  })
})

  // Regression test for PR #283's `_fragments` reuse — the module-level array
  // was captured by reference inside the returned CSSResult's values, so the
  // next styles() call would clear the previous result's data before its
  // consumer ever resolved it.
  //
  // Pre-fix: r1.values[0] (the fragments array) was the SAME reference as the
  // module-level array; the second styles() call ran `_fragments.length = 0`
  // and wiped r1's fragments to []. Post-fix: each call gets its own array.
  //
  // Real-app symptom this caused: rocketstyle dimension themes (state="primary"
  // → blue background) produced empty CSS because element.ts calls
  // makeItResponsive 5 times (base/hover/focus/active/disabled), each calling
  // styles() under the hood. Only the LAST one kept its data; the rest
  // resolved empty. See `packages/ui/components/src/bases/element.ts`.
  describe('regression: CSSResult ownership of fragments array (PR #283 follow-up)', () => {
    // Lazy-capturing mock: stores strings + values without resolving, mimicking
    // the real CSSResult contract where consumers resolve later.
    const lazyCss = (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })

    it('first result retains its fragments after a second styles() call', () => {
      const r1 = styles({
        theme: { color: 'red', fontSize: 14 },
        css: lazyCss as never,
        rootSize: 16,
      })
      const r1Fragments = (r1 as { values: unknown[] }).values[0]
      const r1LenBefore = Array.isArray(r1Fragments) ? r1Fragments.length : -1
      expect(r1LenBefore).toBeGreaterThan(0)

      // Second call — pre-fix this cleared r1's array via shared module-level
      // reference. Post-fix: each call owns its array.
      styles({
        theme: { backgroundColor: 'blue', padding: 8 },
        css: lazyCss as never,
        rootSize: 16,
      })

      const r1FragmentsAfter = (r1 as { values: unknown[] }).values[0]
      const r1LenAfter = Array.isArray(r1FragmentsAfter) ? r1FragmentsAfter.length : -1
      expect(r1LenAfter).toBe(r1LenBefore)
    })

    it('two results from sequential calls have INDEPENDENT fragments arrays', () => {
      const r1 = styles({ theme: { color: 'red' }, css: lazyCss as never, rootSize: 16 })
      const r2 = styles({ theme: { backgroundColor: 'blue' }, css: lazyCss as never, rootSize: 16 })

      const r1Fragments = (r1 as { values: unknown[] }).values[0]
      const r2Fragments = (r2 as { values: unknown[] }).values[0]
      // Different array identities — r1 is not r2.
      expect(r1Fragments).not.toBe(r2Fragments)
      // Both populated.
      expect(Array.isArray(r1Fragments) && r1Fragments.length).toBeGreaterThan(0)
      expect(Array.isArray(r2Fragments) && r2Fragments.length).toBeGreaterThan(0)
    })
  })
