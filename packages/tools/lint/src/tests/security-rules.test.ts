import { describe, expect, it } from 'vitest'
import { getPreset } from '../config/presets'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The `security` group.
 *
 * These rules are held to a stricter standard than the rest: a security rule
 * that produces false positives gets switched off, and then it protects
 * nothing. So every "does NOT fire" case below is as load-bearing as the
 * "fires" cases — arguably more so.
 */

const lint = (source: string) =>
  lintFile('/proj/src/App.tsx', source, allRules, getPreset('recommended'))

const idsAt = (source: string, ruleId: string) =>
  lint(source).diagnostics.filter((d) => d.ruleId === ruleId)

describe('security group wiring', () => {
  it('both rules are in the security group and ON by default', () => {
    const sec = allRules.filter((r) => groupOf(r.meta) === 'security')
    expect(sec.map((r) => r.meta.id).sort()).toEqual([
      'pyreon/no-script-url',
      'pyreon/no-target-blank-without-rel',
    ])
    const rec = getPreset('recommended')
    for (const r of sec) expect(rec.rules[r.meta.id], r.meta.id).not.toBe('off')
  })
})

describe('pyreon/no-target-blank-without-rel', () => {
  const RULE = 'pyreon/no-target-blank-without-rel'

  it('fires when there is no rel at all', () => {
    expect(idsAt(`const A = () => <a href="/x" target="_blank">go</a>`, RULE)).toHaveLength(1)
  })

  it('still fires on rel="noopener" alone — that does not stop referrer leakage', () => {
    // The half modern browsers fixed is `noopener`. `noreferrer` is implied by
    // nothing, and the referring URL can itself identify a user or tenant.
    expect(
      idsAt(`const A = () => <a href="/x" target="_blank" rel="noopener">go</a>`, RULE),
    ).toHaveLength(1)
  })

  it('is quiet on rel="noopener noreferrer"', () => {
    expect(
      idsAt(`const A = () => <a href="/x" target="_blank" rel="noopener noreferrer">go</a>`, RULE),
    ).toHaveLength(0)
  })

  it('is quiet on rel="noreferrer" alone', () => {
    expect(
      idsAt(`const A = () => <a href="/x" target="_blank" rel="noreferrer">go</a>`, RULE),
    ).toHaveLength(0)
  })

  it('is case- and whitespace-tolerant about the rel tokens', () => {
    expect(
      idsAt(`const A = () => <a href="/x" target="_blank" rel="  NoOpener   NOREFERRER ">go</a>`, RULE),
    ).toHaveLength(0)
  })

  it('stays QUIET on a dynamic rel — it cannot be proven wrong', () => {
    expect(
      idsAt(`const A = ({ r }) => <a href="/x" target="_blank" rel={r}>go</a>`, RULE),
    ).toHaveLength(0)
  })

  it('stays QUIET on a dynamic target — it may not be _blank', () => {
    expect(idsAt(`const A = ({ t }) => <a href="/x" target={t}>go</a>`, RULE)).toHaveLength(0)
  })

  it('ignores a non-_blank target', () => {
    expect(idsAt(`const A = () => <a href="/x" target="_self">go</a>`, RULE)).toHaveLength(0)
  })

  it('covers <form> and <area>, not just <a>', () => {
    expect(idsAt(`const A = () => <form action="/x" target="_blank" />`, RULE)).toHaveLength(1)
    expect(idsAt(`const A = () => <area href="/x" target="_blank" />`, RULE)).toHaveLength(1)
  })

  it('autofixes by ADDING rel, and only when there is none to damage', () => {
    const withNone = idsAt(`const A = () => <a href="/x" target="_blank">go</a>`, RULE)
    expect(withNone[0]?.fix).toBeDefined()
    // A partially-correct rel is left alone: silently rewriting someone's
    // existing `rel` is worse than reporting it.
    const withPartial = idsAt(
      `const A = () => <a href="/x" target="_blank" rel="noopener">go</a>`,
      RULE,
    )
    expect(withPartial[0]?.fix).toBeUndefined()
  })
})

describe('pyreon/no-script-url', () => {
  const RULE = 'pyreon/no-script-url'

  it('fires on a plain javascript: href', () => {
    expect(idsAt(`const A = () => <a href="javascript:alert(1)">x</a>`, RULE)).toHaveLength(1)
  })

  it('fires on vbscript: too', () => {
    expect(idsAt(`const A = () => <a href="vbscript:msgbox(1)">x</a>`, RULE)).toHaveLength(1)
  })

  it('is case-insensitive', () => {
    expect(idsAt(`const A = () => <a href="JaVaScRiPt:alert(1)">x</a>`, RULE)).toHaveLength(1)
  })

  it('catches the LEADING control-character bypass', () => {
    // Browsers strip C0 controls before resolving the scheme, so this is a
    // live script URL that a naive `startsWith('javascript:')` misses.
    const src = 'const A = () => <a href={"\\u0001\\u0009javascript:alert(1)"}>x</a>'
    expect(idsAt(src, RULE)).toHaveLength(1)
  })

  it('catches an EMBEDDED control character inside the scheme', () => {
    const src = 'const A = () => <a href={"java\\tscript:alert(1)"}>x</a>'
    expect(idsAt(src, RULE)).toHaveLength(1)
  })

  it('covers src, action and formaction — not only href', () => {
    expect(idsAt(`const A = () => <iframe src="javascript:alert(1)" />`, RULE)).toHaveLength(1)
    expect(idsAt(`const A = () => <form action="javascript:x()" />`, RULE)).toHaveLength(1)
    expect(
      idsAt(`const A = () => <button formaction="javascript:x()" />`, RULE),
    ).toHaveLength(1)
  })

  it('reads a substitution-free template literal', () => {
    expect(idsAt('const A = () => <a href={`javascript:alert(1)`}>x</a>', RULE)).toHaveLength(1)
  })

  it('stays QUIET on a dynamic href — unprovable', () => {
    expect(idsAt(`const A = ({ u }) => <a href={u}>x</a>`, RULE)).toHaveLength(0)
  })

  it('stays QUIET on a template literal WITH substitutions', () => {
    // `${scheme}:...` could be anything; guessing would be a false positive.
    expect(
      idsAt('const A = ({ s }) => <a href={`${s}:alert(1)`}>x</a>', RULE),
    ).toHaveLength(0)
  })

  it('catches the SVG `xlink:href` vector, not just `href`', () => {
    // A namespaced attribute arrives as JSXNamespacedName, so a check keyed on
    // the QUALIFIED name never matches and the vector walks straight through.
    // This repo's catalog records the identical bug in the runtime sanitizer;
    // matching on the LOCAL name is what closes it in both places.
    expect(
      idsAt(`const A = () => <a xlink:href="javascript:alert(1)">x</a>`, RULE),
    ).toHaveLength(1)
    expect(
      idsAt(`const A = () => <image xlink:href="javascript:alert(1)" />`, RULE),
    ).toHaveLength(1)
  })

  it('ignores a namespaced attribute whose local name is not a URL attribute', () => {
    expect(idsAt(`const A = () => <a xlink:title="javascript:x">y</a>`, RULE)).toHaveLength(0)
  })

  it('does not crash or fire on a VALUELESS url attribute', () => {
    // `<a href>` is legal JSX and `node.value` is null. Nothing to read, so
    // nothing to prove — but it must not throw on the way to that conclusion.
    expect(idsAt(`const A = () => <a href>x</a>`, RULE)).toHaveLength(0)
  })

  it('does not flag ordinary URLs, including ones containing the word', () => {
    for (const href of ['/about', 'https://x.com', 'mailto:a@b.c', '#top', '/docs/javascript']) {
      expect(idsAt(`const A = () => <a href="${href}">x</a>`, RULE), href).toHaveLength(0)
    }
  })
})

describe('no double-reporting with anchor-is-valid', () => {
  it('a javascript: href produces exactly ONE diagnostic', () => {
    // `anchor-is-valid` used to flag this too. One defect, one diagnostic —
    // the same invariant `rule-registry.test.ts` enforces globally.
    const ids = lint(`const A = () => <a href="javascript:alert(1)">x</a>`).diagnostics.map(
      (d) => d.ruleId,
    )
    expect(ids.filter((i) => i === 'pyreon/no-script-url')).toHaveLength(1)
    expect(ids).not.toContain('pyreon/anchor-is-valid')
  })

  it('anchor-is-valid still owns the shapes that are NOT script URLs', () => {
    for (const href of ['', '#']) {
      const ids = lint(`const A = () => <a href="${href}">x</a>`).diagnostics.map((d) => d.ruleId)
      expect(ids, href).toContain('pyreon/anchor-is-valid')
    }
  })
})
