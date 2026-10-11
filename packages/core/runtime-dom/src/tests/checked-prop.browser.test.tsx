import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { userEvent } from 'vitest/browser'
import { hydrateRoot } from '../index'

describe('controlled input checked property through h()', () => {
  it.each(['checkbox', 'radio'])('resets a user-selected %s from its signal', async (type) => {
    const checked = signal(false)
    const { container, unmount } = mountInBrowser(
      h(
        'form',
        null,
        h('input', {
          type,
          checked: () => checked(),
          onChange: (event: Event) =>
            checked.set((event.currentTarget as HTMLInputElement).checked),
        }),
        h('output', null, () => String(checked())),
        h('button', { type: 'button', onClick: () => checked.set(false) }, 'Reset'),
      ),
    )
    try {
      const input = container.querySelector('input')!
      await userEvent.click(input)
      expect(checked()).toBe(true)
      expect(input.checked).toBe(true)
      await userEvent.click(container.querySelector('button')!)
      expect(container.querySelector('output')!.textContent).toBe('false')
      expect(input.checked).toBe(false)
      expect(input.hasAttribute('checked')).toBe(false)
    } finally {
      unmount()
    }
  })

  it.each([false, true])(
    'keeps the initial %s reset default after controlled changes',
    async (initial) => {
      const checked = signal(initial)
      const { container, unmount } = mountInBrowser(
        h(
          'form',
          null,
          h('input', {
            type: 'checkbox',
            checked: () => checked(),
            onChange: (event: Event) =>
              checked.set((event.currentTarget as HTMLInputElement).checked),
          }),
        ),
      )
      try {
        const input = container.querySelector('input')!
        expect(input.defaultChecked).toBe(initial)
        await userEvent.click(input)
        expect(input.checked).toBe(!initial)
        expect(checked()).toBe(!initial)
        expect(input.defaultChecked).toBe(initial)
        container.querySelector('form')!.reset()
        expect(input.checked).toBe(initial)
      } finally {
        unmount()
      }
    },
  )

  it.each([null, undefined])('clears a dirty input when checked becomes %s', async (empty) => {
    const checked = signal<boolean | null | undefined>(false)
    const { container, unmount } = mountInBrowser(
      h('input', {
        type: 'checkbox',
        checked: () => checked(),
      }),
    )
    try {
      const input = container.querySelector('input')!
      await userEvent.click(input)
      expect(input.checked).toBe(true)
      checked.set(empty)
      expect(input.checked).toBe(false)
      expect(input.defaultChecked).toBe(false)
    } finally {
      unmount()
    }
  })

  it.each([false, true])(
    'respects explicit defaultChecked=%s before and after checked',
    (defaultChecked) => {
      for (const props of [
        { defaultChecked, checked: !defaultChecked },
        { checked: !defaultChecked, defaultChecked },
      ]) {
        const { container, unmount } = mountInBrowser(
          h(
            'form',
            null,
            h('input', {
              type: 'checkbox',
              ...props,
            }),
          ),
        )
        try {
          const input = container.querySelector('input')!
          expect(input.checked).toBe(!defaultChecked)
          expect(input.defaultChecked).toBe(defaultChecked)
          container.querySelector('form')!.reset()
          expect(input.checked).toBe(defaultChecked)
        } finally {
          unmount()
        }
      }
    },
  )

  it('updates an adopted input while keeping its initial reset default', async () => {
    const container = document.createElement('div')
    container.innerHTML = '<form><input type="checkbox" checked=""></form>'
    document.body.appendChild(container)
    const input = container.querySelector('input')!
    const checked = signal(true)
    const unmount = hydrateRoot(
      container,
      h(
        'form',
        null,
        h('input', {
          type: 'checkbox',
          checked: () => checked(),
        }),
      ),
    )
    try {
      expect(container.querySelector('input')).toBe(input)
      await userEvent.click(input)
      checked.set(false)
      checked.set(true)
      expect(input.checked).toBe(true)
      checked.set(false)
      expect(input.checked).toBe(false)
      expect(input.defaultChecked).toBe(true)
      container.querySelector('form')!.reset()
      expect(input.checked).toBe(true)
    } finally {
      unmount()
      container.remove()
    }
  })

  it('keeps ARIA, HTML reflected booleans and SVG attribute semantics', () => {
    const state = signal(true)
    const { container, unmount } = mountInBrowser(
      h(
        'main',
        null,
        h('input', { disabled: () => state(), 'aria-checked': () => state() }),
        h('svg', null, h('g', { checked: () => state() })),
      ),
    )
    try {
      const input = container.querySelector('input')!
      const svg = container.querySelector('g')!
      expect(input.disabled).toBe(true)
      expect(input.getAttribute('aria-checked')).toBe('true')
      expect(svg.getAttribute('checked')).toBe('')
      state.set(false)
      expect(input.disabled).toBe(false)
      expect(input.getAttribute('aria-checked')).toBe('false')
      expect(svg.hasAttribute('checked')).toBe(false)
      expect('checked' in svg).toBe(false)
    } finally {
      unmount()
    }
  })
})
