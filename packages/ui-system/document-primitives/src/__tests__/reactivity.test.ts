/**
 * Fine-grained reactivity test for document-primitives.
 *
 * Proves the load-bearing claim of the resume-builder showcase: when
 * a rocketstyle document primitive (DocText, DocHeading, etc.) is
 * given a function child like `<DocText>{() => signal()}</DocText>`,
 * the function passes through rocketstyle untouched and is treated by
 * Pyreon's runtime as a reactive children accessor — patching only
 * the affected text node when the signal changes, with no top-down
 * re-render of the parent component.
 *
 * Without this guarantee, the resume builder's "single tree, two
 * render targets" design degrades to a top-down re-render on every
 * keystroke, defeating the entire reason to use document-primitives
 * for the live preview.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { mount } from '@pyreon/runtime-dom'
import { initTestConfig } from '@pyreon/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import DocText from '../primitives/DocText'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

describe('document primitives — fine-grained reactivity', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    return () => container.remove()
  })

  it('DocText with function child patches its text node when the signal changes', () => {
    const name = signal('Aisha')

    mount(h(DocText as any, null, () => name()), container)

    // Initial value rendered:
    expect(container.textContent).toBe('Aisha')

    // Mutate signal — only the text node should patch:
    name.set('Marcus')
    expect(container.textContent).toBe('Marcus')

    // And again:
    name.set('Priya')
    expect(container.textContent).toBe('Priya')
  })

  it('parent component runs once even when signal child updates many times', () => {
    const headline = signal('Senior Engineer')
    let parentCalls = 0

    const Resume = () => {
      parentCalls++
      return h(DocText as any, null, () => headline())
    }

    mount(h(Resume, null), container)
    expect(parentCalls).toBe(1)
    expect(container.textContent).toBe('Senior Engineer')

    // 5 mutations — parent must NOT re-run:
    headline.set('Staff Engineer')
    headline.set('Principal Engineer')
    headline.set('Distinguished Engineer')
    headline.set('Fellow')
    headline.set('CTO')

    expect(parentCalls).toBe(1)
    expect(container.textContent).toBe('CTO')
  })
})
