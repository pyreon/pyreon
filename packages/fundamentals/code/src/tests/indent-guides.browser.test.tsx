import { h } from '@pyreon/core'
import { query } from '@pyreon/test-utils'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { CodeEditor } from '../components/code-editor'
import { createEditor } from '../editor'

// Indent guides belong in a line's leading whitespace. They were a repeating
// background on the whole `.cm-line`, so every line was striped across its full
// width, past its indentation and its text. Measured on painted pixels of a
// screenshot: in a band through a line's middle, any pixel that is not the
// editor background is paint. Inside an indent there must be some (the guides);
// right of the text there must be none. A 1px guide at a fractional x is
// anti-aliased, so the check is "not background", not "exactly the guide colour".

function rgb(css: string): number[] {
  const m = css.match(/\d+/g)
  if (m === null || m.length < 3) throw new Error(`unreadable colour ${css}`)
  return m.slice(0, 3).map(Number)
}

interface Shot {
  /** Pixels that are not the editor background on the row through the middle of `line`, between x0 and x1 (CSS px from the editor's left edge). */
  painted: (line: Element, x0: number, x1: number) => number
  /** Right edge of a line's text, in CSS px from the editor's left edge. */
  textRight: (line: Element) => number
}

async function screenshot(host: HTMLElement): Promise<Shot> {
  const box = host.getBoundingClientRect()
  const bg = rgb(getComputedStyle(host).backgroundColor)
  const b64 = await page.screenshot({ element: host, base64: true, save: false })
  const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob())
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0)
  const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data
  const scale = bmp.width / box.width

  return {
    painted(line, x0, x1) {
      const r = line.getBoundingClientRect()
      const y = Math.round((r.top - box.top + r.height / 2) * scale)
      let n = 0
      for (let x = Math.round(x0 * scale); x < Math.round(x1 * scale); x++) {
        const i = (y * bmp.width + x) * 4
        const d = Math.abs(data[i]! - bg[0]!) + Math.abs(data[i + 1]! - bg[1]!) + Math.abs(data[i + 2]! - bg[2]!)
        if (d > 6) n++
      }

      return n
    },
    textRight(line) {
      const range = document.createRange()
      range.selectNodeContents(line)
      return range.getBoundingClientRect().right - box.left
    },
  }
}

describe('indent guides (real browser)', () => {
  it('paint inside the leading whitespace only, not across the rest of the line', async () => {
    const editor = createEditor({
      value: ['top', '        nested', 'end'].join('\n'),
      theme: 'light',
      tabSize: 4,
      lineNumbers: false,
      foldGutter: false,
    })
    const { container, unmount } = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 120px; width: 600px' }))
    await flush()
    const host = query(container, '.cm-editor')
    const lines = [...container.querySelectorAll('.cm-line')]
    expect(lines.length).toBe(3)
    expect(getComputedStyle(host).backgroundColor, 'the editor background must be opaque to measure against').not.toBe('rgba(0, 0, 0, 0)')
    const left = query(container, '.cm-content').getBoundingClientRect().left - host.getBoundingClientRect().left
    const width = host.getBoundingClientRect().width
    const shot = await screenshot(host)

    const nested = lines[1]!
    // The 8-column indent ("        nested" is 14 columns): guides are painted there.
    const indentEnd = left + (shot.textRight(nested) - left) * (8 / 14)
    expect(shot.painted(nested, left, indentEnd), 'no guide inside the indent').toBeGreaterThan(0)
    // Right of the text, on the indented line and on an unindented one: nothing.
    expect(shot.painted(nested, shot.textRight(nested) + 2, width - 4), 'guides past the text of an indented line').toBe(0)
    // Line 3, not line 1: the cursor's line has the active-line background.
    const end = lines[2]!
    expect(shot.painted(end, shot.textRight(end) + 2, width - 4), 'guides across an unindented line').toBe(0)
    unmount()
  })
})
