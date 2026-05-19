/**
 * PR 3/4 of the partial-collapse build (open-work #1) — the compiler
 * EMIT half: `tryRocketstyleCollapse` falls back to
 * `tryPartialCollapse` (PR 1's `detectPartialCollapsibleShape`) when the
 * FULL `detectCollapsibleShape` bails, emitting `__rsCollapseH(...)` +
 * the residual handlers object (consumed by PR 2's `_rsCollapseH`,
 * #681) instead of bailing to the 5-layer mount.
 *
 * Mirrors the existing `rocketstyle-collapse.test.ts` harness exactly
 * (stubbed resolved-`sites` map — the resolver/plugin scan is the
 * CI-exercised half; this proves the emit contract in isolation, same
 * as the shipped full-collapse emission specs do).
 *
 * Bisect-verify (PR body): revert the one fallback line in
 * `tryRocketstyleCollapse` (`if (!shape) return tryPartialCollapse(...)`
 * → `if (!shape) return false`) → the partial-emit specs fail
 * (`__rsCollapseH(` absent) while the FULL-collapse regression spec
 * still passes (proving the full path is byte-unchanged — the fallback
 * is the only delta). Restore → all pass. Locally bisect-verifiable
 * (minimal `../jsx` graph, like PR 1 #679 — no resolver, no built lib).
 */
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, transformJSX } from '../jsx'

const SITE = {
  templateHtml: '<button data-x="1"><span class="inner">Save</span></button>',
  lightClass: 'pyr-L1 pyr-L2',
  darkClass: 'pyr-D1 pyr-D2',
  rules: ['.pyr-L1{color:red}', '.pyr-D1{color:blue}'],
  ruleKey: 'bundleA',
}

function collapseOpt(candidates: string[], sites: Record<string, typeof SITE>) {
  return {
    collapseRocketstyle: {
      candidates: new Set(candidates),
      sites: new Map(Object.entries(sites)),
      mode: { name: 'useMode', source: '@pyreon/ui-core' },
    },
  }
}

describe('compiler — partial-collapse emission (on*-handler-only)', () => {
  it('emits __rsCollapseH + handlers object + the _rsCollapseH import', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary', size: 'medium' }, 'Save')
    const src =
      'const x = <Button state="primary" size="medium" onClick={handleClick}>Save</Button>'
    const { code } = transformJSX(src, 'App.tsx', collapseOpt(['Button'], { [key]: SITE }))

    expect(code).toContain(
      '__rsCollapseH("<button data-x=\\"1\\"><span class=\\"inner\\">Save</span></button>", ' +
        '"pyr-L1 pyr-L2", "pyr-D1 pyr-D2", () => __pyrMode() === "dark", ' +
        '{ "onClick": (handleClick) })',
    )
    // The runtime helper is imported alongside `_rsCollapse`.
    expect(code).toContain(
      'import { _rsCollapse as __rsCollapse, _rsCollapseH as __rsCollapseH } from "@pyreon/runtime-dom";',
    )
    // Idempotent rule injection still emitted (same as the full path).
    expect(code).toContain('__rsSheet.injectRules(')
    expect(code).toContain('"bundleA"')
  })

  it('peels multiple handlers verbatim (arrow stays one arg via parens)', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Go')
    const src = 'const x = <Button state="primary" onClick={a} onPointerEnter={() => b(1)}>Go</Button>'
    const { code } = transformJSX(src, 'M.tsx', collapseOpt(['Button'], { [key]: SITE }))
    expect(code).toContain('{ "onClick": (a), "onPointerEnter": (() => b(1)) }')
    expect(code).toContain('__rsCollapseH(')
  })

  it('FULL-collapse path is byte-unchanged (regression): no-handler site still emits plain __rsCollapse', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
    const src = 'const x = <Button state="primary">Save</Button>'
    const { code } = transformJSX(src, 'F.tsx', collapseOpt(['Button'], { [key]: SITE }))
    // Plain `__rsCollapse(` call — NOT the H variant — and the import
    // must NOT pull `_rsCollapseH` (the conditional stays off).
    expect(code).toContain('__rsCollapse("<button data-x=\\"1\\"')
    expect(code).not.toContain('__rsCollapseH(')
    expect(code).toContain('import { _rsCollapse as __rsCollapse } from "@pyreon/runtime-dom";')
    expect(code).not.toContain('_rsCollapseH as __rsCollapseH')
  })

  it('bails (no collapse) on a non-handler dynamic prop alongside a handler', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'X')
    const src = 'const x = <Button state="primary" foo={dyn} onClick={h}>X</Button>'
    const { code } = transformJSX(src, 'B1.tsx', collapseOpt(['Button'], { [key]: SITE }))
    expect(code).not.toContain('__rsCollapseH')
  })

  it('bails when the handler-site key has no resolved entry (resolver bailed)', () => {
    const otherKey = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'X')
    const src = 'const x = <Button state="primary" onClick={h}>X</Button>'
    // Only `secondary` is resolved; the `primary` partial site is not.
    const { code } = transformJSX(src, 'B2.tsx', collapseOpt(['Button'], { [otherKey]: SITE }))
    expect(code).not.toContain('__rsCollapseH')
  })

  it('does nothing when collapseRocketstyle is absent (default OFF)', () => {
    const src = 'const x = <Button state="primary" onClick={h}>X</Button>'
    const { code } = transformJSX(src, 'Off.tsx', {})
    expect(code).not.toContain('__rsCollapseH')
  })
})
