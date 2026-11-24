import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { describe, expect, it } from 'vitest'
import { FileDrop, FilePicker } from '../components'

describe('the server renders static markup', () => {
  it('<FileDrop>: the labelled button, the hidden input, an empty live region; nothing that needs a browser', async () => {
    expect(typeof document).toBe('undefined')
    const html = await renderToString(h(FileDrop as never, { label: 'Upload photos', accept: ['image/*'], class: 'zone', busy: true }, 'Drop here'))

    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="Upload photos"')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('class="zone"')
    expect(html).toContain('Drop here')
    expect(html).toMatch(/<input[^>]*type="file"[^>]*hidden/)
    expect(html).toContain('accept="image/*"')
    expect(html).toContain('<output')
    expect(html).not.toContain('data-drag-over')
    expect(html).not.toContain('data-has-rejections')
  })

  it('<FileDrop disabled> leaves the tab order; <FilePicker> is a native button', async () => {
    const off = await renderToString(h(FileDrop as never, { disabled: true }, 'x'))

    expect(off).toContain('tabindex="-1"')
    expect(off).toContain('aria-disabled="true"')
    const picker = await renderToString(h(FilePicker as never, { label: 'Pick' }, 'Choose'))

    expect(picker).toContain('<button')
    expect(picker).toContain('type="button"')
    expect(picker).toContain('aria-label="Pick"')
  })

  it('the live region and the render function are not used on the server (no announcement, state functions are callable)', async () => {
    let seen = ''
    const html = await renderToString(h(FileDrop as never, { live: false }, ((s: { isOver(): boolean; announcement(): string }) => { seen = `${s.isOver()}|${s.announcement()}`; return 'x' }) as never))

    expect(seen).toBe('false|')
    expect(html).not.toContain('<output')
  })
})
