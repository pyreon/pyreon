import { describe, expect, it } from 'vitest'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * `pyreon/no-unsanitized-inner-html`.
 *
 * Every "does NOT fire" spec here is as load-bearing as the "fires" ones. The
 * prop is legitimately used with your own sanitizer, so a rule that cannot
 * tell the two apart is a rule people disable — and a disabled security rule
 * protects nothing.
 */

const RULE = 'pyreon/no-unsanitized-inner-html'
const at = (src: string) =>
  lintFile('/proj/src/A.tsx', src, allRules, { rules: { [RULE]: 'error' } }).diagnostics.filter(
    (d) => d.ruleId === RULE,
  )

describe('pyreon/no-unsanitized-inner-html', () => {
  it('fires on an interpolated value', () => {
    expect(at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: userBio }} />`)).toHaveLength(1)
  })

  it('fires on a member expression', () => {
    expect(at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: post.body }} />`)).toHaveLength(1)
  })

  it('fires on a template literal WITH substitutions', () => {
    expect(
      at('export const A = () => <div dangerouslySetInnerHTML={{ __html: `<p>${bio}</p>` }} />'),
    ).toHaveLength(1)
  })

  it('fires on a non-sanitizing call', () => {
    expect(
      at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: renderMarkdown(src) }} />`),
    ).toHaveLength(1)
  })

  it('is quiet on a string literal — markup the author typed', () => {
    expect(at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: "<b>hi</b>" }} />`)).toEqual([])
  })

  it('is quiet on a substitution-free template literal', () => {
    expect(
      at('export const A = () => <div dangerouslySetInnerHTML={{ __html: `<b>hi</b>` }} />'),
    ).toEqual([])
  })

  it('is quiet on a direct sanitizer call', () => {
    expect(
      at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(dirty) }} />`),
    ).toEqual([])
  })

  it('is quiet on DOMPurify.sanitize — the documented shape', () => {
    expect(
      at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(dirty) }} />`),
    ).toEqual([])
  })

  it('resolves ONE hop through a same-file const — the idiomatic two-line form', () => {
    // Flagging this is the false positive that gets a security rule switched
    // off, so it is a first-class case rather than an accepted miss.
    expect(
      at(`const clean = DOMPurify.sanitize(dirty)
export const A = () => <div dangerouslySetInnerHTML={{ __html: clean }} />`),
    ).toEqual([])
  })

  it('still fires when the const hop leads somewhere unsanitized', () => {
    expect(
      at(`const body = post.body
export const A = () => <div dangerouslySetInnerHTML={{ __html: body }} />`),
    ).toHaveLength(1)
  })

  it('ignores the sanitized `innerHTML` prop — a different prop with a sanitizer', () => {
    expect(at(`export const A = () => <div innerHTML={userBio} />`)).toEqual([])
  })

  it('ignores an unrelated object-valued prop', () => {
    expect(at(`export const A = () => <div style={{ color: userColor }} />`)).toEqual([])
  })

  it('reports once per element, not once per object property', () => {
    expect(
      at(`export const A = () => <div dangerouslySetInnerHTML={{ __html: a, extra: b }} />`),
    ).toHaveLength(1)
  })

  it('is OFF in the shipped presets — it is opt-in', () => {
    const rule = allRules.find((r) => r.meta.id === RULE)
    expect(rule?.meta.optIn).toBe(true)
  })
})
