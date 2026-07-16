import { h } from '@pyreon/core'
import { PyreonUI } from '@pyreon/ui-core'
import { theme } from '@pyreon/ui-theme'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountInBrowser } from '@pyreon/test-utils/browser'
import { ActionIcon, Button, CloseButton, IconButton } from './index'

/**
 * The whole button family renders a native `<button>`. A `<button>` with no
 * `type` defaults to `type="submit"`, so any button placed inside a `<form>`
 * submits it on click — a real footgun, worst for CloseButton (used inside
 * modals/forms, where clicking to dismiss would submit the form). Each button
 * component sets `type: 'button'` as an `.attrs()` default (overridable by
 * passing `type="submit"`). Real-Chromium because form-submit semantics on
 * click are a browser behavior happy-dom under-models.
 */
describe('Button family — type="button" default (no accidental form submit)', () => {
  let cleanup: (() => void) | undefined
  afterEach(() => {
    cleanup?.()
    cleanup = undefined
  })

  const cases: [string, unknown][] = [
    ['Button', Button],
    ['IconButton', IconButton],
    ['CloseButton', CloseButton],
    ['ActionIcon', ActionIcon],
  ]

  for (const [name, Comp] of cases) {
    it(`${name} renders type="button"`, () => {
      const { container, unmount } = mountInBrowser(
        h(PyreonUI, { theme }, h(Comp as never, { id: `bt-${name}` }, 'x')),
      )
      cleanup = unmount
      const btn = container.querySelector('button') as HTMLButtonElement
      expect(btn).toBeTruthy()
      expect(btn.getAttribute('type')).toBe('button')
      expect(btn.type).toBe('button')
    })
  }

  it('a consumer can still opt into type="submit"', () => {
    const { container, unmount } = mountInBrowser(
      h(PyreonUI, { theme }, h(Button as never, { id: 'submit-btn', type: 'submit' }, 'Save')),
    )
    cleanup = unmount
    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn.type).toBe('submit')
  })

  it('CloseButton inside a form does NOT submit it on click', () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault())
    const { container, unmount } = mountInBrowser(
      h(
        PyreonUI,
        { theme },
        h('form', { onSubmit }, h(CloseButton as never, { id: 'form-close' })),
      ),
    )
    cleanup = unmount
    const btn = container.querySelector('#form-close') as HTMLButtonElement
    btn.click()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
