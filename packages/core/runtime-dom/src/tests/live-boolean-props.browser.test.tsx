import { h, type VNodeChild } from '@pyreon/core'
import { _bind, signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { userEvent } from 'vitest/browser'
import { _setAttr, _tpl } from '../index'

// Real Chromium is essential: muted/defaultMuted are separate browser state,
// and a native checkbox activation clears indeterminate before firing change.
describe('live boolean DOM properties', () => {
  it('restores mixed checkbox state after a native user click', async () => {
    const mixed = signal<boolean | null | undefined>(true)
    const { container, unmount } = mountInBrowser(
      h('input', {
        type: 'checkbox',
        indeterminate: () => mixed(),
        onChange: (event: Event) =>
          mixed.set((event.currentTarget as HTMLInputElement).indeterminate),
      }),
    )
    try {
      const input = container.querySelector('input')!
      expect(input.indeterminate).toBe(true)
      expect(input.hasAttribute('indeterminate')).toBe(false)
      await userEvent.click(input)
      expect(input.checked).toBe(true)
      expect(mixed()).toBe(false)
      expect(input.indeterminate).toBe(false)
      mixed.set(true)
      expect(input.indeterminate).toBe(true)
      for (const empty of [null, undefined]) {
        mixed.set(empty)
        expect(input.indeterminate).toBe(false)
        mixed.set(true)
        expect(input.indeterminate).toBe(true)
      }
    } finally {
      unmount()
    }
  })

  for (const tag of ['audio', 'video'] as const) {
    for (const path of ['h', 'template'] as const) {
      it(`${path} ${tag} updates live muted state and preserves attribute reflection`, () => {
        const muted = signal<boolean | null | undefined>(false)
        // The compiler emits _setAttr for dynamic muted (locked by the
        // compiler runtime test); its browser sink must agree with h().
        const node =
          path === 'h'
            ? h(tag, { muted: () => muted() })
            : _tpl(`<${tag}></${tag}>`, (el) => _bind(() => _setAttr(el, 'muted', muted())))
        const { container, unmount } = mountInBrowser(node as VNodeChild)
        try {
          const media = container.querySelector(tag)!
          expect(media.muted).toBe(false)
          for (const off of [false, null, undefined]) {
            muted.set(true)
            expect(media.muted).toBe(true)
            expect(media.defaultMuted).toBe(true)
            expect(media.hasAttribute('muted')).toBe(true)
            muted.set(off)
            expect(media.muted).toBe(false)
            expect(media.defaultMuted).toBe(false)
            expect(media.hasAttribute('muted')).toBe(false)
          }
        } finally {
          unmount()
        }
      })
    }
  }

  it('keeps ARIA, reflected boolean, non-media and SVG attributes intact', () => {
    const active = signal(true)
    const { container, unmount } = mountInBrowser(
      h(
        'div',
        null,
        h('input', { 'aria-checked': () => active(), disabled: () => active() }),
        h('div', { muted: () => active(), indeterminate: () => active() }),
        h(
          'svg',
          null,
          h('input', { indeterminate: () => active() }),
          h('video', { muted: () => active() }),
        ),
      ),
    )
    try {
      const input = container.querySelector('input')!
      const div = container.querySelector('div[muted]')!
      const svgInput = container.querySelector('svg input')!
      const svgVideo = container.querySelector('svg video')!
      expect(input.getAttribute('aria-checked')).toBe('true')
      expect(input.disabled).toBe(true)
      expect(div.hasAttribute('muted')).toBe(true)
      expect(div.hasAttribute('indeterminate')).toBe(true)
      expect(svgInput.namespaceURI).toBe('http://www.w3.org/2000/svg')
      expect(svgInput.hasAttribute('indeterminate')).toBe(true)
      expect(svgVideo.hasAttribute('muted')).toBe(true)
      expect('indeterminate' in svgInput).toBe(false)
      expect('muted' in svgVideo).toBe(false)
      active.set(false)
      expect(input.getAttribute('aria-checked')).toBe('false')
      expect(input.disabled).toBe(false)
      expect(div.hasAttribute('muted')).toBe(false)
      expect(svgInput.hasAttribute('indeterminate')).toBe(false)
      expect(svgVideo.hasAttribute('muted')).toBe(false)
    } finally {
      unmount()
    }
  })
})
