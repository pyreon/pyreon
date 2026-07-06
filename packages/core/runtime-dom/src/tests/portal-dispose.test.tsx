/**
 * Regression: disposing a tree must REMOVE its portaled content from the
 * target. Portal content mounts into a LIVE parent (document.body) that is
 * never removed as a unit, so without an explicit remover a portaled modal /
 * toast / tooltip / dropdown leaks into the DOM forever once its owner
 * unmounts (route change, `<Show>` flip, conditional render). Found via the
 * @pyreon/testing audit — no test previously covered portal removal.
 */
import { describe, expect, it } from 'vitest'
import { Portal, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '../index'

describe('Portal — DOM removal on dispose', () => {
  it('removes static portaled content from the target on dispose', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const dispose = mount(
      h('div', null, h(Portal, { target: document.body }, h('div', { 'data-testid': 'p' }, 'x'))),
      container,
    )
    expect(document.body.querySelector('[data-testid=p]')).not.toBeNull()
    dispose()
    expect(document.body.querySelector('[data-testid=p]')).toBeNull()
    container.remove()
  })

  it('removes reactive portaled content (grown after mount) on dispose', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const show = signal(false)
    const dispose = mount(
      h('div', null, h(Portal, { target: document.body }, () =>
        show() ? h('div', { 'data-testid': 'r' }, 'shown') : null,
      )),
      container,
    )
    show.set(true)
    expect(document.body.querySelector('[data-testid=r]')).not.toBeNull()
    dispose()
    // Content added AFTER mount (between the portal markers) must also go.
    expect(document.body.querySelector('[data-testid=r]')).toBeNull()
    container.remove()
  })
})
