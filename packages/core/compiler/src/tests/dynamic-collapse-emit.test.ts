/**
 * PR 3 of the dynamic-prop partial-collapse build — the compiler EMIT
 * half: `tryRocketstyleCollapse` falls through to `tryDynamicCollapse`
 * when BOTH the full and the `on*`-handler-partial paths bail. Emits
 * `__rsCollapseDyn(html, [stride-2 classes], () => cond ? 0 : 1, () =>
 * __pyrMode() === "dark")` consumed by PR 1's runtime helper `_rsCollapseDyn`
 * (#765).
 *
 * Mirrors the existing `partial-collapse-emit.test.ts` harness exactly
 * (stubbed resolved-`sites` map — the resolver/plugin scan is PR 4's
 * gate; this proves the emit contract in isolation).
 *
 * Bisect-verify (PR body): revert the fallback chain
 * (`return tryPartialCollapse(...) || tryDynamicCollapse(...)` →
 * `return tryPartialCollapse(...)`) → the dynamic-emit specs fail
 * (`__rsCollapseDyn(` absent) while the FULL + PARTIAL specs still
 * pass (proving the dynamic fallthrough is the only delta).
 * Restore → all pass.
 */
import { describe, expect, it } from 'vitest'
import { rocketstyleCollapseKey, transformJSX } from '../jsx'

// Per-value resolved sites — the dynamic emit looks up BOTH literals
// via separate keys. `templateHtml` MUST be byte-identical across
// values for the dispatcher to share one `_tpl` (cross-value template
// parity bail).
const TPL = '<button>Save</button>'

const PRIMARY = {
  templateHtml: TPL,
  lightClass: 'pyr-pri-L',
  darkClass: 'pyr-pri-D',
  rules: ['.pyr-pri-L{color:red}', '.pyr-pri-D{color:darkred}'],
  ruleKey: 'bundle-pri',
}
const SECONDARY = {
  templateHtml: TPL,
  lightClass: 'pyr-sec-L',
  darkClass: 'pyr-sec-D',
  rules: ['.pyr-sec-L{color:blue}', '.pyr-sec-D{color:darkblue}'],
  ruleKey: 'bundle-sec',
}

function collapseOpt(
  candidates: string[],
  sites: Record<
    string,
    {
      templateHtml: string
      lightClass: string
      darkClass: string
      rules: string[]
      ruleKey: string
    }
  >,
) {
  return {
    collapseRocketstyle: {
      candidates: new Set(candidates),
      sites: new Map(Object.entries(sites)),
      mode: { name: 'useMode', source: '@pyreon/ui-core' },
    },
  }
}

describe('compiler — dynamic-prop collapse emission (PR 3, ternary-of-two-literals)', () => {
  it('emits __rsCollapseDyn with stride-2 value-major classes + cond dispatcher', () => {
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary', size: 'medium' }, 'Save')
    const falsyKey = rocketstyleCollapseKey(
      'Button',
      { state: 'secondary', size: 'medium' },
      'Save',
    )
    const src =
      'const x = <Button state={isPrimary ? "primary" : "secondary"} size="medium">Save</Button>'
    const { code } = transformJSX(
      src,
      'A.tsx',
      collapseOpt(['Button'], { [truthyKey]: PRIMARY, [falsyKey]: SECONDARY }),
    )

    // Stride-2 value-major class layout: `[v0_light, v0_dark, v1_light, v1_dark]`.
    // v0 = consequent (cond → 0), v1 = alternate (cond → 1) — matches
    // `_rsCollapseDyn` doc + bisect-verified in PR 1 (#765).
    expect(code).toContain(
      '__rsCollapseDyn("<button>Save</button>", ' +
        '["pyr-pri-L","pyr-pri-D","pyr-sec-L","pyr-sec-D"], ' +
        '() => (isPrimary) ? 0 : 1, ' +
        '() => __pyrMode() === "dark")',
    )
  })

  it('imports the _rsCollapseDyn helper (and NOT the full / H helpers when not used)', () => {
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Go')
    const falsyKey = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'Go')
    const src = 'const x = <Button state={c ? "primary" : "secondary"}>Go</Button>'
    const { code } = transformJSX(
      src,
      'B.tsx',
      collapseOpt(['Button'], { [truthyKey]: PRIMARY, [falsyKey]: SECONDARY }),
    )
    // Conditional import — dynamic-only modules pull `_rsCollapseDyn`
    // ONLY (tree-shake-friendly per-feature granularity).
    expect(code).toContain(
      'import { _rsCollapseDyn as __rsCollapseDyn } from "@pyreon/runtime-dom";',
    )
    expect(code).not.toContain('_rsCollapse as __rsCollapse')
    expect(code).not.toContain('_rsCollapseH as __rsCollapseH')
  })

  it("unions BOTH values' rule bundles via injectRules (de-duped by ruleKey)", () => {
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary' }, 'X')
    const falsyKey = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'X')
    const src = 'const x = <Button state={c ? "primary" : "secondary"}>X</Button>'
    const { code } = transformJSX(
      src,
      'C.tsx',
      collapseOpt(['Button'], { [truthyKey]: PRIMARY, [falsyKey]: SECONDARY }),
    )
    // Each value's rule bundle injected separately (different ruleKeys
    // ⇒ no dedupe). Same idempotent injectRules contract as the full
    // path — styler dedupes by key at runtime.
    expect(code).toContain('"bundle-pri"')
    expect(code).toContain('"bundle-sec"')
    expect(code).toContain('__rsSheet.injectRules(')
  })

  it('preserves complex cond source verbatim (paren-wrapped for safe re-emission)', () => {
    const truthyKey = rocketstyleCollapseKey('Btn', { state: 'primary' }, 'Hi')
    const falsyKey = rocketstyleCollapseKey('Btn', { state: 'danger' }, 'Hi')
    const src = 'const x = <Btn state={user.role === "admin" ? "primary" : "danger"}>Hi</Btn>'
    const { code } = transformJSX(
      src,
      'D.tsx',
      collapseOpt(['Btn'], {
        [truthyKey]: { ...PRIMARY },
        [falsyKey]: { ...SECONDARY, lightClass: 'pyr-dng-L', darkClass: 'pyr-dng-D' },
      }),
    )
    // The paren-wrap (`(user.role === "admin")`) keeps the cond a single
    // expression — same shape as the on*-handler emit re-emits arrow bodies.
    expect(code).toContain('() => (user.role === "admin") ? 0 : 1')
  })

  // ── Conservative-bail discipline ───────────────────────────────────────
  it('BAILS when EITHER expanded site is missing from the resolved map', () => {
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary' }, 'S')
    // Only the truthy half resolved — falsy is absent (resolver returned
    // null for that variant). Half-resolved ⇒ keep the normal mount.
    const src = 'const x = <Button state={c ? "primary" : "secondary"}>S</Button>'
    const { code } = transformJSX(src, 'E.tsx', collapseOpt(['Button'], { [truthyKey]: PRIMARY }))
    expect(code).not.toContain('__rsCollapseDyn(')
    // Normal mount preserved — `<Button …>` JSX still appears (or its
    // standard `h()` form post-transform).
  })

  it('BAILS when the structural template diverges across values', () => {
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary' }, 'D')
    const falsyKey = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'D')
    const src = 'const x = <Button state={c ? "primary" : "secondary"}>D</Button>'
    const { code } = transformJSX(
      src,
      'F.tsx',
      collapseOpt(['Button'], {
        [truthyKey]: { ...PRIMARY, templateHtml: '<button>D</button>' },
        [falsyKey]: { ...SECONDARY, templateHtml: '<button data-extra>D</button>' }, // divergent
      }),
    )
    expect(code).not.toContain('__rsCollapseDyn(')
  })

  it('BAILS when the dynamic site ALSO has on*-handlers (PR 3 scope: no-handler only)', () => {
    const truthyKey = rocketstyleCollapseKey('Button', { state: 'primary' }, 'H')
    const falsyKey = rocketstyleCollapseKey('Button', { state: 'secondary' }, 'H')
    const src = 'const x = <Button state={c ? "primary" : "secondary"} onClick={go}>H</Button>'
    const { code } = transformJSX(
      src,
      'G.tsx',
      collapseOpt(['Button'], { [truthyKey]: PRIMARY, [falsyKey]: SECONDARY }),
    )
    expect(code).not.toContain('__rsCollapseDyn(')
    expect(code).not.toContain('__rsCollapseH(')
  })

  // ── Regression: FULL + on*-PARTIAL paths byte-unchanged ────────────────
  it('FULL-collapse path byte-unchanged: no-handler literal site emits plain __rsCollapse', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
    const src = 'const x = <Button state="primary">Save</Button>'
    const { code } = transformJSX(src, 'H.tsx', collapseOpt(['Button'], { [key]: PRIMARY }))
    expect(code).toContain('__rsCollapse(')
    expect(code).not.toContain('__rsCollapseH(')
    expect(code).not.toContain('__rsCollapseDyn(')
  })

  it('PARTIAL on*-handler path byte-unchanged: literal site + handler emits __rsCollapseH', () => {
    const key = rocketstyleCollapseKey('Button', { state: 'primary' }, 'Save')
    const src = 'const x = <Button state="primary" onClick={go}>Save</Button>'
    const { code } = transformJSX(src, 'I.tsx', collapseOpt(['Button'], { [key]: PRIMARY }))
    expect(code).toContain('__rsCollapseH(')
    expect(code).not.toContain('__rsCollapseDyn(')
  })
})
