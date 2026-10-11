import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { _setAttr } from '../index'

// Browser tests own the native behavior proof; these also lock normalization
// and namespace dispatch through the public mount and compiled-attribute APIs.
describe('live boolean property normalization', () => {
  it('normalizes an h() checkbox mixed state without writing a dead attribute', () => {
    const value = signal<boolean | null | undefined>(true)
    const { container, unmount } = mountInBrowser(h('input', { indeterminate: () => value() }))
    try {
      const input = container.querySelector('input')!
      expect(input.indeterminate).toBe(true)
      for (const empty of [false, null, undefined]) {
        value.set(empty)
        expect(input.indeterminate).toBe(false)
        value.set(true)
        expect(input.indeterminate).toBe(true)
      }
      expect(input.hasAttribute('indeterminate')).toBe(false)
    } finally {
      unmount()
    }
  })

  for (const tag of ['audio', 'video']) {
    it(`sets ${tag} live mute state through both prop sinks`, () => {
      const value = signal<boolean | null | undefined>(false)
      const { container, unmount } = mountInBrowser(h(tag, { muted: () => value() }))
      try {
        const media = container.querySelector(tag) as HTMLMediaElement
        for (const off of [false, null, undefined]) {
          value.set(true)
          expect(media.muted).toBe(true)
          expect(media.hasAttribute('muted')).toBe(true)
          value.set(off)
          expect(media.muted).toBe(false)
          expect(media.hasAttribute('muted')).toBe(false)
          _setAttr(media, 'muted', true)
          expect(media.muted).toBe(true)
          _setAttr(media, 'muted', off)
          expect(media.muted).toBe(false)
        }
      } finally {
        unmount()
      }
    })
  }

  it('leaves non-media, SVG and ARIA boolean attributes on their normal paths', () => {
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        { muted: true, indeterminate: true, 'aria-checked': false },
        h('svg', null, h('input', { indeterminate: true }), h('video', { muted: true })),
      ),
    )
    try {
      const div = container.querySelector('div')!
      expect(div.getAttribute('aria-checked')).toBe('false')
      expect(div.hasAttribute('muted')).toBe(true)
      expect(div.hasAttribute('indeterminate')).toBe(true)
      const svgInput = container.querySelector('svg input')!
      const svgVideo = container.querySelector('svg video')!
      expect(svgInput.hasAttribute('indeterminate')).toBe(true)
      expect('indeterminate' in svgInput).toBe(false)
      _setAttr(svgVideo, 'muted', false)
      expect(svgVideo.hasAttribute('muted')).toBe(false)
      expect('muted' in svgVideo).toBe(false)
      _setAttr(div, 'muted', false)
      expect(div.hasAttribute('muted')).toBe(false)
    } finally {
      unmount()
    }
  })
})
