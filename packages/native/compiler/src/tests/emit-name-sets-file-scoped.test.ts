// The emitters keep module-level Sets of hook BINDING NAMES —
// `_motionSwift`, `_speechKotlin` and seven siblings each — so a read like
// `m.active()` knows to drop its parens. A pre-pass walks EVERY component at
// once to fill them, which makes them file-scoped; nothing reset them, so
// they grew for the life of the process (leak Class C). That is what took
// `audit-leak-classes` from 44 to 51 against its ceiling of 40.
//
// HONEST SCOPE OF THESE SPECS. The reset is a HYGIENE fix, not a bug fix: I
// could not construct an input where the stale names changed the emitted
// output. Two shapes were tried — a later file binding the same name to a
// signal, and to a plain object with a colliding method — and both emitted
// identically with and without the reset, because the signal/function name
// sets are consulted first. So there is deliberately NO spec here asserting
// "cross-file isolation": it would pass against the unfixed code too, which
// is false confidence, and this file would rather say so than manufacture a
// green.
//
// What IS load-bearing is the ORDERING the fix introduces. The reset runs at
// the emitter's entry, BEFORE the pre-pass repopulates. Move it after and the
// sets are wiped between fill and use, silently disarming every
// paren-dropping read. These specs fail on exactly that mistake
// (bisect-verified by moving the reset below the pre-pass).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const motionApp = `
  import { Stack, Text } from '@pyreon/primitives'
  import { useDeviceMotion } from '@pyreon/hooks'
  export function A() {
    const m = useDeviceMotion()
    return (<Stack><Text>{m.active()}</Text></Stack>)
  }
`

describe('the hook-name reset must not disarm the sets it clears', () => {
  it.each(['swift', 'kotlin'] as const)(
    'a motion read still drops its parens on %s',
    (target) => {
      const out = transform(motionApp, { target }).code
      expect(out).not.toContain('m.active()')
      expect(out).toMatch(/m\.active(\.value)?/)
    },
  )

  it('repeated emits of the same file are stable', () => {
    // The other direction: a reset that cleared too much, or cleared at the
    // wrong time, would make a second emit differ from the first.
    for (const target of ['swift', 'kotlin'] as const) {
      const first = transform(motionApp, { target }).code
      expect(transform(motionApp, { target }).code, target).toBe(first)
    }
  })
})
