import { describe, expect, it } from 'vitest'
import { styles } from '../helpers/Wrapper/styled'

/**
 * Regression test for the responsive `block` cascade bug (mirrors vitus-labs's
 * "couple of fixes" PR #121).
 *
 * Scenario: a responsive theme like `block: [true, false, true]` runs the
 * styles callback once per breakpoint with a single-value `t.block`. The bug
 * was that `align-self`, `flex`/`width` etc. were emitted ONLY when
 * `t.block` was truthy — so the breakpoint where `t.block` is false emitted
 * nothing, leaving the previous breakpoint's `align-self: stretch` cascading
 * through the mobile-first @media query.
 *
 * Fix: always emit a value for these properties (truthy → stretch/100%,
 * falsy → auto/auto). The mobile-first @media cascade then resets cleanly
 * when `block` flips false at a later breakpoint.
 *
 * The styles callback is called per-breakpoint with the per-breakpoint theme
 * already resolved to a single value — so testing it directly with two
 * scalar themes is enough to lock in the always-emit contract.
 */

const identityCss = (strings: TemplateStringsArray, ...vals: unknown[]) => {
  let r = ''
  for (let i = 0; i < strings.length; i++) {
    r += strings[i]
    if (i < vals.length) {
      const v = vals[i]
      // Mirror styled-components / styler interpolation: drop falsy
      // interpolations, stringify the rest. CSSResult instances (from the
      // alignContent / extendCss helpers) coerce via their toString.
      if (v === false || v == null) continue
      r += String(v)
    }
  }
  return r
}

const renderAt = (theme: Record<string, unknown>): string =>
  String(styles({ theme, css: identityCss }))

describe('Wrapper styles — responsive block cascade reset', () => {
  it('emits stretch/100%/flex when block is true', () => {
    const out = renderAt({
      block: true,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
    })
    expect(out).toContain('align-self: stretch')
    expect(out).toContain('width: 100%')
    expect(out).toContain('display: flex')
  })

  it('emits auto/auto/inline-flex reset when block is false (key fix)', () => {
    const out = renderAt({
      block: false,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
    })
    // The fix: these properties MUST be emitted with reset values so the
    // mobile-first @media cascade doesn't leak `align-self: stretch` from a
    // smaller breakpoint where block was true.
    expect(out).toContain('align-self: auto')
    expect(out).toContain('width: auto')
    expect(out).toContain('display: inline-flex')
  })

  it('emits height: 100% when alignY is "block", auto otherwise', () => {
    const blockY = renderAt({
      block: false,
      direction: 'inline',
      alignX: 'left',
      alignY: 'block',
    })
    expect(blockY).toContain('height: 100%')

    const nonBlockY = renderAt({
      block: false,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
    })
    expect(nonBlockY).toContain('height: auto')
  })

  it('does not emit display when childFix is set (parent split)', () => {
    const out = renderAt({
      block: true,
      childFix: true,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
    })
    // childFix branch handles its own display rules outside the responsive
    // styles callback.
    expect(out).not.toContain('display: flex;')
    expect(out).not.toContain('display: inline-flex;')
  })

  it('emits parentFix flex-direction: column only when parentFix is set', () => {
    const withParentFix = renderAt({
      block: true,
      parentFix: true,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
    })
    expect(withParentFix).toContain('flex-direction: column')

    const withoutParentFix = renderAt({
      block: true,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
    })
    expect(withoutParentFix).not.toContain('flex-direction: column')
  })
})
