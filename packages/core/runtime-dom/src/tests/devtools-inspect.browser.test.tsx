/**
 * Real-Chromium lock for #4446: the devtools page hook answers the two
 * inspector questions for a mounted component, through the same
 * `window.__PYREON_DEVTOOLS__` object the extension's page hook reads:
 * `getComponentProps(id)` (a bounded preview computed per call) and
 * `reactive.nodesForComponent(id)` (graph node ids of what it created).
 * The logic is covered in `devtools-inspect.test.tsx`.
 */
import { _rp, h, onMount } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { describe, expect, it } from 'vitest'

interface Hook {
  getAllComponents(): { id: string; name: string }[]
  getComponentProps(id: string): Record<string, string> | null
  reactive: { nodesForComponent(id: string): { id: number; name: string; kind: string }[] }
}
const hook = (): Hook => (window as unknown as { __PYREON_DEVTOOLS__: Hook }).__PYREON_DEVTOOLS__

describe('devtools hook — component props and owned nodes (real Chromium)', () => {
  it('previews live props and lists owned nodes; both clear on unmount', () => {
    const draft = signal('hi', { name: 'draft' })
    function Composer(props: { label: string; draft: string }) {
      const words = computed(() => props.draft.split(' ').length)
      effect(() => {
        words()
      })
      onMount(() => {
        effect(() => {
          void props.label
        })
      })
      return h(
        'form',
        null,
        h('label', null, () => props.label),
        () => props.draft,
      )
    }
    const host = document.createElement('div')
    document.body.appendChild(host)
    const dispose = mount(
      h(Composer, { label: 'Reply', draft: _rp(() => draft()) as unknown as string }),
      host,
    )
    const id = hook()
      .getAllComponents()
      .find((c) => c.name === 'Composer')!.id

    expect(hook().getComponentProps(id)).toEqual({ label: '"Reply"', draft: '"hi"' })
    draft.set('hello world')
    expect(hook().getComponentProps(id)!.draft).toBe('"hello world"')
    expect(
      hook()
        .reactive.nodesForComponent(id)
        .map((n) => n.kind),
    ).toEqual(['derived', 'effect', 'effect'])

    dispose()
    host.remove()
    expect(hook().getComponentProps(id)).toBeNull()
    expect(hook().reactive.nodesForComponent(id)).toEqual([])
  })
})
