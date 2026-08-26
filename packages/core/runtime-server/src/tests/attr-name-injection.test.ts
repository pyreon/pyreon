import { describe, it, expect } from 'vitest'
import { h } from '@pyreon/core'
import { renderToString } from '../index'

// Security: an attacker-controlled attribute NAME (via a spread of a
// user-keyed object) must not break out of the attribute position into a
// live event handler. escapeHtml escapes < > & " ' but NOT space or '=',
// so an unvalidated name like `x onmouseover=alert(1)` would inject a handler.
describe('SSR attribute-name injection', () => {
  it('drops an attribute whose NAME contains a space + = (handler breakout)', async () => {
    const evil = { ['x onmouseover=alert(document.cookie)']: '1' }
    const html = await renderToString(h('div', { ...evil }))
    expect(html).not.toContain('onmouseover')
    expect(html).not.toContain('onmouseover=alert')
  })

  it('drops a boolean-true attribute with a malicious name (bare-name breakout)', async () => {
    const evil = { ['y onclick=alert(1)']: true }
    const html = await renderToString(h('span', { ...evil }))
    expect(html).not.toContain('onclick')
  })

  it('keeps a legitimate data-* / aria-* / camelCase attribute', async () => {
    const html = await renderToString(
      h('div', { 'data-id': 'ok', 'aria-label': 'hi', tabIndex: 0 }),
    )
    expect(html).toContain('data-id="ok"')
    expect(html).toContain('aria-label="hi"')
    expect(html).toContain('tabindex="0"')
  })
})
