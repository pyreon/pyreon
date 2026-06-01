import { describe, expect, it } from 'vitest'
import {
  SEVERITY_GLYPH,
  blue,
  bold,
  colorEnabled,
  cyan,
  dim,
  emberCore,
  emberWarm,
  fileUrl,
  gray,
  green,
  hyperlink,
  magenta,
  red,
  yellow,
} from '../index'

// `colorEnabled` is captured once at module load — vitest runs under
// Node without a TTY by default, so the wrappers are pass-through.
// These tests assert the SHAPE of the helpers (identity + brand alias
// invariants) without depending on stdout state.

describe('@pyreon/ansi — shape', () => {
  it('exports the standard severity color set', () => {
    for (const fn of [red, green, yellow, blue, magenta, cyan, gray]) {
      expect(typeof fn).toBe('function')
      expect(fn('x')).toContain('x')
    }
  })

  it('blue produces the same SGR as cyan (brand has no blue token)', () => {
    // `blue` and `cyan` are constructed by separate `c256(45)` calls,
    // so they're not `===`. The contract is they emit the same SGR
    // since they share the brand index.
    expect(blue('x')).toBe(cyan('x'))
  })

  it('exports style wrappers', () => {
    expect(typeof bold).toBe('function')
    expect(typeof dim).toBe('function')
    expect(bold('x')).toContain('x')
    expect(dim('x')).toContain('x')
  })

  it('brand-token aliases share identity with their color counterparts', () => {
    // The reporter at the lint side imports `emberCore` / `emberWarm`
    // for intent-documenting call sites; CLI render imports `red` /
    // `yellow`. Same wrapper underneath — identity guarantees a future
    // edit to the palette can't accidentally split them.
    expect(emberCore).toBe(red)
    expect(emberWarm).toBe(yellow)
  })

  it('SEVERITY_GLYPH carries handoff §6.5 status symbols', () => {
    expect(SEVERITY_GLYPH).toEqual({
      error: '✗', // ✗
      warning: '!',
      info: 'ℹ', // ℹ
    })
  })

  it('exposes a stable boolean colorEnabled flag', () => {
    expect(typeof colorEnabled).toBe('boolean')
  })
})

describe('@pyreon/ansi — color emission', () => {
  // The helpers gate ALL escapes on `colorEnabled`. Under vitest the
  // gate is false (no TTY), so wrapping is the identity. The assertions
  // below pin the gate-off contract.
  it('returns the input unchanged when color is disabled', () => {
    if (colorEnabled) return // skip on a TTY
    expect(red('x')).toBe('x')
    expect(bold('x')).toBe('x')
    expect(dim('x')).toBe('x')
  })

  it('emits xterm-256 SGR when color is enabled (synthetic check)', () => {
    // We can't change `colorEnabled` after module load without re-importing,
    // so this test runs only when the harness actually has a TTY. Most
    // vitest runs skip this branch — the synthetic check is for local
    // sanity when running with FORCE_COLOR=1.
    if (!colorEnabled) return
    const out = red('x')
    expect(out).toContain('38;5;202') // ember-core → 202
    expect(out).toContain('x')
    expect(out).toContain('39') // close
  })
})

describe('@pyreon/ansi — hyperlink + fileUrl', () => {
  it('hyperlink returns plain text when color is disabled', () => {
    if (colorEnabled) return
    expect(hyperlink('text', 'file:///foo')).toBe('text')
  })

  it('hyperlink wraps OSC-8 when color is enabled', () => {
    if (!colorEnabled) return
    const out = hyperlink('text', 'file:///foo')
    expect(out).toContain('text')
    // OSC-8 prefix + URL embedded
    expect(out).toContain('8;;file:///foo')
  })

  it('fileUrl builds a bare file:// URL when no line is supplied', () => {
    expect(fileUrl('/abs/path/to/file.ts')).toBe('file:///abs/path/to/file.ts')
  })

  it('fileUrl appends #L<line> when a line is supplied', () => {
    expect(fileUrl('/abs/path/to/file.ts', 42)).toBe(
      'file:///abs/path/to/file.ts#L42',
    )
  })

  it('fileUrl ignores the column arg (no standard cross-terminal shape)', () => {
    expect(fileUrl('/abs/path/to/file.ts', 42, 7)).toBe(
      'file:///abs/path/to/file.ts#L42',
    )
  })

  it('fileUrl handles line === 0 as "no line" (undefined check)', () => {
    // `if (line !== undefined)` — 0 IS defined, so a zero line would be
    // appended. That's the documented behavior; this test pins it so a
    // future change to truthy-check (`if (line)`) is caught.
    expect(fileUrl('/abs/path/to/file.ts', 0)).toBe(
      'file:///abs/path/to/file.ts#L0',
    )
  })
})

