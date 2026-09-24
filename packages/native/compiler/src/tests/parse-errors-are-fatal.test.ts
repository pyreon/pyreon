/**
 * A file that does not parse must fail, not lower to nothing.
 *
 * `parseSync` reports syntax errors in `ast.errors`, and PMTC ignored that
 * array. An unparseable file therefore produced an EMPTY program, every
 * pass below walked it without complaint, and `transform` returned
 * `{ code: '', warnings: [] }` — a *successful* result.
 *
 * The damage is that empty output is legitimate for other reasons. A
 * types-only module, a barrel of re-exports, a file whose component is
 * web-only: all lower to nothing. So no consumer could distinguish "there
 * was nothing to emit" from "this file is not TypeScript", and both tools
 * built on top reported success:
 *
 *   * `pyreon-native check` exited 0 — a CI gate blind to a syntax error
 *     in the code it is gating;
 *   * `pyreon-native build` wrote an empty `.swift`/`.kt` and exited 0, so
 *     the failure surfaced much later as a missing symbol in Xcode or
 *     Gradle, with nothing pointing back at the file that failed to parse.
 *
 * The empty-output cases are the control here: making parse errors fatal
 * is only correct if it does not also start rejecting files that are
 * genuinely valid and genuinely emit nothing.
 */
import { describe, expect, it } from 'vitest'
import { parsePyreon } from '../parse'
import { transform } from '../index'

const targets = ['swift', 'kotlin'] as const

describe('a syntax error is fatal', () => {
  const BROKEN: Record<string, string> = {
    'an unclosed brace': 'export function C() { return <text>hi</text> ',
    'not TypeScript at all': '@@@ not typescript at all ###',
    'a stray token': 'export function C() { const x = ; return <text>hi</text> }',
  }

  for (const [label, source] of Object.entries(BROKEN)) {
    it(`throws on ${label}, rather than emitting nothing`, () => {
      expect(() => parsePyreon(source, 'App.tsx')).toThrow()
      for (const target of targets) {
        expect(() => transform(source, { target }), target).toThrow()
      }
    })
  }

  it('the message is `file:line:col: …`, the form the CLI can make clickable', () => {
    // `extractPosition` parses this shape (it is what swiftc and kotlinc
    // emit), so the finding is editor-clickable with no extra plumbing.
    // A message without it degrades to a bare filename and the reader has
    // to search the file by hand.
    let message = ''
    try {
      parsePyreon('export function C() { return <text>hi</text> ', 'src/App.tsx')
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toMatch(/^src\/App\.tsx:\d+:\d+: /)
    expect(message, 'and it says what is actually wrong').toContain('Expected')
  })

  it('points at the line the error is ON, not the start of the file', () => {
    // The position is computed from the offset oxc points its caret at.
    // Reporting 1:1 for everything would be worse than no position — it
    // sends the reader to the wrong place with false confidence.
    let message = ''
    try {
      parsePyreon('const a = 1\nconst b = 2\nexport function C() { const x = ; }', 'App.tsx')
    } catch (err) {
      message = (err as Error).message
    }
    const line = Number(message.match(/App\.tsx:(\d+):/)?.[1])
    expect(line, 'the error is on line 3').toBe(3)
  })
})

describe('files that legitimately emit nothing still parse', () => {
  // The control. Without these, "throw on empty output" would be an
  // equally passing implementation — and a wrong one, because these are
  // valid modules that correctly lower to nothing.
  const VALID_BUT_EMPTY: Record<string, string> = {
    'a types-only module': 'export type Props = { a: string }\nexport interface B { c: number }',
    'an empty file': '',
    'a comment-only file': '// nothing here\n/* nor here */',
    'a re-export barrel': "export { x } from './x'\nexport * from './y'",
  }

  for (const [label, source] of Object.entries(VALID_BUT_EMPTY)) {
    it(`${label} parses and emits without throwing`, () => {
      expect(() => parsePyreon(source, 'App.tsx')).not.toThrow()
      for (const target of targets) {
        expect(() => transform(source, { target }), target).not.toThrow()
      }
    })
  }

  it('a valid component still lowers to real code', () => {
    // The other control: the change must not have made everything throw.
    const out = transform('export function C() { return <text>hi</text> }', { target: 'swift' })
    expect(out.code.length).toBeGreaterThan(0)
  })
})
