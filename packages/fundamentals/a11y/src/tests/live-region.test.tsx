/** @jsxImportSource @pyreon/core */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@pyreon/runtime-dom'
import { signal } from '@pyreon/reactivity'
import { LiveRegion } from '../live-region'

const nextFrame = (): Promise<void> =>
  new Promise<void>((r) => requestAnimationFrame(() => r()))

let dispose: (() => void) | null = null
let host: HTMLElement | null = null

function mountLR(node: unknown): HTMLElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  dispose = mount(node as never, host)
  return host
}

afterEach(() => {
  dispose?.()
  dispose = null
  host?.remove()
  host = null
})

describe('<LiveRegion>', () => {
  it('renders a polite, atomic, status, screen-reader-only region by default', () => {
    const el = mountLR(<LiveRegion>Ready</LiveRegion>).querySelector('div')!
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.getAttribute('aria-atomic')).toBe('true')
    expect(el.getAttribute('role')).toBe('status')
    expect(el.textContent).toBe('Ready')
    // screen-reader-only clipping (from VisuallyHidden)
    expect(el.style.position).toBe('absolute')
    expect(el.style.width).toBe('1px')
  })

  it('assertive politeness → role="alert"', () => {
    const el = mountLR(<LiveRegion politeness="assertive">Boom</LiveRegion>).querySelector('div')!
    expect(el.getAttribute('aria-live')).toBe('assertive')
    expect(el.getAttribute('role')).toBe('alert')
  })

  it('politeness="off" silences without a contradictory implicit role', () => {
    const el = mountLR(<LiveRegion politeness="off">muted</LiveRegion>).querySelector('div')!
    expect(el.getAttribute('aria-live')).toBe('off')
    expect(el.getAttribute('role')).toBeNull()
  })

  it('explicit role overrides the politeness default', () => {
    const el = mountLR(<LiveRegion role="log" atomic={false}>x</LiveRegion>).querySelector('div')!
    expect(el.getAttribute('role')).toBe('log')
    expect(el.getAttribute('aria-atomic')).toBe('false')
  })

  it('visible drops the screen-reader-only clipping', () => {
    const el = mountLR(<LiveRegion visible>Saving…</LiveRegion>).querySelector('div')!
    expect(el.getAttribute('aria-live')).toBe('polite')
    expect(el.style.position).not.toBe('absolute')
    expect(el.textContent).toBe('Saving…')
  })

  it('forwards extra props (id/class) to the element', () => {
    const el = mountLR(<LiveRegion id="status" class="sr">hi</LiveRegion>).querySelector('div')!
    expect(el.getAttribute('id')).toBe('status')
    expect(el.getAttribute('class')).toBe('sr')
  })

  it('announces reactive content changes (textContent updates on signal write)', async () => {
    const msg = signal('idle')
    const el = mountLR(<LiveRegion>{() => msg()}</LiveRegion>).querySelector('div')!
    expect(el.textContent).toBe('idle')
    msg.set('loaded')
    await nextFrame()
    expect(el.textContent).toBe('loaded')
  })
})
