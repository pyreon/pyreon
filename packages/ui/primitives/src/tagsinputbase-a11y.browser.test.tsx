/** @jsxImportSource @pyreon/core */
/**
 * Real-Chromium locks for TagsInputBase (2026-07-21 audit, roadmap B14).
 */
import { h } from '@pyreon/core'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { describe, expect, it } from 'vitest'
import { TagsInputBase, type TagsInputState } from './index'

const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }))

function mountTags(extra: Record<string, unknown>, testid: string) {
  let api: TagsInputState | null = null
  const mounted = mountInBrowser(
    h(TagsInputBase as never, {
      ...extra,
      children: (s: TagsInputState) => {
        api = s
        return h(
          'div',
          { ...s.rootProps(), 'data-testid': testid },
          h('input', { ...s.inputProps(), 'data-testid': `${testid}-in` }),
        )
      },
    }),
  )
  return { ...mounted, api: () => api! }
}

const type = (input: HTMLInputElement, text: string) => {
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('TagsInputBase (real Chromium)', () => {
  it('Enter commits a trimmed tag and clears the draft; comma commits too', async () => {
    const { container, api, unmount } = mountTags({}, 'tg-1')
    await flush()
    const input = container.querySelector('[data-testid="tg-1-in"]') as HTMLInputElement
    expect(input.getAttribute('aria-label')).toBe('Add tag')

    type(input, '  alpha  ')
    key(input, 'Enter')
    await flush()
    expect(api().tags()).toEqual(['alpha'])
    expect(api().query(), 'draft clears after commit').toBe('')

    type(input, 'beta')
    key(input, ',')
    await flush()
    expect(api().tags()).toEqual(['alpha', 'beta'])
    unmount()
  })

  it('Backspace on an EMPTY draft removes the last tag', async () => {
    const { container, api, unmount } = mountTags({ defaultValue: ['a', 'b'] }, 'tg-2')
    await flush()
    const input = container.querySelector('[data-testid="tg-2-in"]') as HTMLInputElement
    key(input, 'Backspace')
    await flush()
    expect(api().tags()).toEqual(['a'])
    // With a non-empty draft, Backspace edits the draft, not the tags.
    type(input, 'x')
    key(input, 'Backspace')
    await flush()
    expect(api().tags()).toEqual(['a'])
    unmount()
  })

  it('duplicates rejected case-insensitively; validateTag failure keeps the draft; maxTags caps', async () => {
    const { container, api, unmount } = mountTags(
      { defaultValue: ['Alpha'], maxTags: 2, validateTag: (t: string) => t.length >= 2 },
      'tg-3',
    )
    await flush()
    const input = container.querySelector('[data-testid="tg-3-in"]') as HTMLInputElement

    type(input, 'alpha') // dup (case-insensitive)
    key(input, 'Enter')
    await flush()
    expect(api().tags()).toEqual(['Alpha'])

    type(input, 'x') // validateTag fails
    key(input, 'Enter')
    await flush()
    expect(api().tags()).toEqual(['Alpha'])
    expect(api().query(), 'rejected draft is KEPT for fixing').toBe('x')

    type(input, 'ok')
    key(input, 'Enter')
    await flush()
    expect(api().tags()).toEqual(['Alpha', 'ok'])

    type(input, 'over') // maxTags reached
    key(input, 'Enter')
    await flush()
    expect(api().tags()).toEqual(['Alpha', 'ok'])
    unmount()
  })

  it('remove buttons carry the localizable label and remove the RIGHT tag', async () => {
    let api: TagsInputState | null = null
    const { container, unmount } = mountInBrowser(
      h(TagsInputBase as never, {
        defaultValue: ['red', 'green', 'blue'],
        labels: { remove: (t: string) => `Odebrat ${t}` },
        children: (s: TagsInputState) => {
          api = s
          return h(
            'div',
            {},
            // Reactive chip list re-rendered per change (whole-list accessor).
            () =>
              h(
                'div',
                { 'data-testid': 'chips' },
                ...s.tags().map((t) =>
                  h('span', {}, t, h('button', { ...s.getRemoveProps(t), 'data-testid': `rm-${t}` }, '×')),
                ),
              ),
          )
        },
      }),
    )
    await flush()
    const rm = container.querySelector('[data-testid="rm-green"]') as HTMLButtonElement
    expect(rm.getAttribute('aria-label')).toBe('Odebrat green')
    expect(rm.getAttribute('type'), 'never submits forms').toBe('button')
    rm.click()
    await flush()
    expect(api!.tags()).toEqual(['red', 'blue'])
    unmount()
  })
})
