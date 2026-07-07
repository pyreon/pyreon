// Editor-ready native diagnostics (DX arc, 2026-07): the in-memory
// `checkSource` core + `extractPosition` — the reusable, position-aware
// foundation an editor plugin / future LSP consumes.
//
// Bisect site: the two regexes in extractPosition (neuter → the
// position-parsing specs fail); the isWebOnlyEntry gate in checkSource
// (the web-entry spec); the warning push loop (the warning spec).

import { describe, expect, it } from 'vitest'
import { checkSource, extractPosition } from '../check'

describe('extractPosition', () => {
  it('parses the swiftc / kotlinc `file:line:col:` error form', () => {
    expect(
      extractPosition('/tmp/App.swift:2:14: error: cannot convert value of type'),
    ).toEqual({ line: 2, column: 14 })
    expect(extractPosition('App.kt:5:9: error: unresolved reference')).toEqual({
      line: 5,
      column: 9,
    })
  })

  it('parses the oxc parse-error frame `[ file:line:col ]`', () => {
    expect(
      extractPosition('[PARSE_ERROR] Expected `,`\n     ╭─[ src/App.tsx:112:11 ]'),
    ).toEqual({ line: 112, column: 11 })
  })

  it('prefers the framed form over an inner colon-position', () => {
    // A bare `:L:C:` scan must not win over the real `[ … ]` frame.
    expect(extractPosition('oops at :9:9: inner [ f.tsx:3:7 ]')).toEqual({
      line: 3,
      column: 7,
    })
  })

  it('returns undefined for a position-less message (the common warning case)', () => {
    expect(
      extractPosition('const {a:{b}} = o is an unsupported nested destructure'),
    ).toBeUndefined()
    // A version-like `x.y.z` must not false-match as a position.
    expect(extractPosition('requires swift 5.9 or later')).toBeUndefined()
  })
})

describe('checkSource — in-memory core', () => {
  it('flags a web-only entry (imports the DOM runtime) and emits no findings', () => {
    const r = checkSource(
      "import { mount } from '@pyreon/runtime-dom'\nexport function C() { return null }",
      'entry.tsx',
      { targets: ['swift'] },
    )
    expect(r.webEntry).toBe(true)
    expect(r.findings).toEqual([])
  })

  it('reports an unsupported-subset warning with NO position (warnings are position-less today)', () => {
    const r = checkSource(
      'function first<T>(xs: T[]): T { return xs[0] }\nexport function C() { return <text>hi</text> }',
      'X.tsx',
      { targets: ['swift'] },
    )
    expect(r.webEntry).toBe(false)
    const warnings = r.findings.filter((f) => f.kind === 'warning')
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    // A warning is a position-less string today — must NOT fabricate a position.
    expect(warnings[0]!.position).toBeUndefined()
    expect(warnings[0]!.file).toBe('X.tsx')
  })

  it('produces no findings for a clean component on both targets', () => {
    const r = checkSource('export function C() { return <text>hello</text> }', 'X.tsx', {
      targets: ['swift', 'kotlin'],
    })
    expect(r.webEntry).toBe(false)
    expect(r.findings).toEqual([])
  })

  it('checks purely in memory — no disk read for the given source string', () => {
    // A path that does not exist on disk still checks fine (proves the
    // core is decoupled from the filesystem — the editor-buffer case).
    const r = checkSource('export function C() { return <text>x</text> }', '/no/such/file.tsx', {
      targets: ['swift'],
    })
    expect(r.webEntry).toBe(false)
    expect(r.findings).toEqual([])
  })
})
