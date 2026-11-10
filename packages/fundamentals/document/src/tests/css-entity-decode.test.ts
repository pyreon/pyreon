import { describe, expect, it } from 'vitest'

import { render } from '../index'
import { sanitizeCss } from '../sanitize'
import type { DocNode } from '../types'

/**
 * `sanitizeCss` stripped `;` `(` `)` from the RAW string, but every value it
 * guards lands inside a `style="…"` attribute, and the browser entity-decodes
 * an attribute BEFORE the CSS parser reads it. Character references therefore
 * re-created the stripped characters: one `width` value became a whole set of
 * extra declarations (a fixed full-page overlay with a tracking image).
 *
 * The oracle is a real parse of the emitted markup — the DECODED attribute and
 * the CSSOM — not a substring check on the source string, which is exactly
 * what missed this.
 */

const PAYLOAD =
  '50%&#59;position&#58;fixed&#59;inset&#58 0&#59;z-index&#58 9999&#59;background&#58;url&#40;https&#58;//attacker.invalid/t.png&#41;'

const tree = {
  type: 'document',
  props: {},
  children: [
    { type: 'column', props: { width: PAYLOAD }, children: ['hello'] },
    { type: 'text', props: { align: PAYLOAD }, children: ['t'] },
  ],
} as unknown as DocNode

function parsedStyles(markup: string): { attr: string; position: string; bg: string }[] {
  const host = document.createElement('div')
  host.innerHTML = markup.slice(markup.indexOf('<body'))
  return [...host.querySelectorAll('[style]')].map((el) => {
    const s = (el as HTMLElement).style
    return { attr: el.getAttribute('style') ?? '', position: s.position, bg: s.backgroundImage || s.background }
  })
}

describe('style values cannot smuggle declarations through character references', () => {
  it.each(['html', 'email'] as const)('%s renderer: decoded style attributes carry no injected declaration', async (fmt) => {
    const out = (await render(tree, fmt)) as string
    const styles = parsedStyles(out)
    expect(styles.length).toBeGreaterThan(0)
    for (const s of styles) {
      // Inert leftovers inside the ONE sanitized value are fine (that is what
      // sanitizing means); a new `;`-separated declaration is not.
      expect(s.attr).not.toMatch(/;\s*(?:position|inset|z-index|background)\s*:/i)
      expect(s.attr).not.toMatch(/url\s*\(/i)
      expect(s.position).toBe('')
      expect(s.bg).not.toMatch(/attacker/)
    }
  })

  it.each([
    ['decimal', '1px&#59;color:red'],
    ['hex', '1px&#x3b;color:red'],
    ['no terminator', '1px&#59color:red'],
    ['named the decoder does not know', '1px&semi;color:red'],
    ['double-encoded', '1px&amp;#59;color:red'],
    ['paren', 'url&#40;x&#41;'],
  ])('sanitizeCss leaves no `&` and no decoded separator (%s)', (_label, input) => {
    const out = sanitizeCss(input)
    expect(out).not.toMatch(/[&;()]/)
  })

  it('ordinary CSS values pass through unchanged', () => {
    expect(sanitizeCss('50%')).toBe('50%')
    expect(sanitizeCss('center')).toBe('center')
    expect(sanitizeCss('1px solid #ddd')).toBe('1px solid #ddd')
  })
})
