/**
 * The structural a11y checks against shapes the curated fixtures skip.
 *
 * `a11y.test.ts` covers the offenders (the div-as-button, the unnamed control)
 * and the clean cases. These pin the arms either side of them: a NON-interactive
 * explicit role, a `<span>` (the div's twin — the check must not be a div-only
 * rule), inert content that is neither, and an `<img>` that IS the subject
 * rather than a descendant of it.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { analyzeA11y, checkImageAlt, checkSemanticRole } from '../a11y'

const subject = (html: string): Element => {
  const el = document.createElement('div')
  el.innerHTML = html
  return el.firstElementChild!
}

describe('checkSemanticRole — an explicit role that is not interactive', () => {
  it('passes it, and says which role it found', () => {
    // `role="note"` is a real, correct role. Only the interactive ones get the
    // "explicit role" wording, so both arms of the check must pass.
    const c = checkSemanticRole(subject('<div role="note">hi</div>'))
    expect(c.status).toBe('ok')
    expect(c.note).toBe('role="note"')
  })

  it('still distinguishes an interactive explicit role in its wording', () => {
    expect(checkSemanticRole(subject('<div role="button">Go</div>')).note).toBe(
      'explicit role="button"',
    )
  })
})

describe('checkSemanticRole — the role-less cases', () => {
  it('WARNS on a bare <span>, not just a bare <div> — the check is not div-only', () => {
    const c = checkSemanticRole(subject('<span>Go</span>'))
    expect(c.status).toBe('warn')
    expect(c.note).toContain('renders <span> with no role')
  })

  it('PASSES inert content that is neither clickable nor a wrapper tag', () => {
    // A paragraph is not something assistive tech needs a role for; flagging it
    // would make the panel cry wolf on every piece of body copy.
    const c = checkSemanticRole(subject('<p>Some copy</p>'))
    expect(c.status).toBe('ok')
    expect(c.note).toBe('<p>')
  })

  it('WARNS on any tag carrying an inline onclick, wrapper tag or not', () => {
    const c = checkSemanticRole(subject('<p onclick="x()">Click</p>'))
    expect(c.status).toBe('warn')
  })
})

describe('checkImageAlt — when the subject IS the image', () => {
  it('inspects the element itself, not only its descendants', () => {
    // `previewSubject` returns the component's ROOT. A component that renders a
    // bare <img> would otherwise report "no images" and skip the check
    // entirely — a silent pass on the exact case it exists for.
    const c = checkImageAlt(subject('<img src="a.png">'))
    expect(c?.status).toBe('danger')
    expect(c?.note).toBe('1 of 1 <img> missing an alt attribute')
  })

  it('passes a root <img> that declares alt', () => {
    expect(checkImageAlt(subject('<img src="a.png" alt="A cat">'))?.status).toBe('ok')
  })

  it('counts the root image ALONGSIDE its descendants', () => {
    const c = checkImageAlt(subject('<img src="a.png"><span></span>'))
    expect(c?.note).toBe('1 of 1 <img> missing an alt attribute')
  })
})

describe('analyzeA11y — a bare <img> component', () => {
  it('reports the missing alt as a real finding, and the image check is not skipped', () => {
    const report = analyzeA11y(
      (() => {
        const surface = document.createElement('div')
        surface.innerHTML = '<img src="a.png">'
        return surface
      })(),
    )
    const alt = report.checks.find((c) => c.title === 'Image alt text')
    expect(alt?.status).toBe('danger')
    expect(report.fails).toBeGreaterThan(0)
  })
})
