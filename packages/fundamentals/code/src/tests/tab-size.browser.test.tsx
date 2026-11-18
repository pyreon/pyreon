import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { CodeEditor } from '../components/code-editor'
import { createEditor } from '../editor'

// `tabSize` set CodeMirror's indent UNIT but never `EditorState.tabSize`, so a
// tab character always rendered at CodeMirror's default of 4 columns whatever
// the option said (and `tabSize: 2`, the documented default, was never the
// width of a tab). Layout is the only place this shows, so it is measured in
// real Chromium: the rendered width of a tab against the width of one column.
async function tabColumns(tabSize: number | undefined): Promise<number> {
  const editor = createEditor({ value: '\tA\nAA', ...(tabSize === undefined ? {} : { tabSize }) })
  const { unmount } = mountInBrowser(h(CodeEditor, { instance: editor, style: 'height: 200px' }))
  await flush()
  const view = editor.view()
  if (view === null) throw new Error('editor did not mount')
  const left = (pos: number): number => {
    const c = view.coordsAtPos(pos)
    if (c === null) throw new Error(`no coordinates for position ${pos}`)

    return c.left
  }
  const line2 = view.state.doc.line(2).from
  const column = left(line2 + 1) - left(line2)
  const tab = left(1) - left(0)
  unmount()

  return tab / column
}

describe('tabSize sets the rendered width of a tab', () => {
  it.each([2, 8])('tabSize: %i renders a tab %i columns wide', async (size) => {
    expect(await tabColumns(size)).toBeCloseTo(size, 1)
  })

  it('the default (2) applies to tabs too', async () => {
    expect(await tabColumns(undefined)).toBeCloseTo(2, 1)
  })
})
