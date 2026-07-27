/**
 * Unit tests for the runtime a11y checks.
 *
 * These exist because the previous implementation FABRICATED two of them —
 * "Semantic role" and "Keyboard operable" were pushed as unconditional `ok`
 * rows that inspected nothing, so a `<div>` with no role and no tab stop still
 * reported "3 passing". Every check below is asserted in both directions
 * (passes when it should, and FAILS when it should) so a regression to a
 * fabricated pass shows up here.
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import {
  analyzeA11y,
  checkAccessibleName,
  checkImageAlt,
  checkKeyboardOperable,
  checkSemanticRole,
  previewSubject,
} from '../a11y'

/** Build a preview surface wrapping `html`, mirroring the real DOM shape. */
const surface = (html: string): Element => {
  const s = document.createElement('div')
  s.innerHTML = html
  return s
}
const subject = (html: string) => previewSubject(surface(html))

describe('previewSubject', () => {
  it('inspects the component, not the surface wrapper', () => {
    expect(previewSubject(surface('<button>Go</button>'))!.tagName).toBe('BUTTON')
  })

  it('is null when nothing is rendered', () => {
    expect(previewSubject(surface(''))).toBeNull()
    expect(previewSubject(null)).toBeNull()
  })
})

describe('checkSemanticRole', () => {
  it('passes a native interactive element', () => {
    expect(checkSemanticRole(subject('<button>Go</button>')).status).toBe('ok')
    expect(checkSemanticRole(subject('<a href="#">Go</a>')).status).toBe('ok')
  })

  it('passes an explicit role', () => {
    const c = checkSemanticRole(subject('<div role="button">Go</div>'))
    expect(c.status).toBe('ok')
    expect(c.note).toContain('role="button"')
  })

  it('WARNS on a bare div/span — the fabricated check used to pass this', () => {
    const c = checkSemanticRole(subject('<div>Go</div>'))
    expect(c.status).toBe('warn')
    expect(c.note).toContain('no role')
  })

  it('reports unknown when nothing rendered (never a fabricated pass)', () => {
    expect(checkSemanticRole(null).status).toBe('unknown')
  })
})

describe('checkKeyboardOperable', () => {
  it('passes native interactive elements', () => {
    expect(checkKeyboardOperable(subject('<button>Go</button>')).status).toBe('ok')
    expect(checkKeyboardOperable(subject('<input />')).status).toBe('ok')
  })

  it('passes an explicit tabindex="0"', () => {
    expect(checkKeyboardOperable(subject('<div tabindex="0" role="button">Go</div>')).status).toBe('ok')
  })

  it('FLAGS an interactive role that is not focusable — the real bug class', () => {
    const c = checkKeyboardOperable(subject('<div role="button">Go</div>'))
    expect(c.status).toBe('danger')
    expect(c.note).toContain('tabindex="0"')
  })

  it('warns on a negative tabindex (removed from tab order)', () => {
    expect(checkKeyboardOperable(subject('<button tabindex="-1">Go</button>')).status).toBe('warn')
  })

  it('warns on a POSITIVE tabindex (hijacks document order)', () => {
    const c = checkKeyboardOperable(subject('<button tabindex="3">Go</button>'))
    expect(c.status).toBe('warn')
    expect(c.note).toContain('disrupts')
  })

  it('treats a disabled control as correctly skipped, not a failure', () => {
    expect(checkKeyboardOperable(subject('<button disabled>Go</button>')).status).toBe('ok')
    expect(checkKeyboardOperable(subject('<button aria-disabled="true">Go</button>')).status).toBe('ok')
  })

  it('does not demand focusability of non-interactive content', () => {
    expect(checkKeyboardOperable(subject('<p>hello</p>')).status).toBe('ok')
  })
})

describe('checkAccessibleName', () => {
  it('accepts text content, aria-label, aria-labelledby and alt', () => {
    expect(checkAccessibleName(subject('<button>Save</button>')).status).toBe('ok')
    expect(checkAccessibleName(subject('<button aria-label="Save"></button>')).status).toBe('ok')
    expect(checkAccessibleName(subject('<button aria-labelledby="x"></button>')).status).toBe('ok')
    expect(checkAccessibleName(subject('<img alt="A cat" />')).status).toBe('ok')
  })

  it('FAILS an interactive element with no name at all', () => {
    const c = checkAccessibleName(subject('<button></button>'))
    expect(c.status).toBe('danger')
    expect(c.note).toContain('announce')
  })

  it('warns when named only by title=', () => {
    expect(checkAccessibleName(subject('<button title="Save"></button>')).status).toBe('warn')
  })

  it('does not demand a name from presentational content', () => {
    expect(checkAccessibleName(subject('<span></span>')).status).toBe('ok')
  })
})

describe('checkImageAlt', () => {
  it('is skipped entirely when there are no images', () => {
    expect(checkImageAlt(subject('<button>Go</button>'))).toBeNull()
  })

  it('passes when every image declares alt (including empty decorative alt)', () => {
    expect(checkImageAlt(subject('<div><img alt="" /><img alt="cat" /></div>'))!.status).toBe('ok')
  })

  it('FAILS when an img has no alt attribute', () => {
    const c = checkImageAlt(subject('<div><img alt="ok" /><img /></div>'))!
    expect(c.status).toBe('danger')
    expect(c.note).toContain('1 of 2')
  })
})

describe('analyzeA11y', () => {
  it('reports a clean verdict for a well-formed button', () => {
    const r = analyzeA11y(surface('<button>Save</button>'))
    expect(r.fails).toBe(0)
    expect(r.warns).toBe(0)
    expect(r.unknowns).toBe(0)
    expect(r.passes).toBe(r.checks.length)
  })

  it('catches the div-as-button anti-pattern the old panel called "3 passing"', () => {
    const r = analyzeA11y(surface('<div role="button"></div>'))
    // no name (danger) + not focusable (danger)
    expect(r.fails).toBeGreaterThanOrEqual(2)
    expect(r.passes).toBeLessThan(r.checks.length)
  })

  it('reports UNKNOWN — never passing — when nothing is rendered', () => {
    const r = analyzeA11y(surface(''))
    expect(r.unknowns).toBe(r.checks.length)
    expect(r.passes).toBe(0)
    expect(r.fails).toBe(0)
  })

  it('counts every check exactly once', () => {
    const r = analyzeA11y(surface('<div><img /></div>'))
    expect(r.passes + r.fails + r.warns + r.unknowns).toBe(r.checks.length)
  })
})
