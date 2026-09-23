import { describe, expect, it } from 'vitest'
import { renderTooltipHtml, safeTooltipStyle } from './tooltip-html'
import { tooltipMarker } from './tooltip-format'

describe('renderTooltipHtml — a formatter\'s HTML, safely', () => {
  const render = (html: string): HTMLElement => {
    const box = document.createElement('div')
    renderTooltipHtml(box, html)
    return box
  }
  it('keeps allow-listed tags and the marker\'s inline style', () => {
    const box = render(`<b>Mon</b><br/>${tooltipMarker('#ff0000')}Sales: 12`)
    expect(box.querySelector('b')!.textContent).toBe('Mon')
    expect(box.querySelector('br')).not.toBeNull()
    expect(box.querySelector('span')!.getAttribute('style')).toContain('background-color:#ff0000')
    expect(box.textContent).toBe('MonSales: 12')
  })
  it('drops scripts, handlers, links and images — their text too where it is code', () => {
    const box = render('<img src=x onerror="window.__pwn=1"><script>window.__pwn=2</script><a href="javascript:x" onclick="y">link</a><span onmouseover="z">t</span>')
    expect(box.querySelector('img, script, a')).toBeNull()
    expect(box.innerHTML).not.toMatch(/on\w+=|javascript:|script/)
    expect(box.textContent).toBe('linkt')
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined()
  })
  it('keeps plain text and comments out of the way; an element with no safe style gets none', () => {
    const box = render('a<!-- c --><span style="position:absolute">b</span><div>c</div>')
    expect(box.textContent).toBe('abc')
    expect(box.querySelector('span')!.hasAttribute('style')).toBe(false)
  })
  it('style keeps presentational properties only, never a url()', () => {
    expect(safeTooltipStyle('color:red;position:fixed;background:url(x);font-weight:bold;behavior:expression(1)')).toBe('color:red;font-weight:bold')
    expect(safeTooltipStyle('nocolon;color:blue')).toBe('color:blue')
  })
})
