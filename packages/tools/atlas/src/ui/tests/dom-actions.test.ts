/**
 * The Actions panel logs DOM interactions inside the preview, declared handler
 * or not. A rocketstyle library declares no typed `onClick`, so the declared-
 * handler path alone left `@pyreon/ui-components`' Actions panel silent.
 *
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  captureDomActions,
  describeElement,
  describeEvent,
  DOM_ACTION_EVENTS,
} from '../dom-actions'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('describeElement', () => {
  it('names the tag, the identifying attributes and the text', () => {
    const b = document.createElement('button')
    b.setAttribute('type', 'submit')
    b.setAttribute('data-testid', 'save')
    b.textContent = '  Save   changes '
    expect(describeElement(b)).toBe('<button type=submit data-testid=save> "Save changes"')
  })

  it('truncates a long attribute and long text', () => {
    const d = document.createElement('div')
    d.setAttribute('aria-label', 'x'.repeat(40))
    d.textContent = 'y'.repeat(50)
    expect(describeElement(d)).toBe(`<div aria-label=${'x'.repeat(24)}…> "${'y'.repeat(32)}…"`)
  })

  it('is empty for no element', () => {
    expect(describeElement(null)).toBe('')
  })
})

describe('describeEvent', () => {
  it('carries the key of a keydown and the value of an input', () => {
    const input = document.createElement('input')
    input.value = 'hello'
    document.body.append(input)
    const kd = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    input.dispatchEvent(kd)
    expect(describeEvent(kd)).toBe('<input> key=Enter')
    const ie = new Event('input', { bubbles: true })
    input.dispatchEvent(ie)
    expect(describeEvent(ie)).toBe('<input> value=hello')
    input.value = 'z'.repeat(40)
    const ce = new Event('change', { bubbles: true })
    input.dispatchEvent(ce)
    expect(describeEvent(ce)).toBe(`<input> value=${'z'.repeat(32)}…`)
  })

  it('reports a checkbox by its checked state, not its value', () => {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = true
    document.body.append(box)
    const ce = new Event('change', { bubbles: true })
    box.dispatchEvent(ce)
    expect(describeEvent(ce)).toBe('<input type=checkbox> value=true')
  })

  it('names the CONTROL a click landed in, not the label span inside it', () => {
    const button = document.createElement('button')
    const span = document.createElement('span')
    span.textContent = 'Button'
    button.append(span)
    document.body.append(button)
    const click = new MouseEvent('click', { bubbles: true })
    span.dispatchEvent(click)
    expect(describeEvent(click)).toBe('<button> "Button"')
    // A plain element with no interactive ancestor names itself.
    const p = document.createElement('p')
    p.textContent = 'hi'
    document.body.append(p)
    const c2 = new MouseEvent('click', { bubbles: true })
    p.dispatchEvent(c2)
    expect(describeEvent(c2)).toBe('<p> "hi"')
  })

  it('never names an interactive ancestor OUTSIDE the preview root (workbench chrome)', () => {
    const chrome = document.createElement('div')
    chrome.setAttribute('role', 'main')
    const root = document.createElement('div')
    const p = document.createElement('p')
    p.textContent = 'inside'
    root.append(p)
    chrome.append(root)
    document.body.append(chrome)
    const click = new MouseEvent('click', { bubbles: true })
    p.dispatchEvent(click)
    expect(describeEvent(click, root)).toBe('<p> "inside"')
    expect(describeEvent(click)).toBe('<div role=main> "inside"')
  })

  it('is empty for an event without an element target', () => {
    expect(describeEvent(new Event('click'))).toBe('')
  })
})

describe('captureDomActions', () => {
  it('logs clicks inside the root — even when a component stops propagation', () => {
    const root = document.createElement('div')
    const button = document.createElement('button')
    button.textContent = 'Go'
    // A component that swallows its own click: the capture phase still sees it.
    button.addEventListener('click', (e) => e.stopPropagation())
    root.append(button)
    document.body.append(root)
    const log: string[] = []
    const stop = captureDomActions(root, (name, detail) => log.push(`${name} ${detail}`))
    button.click()
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    button.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(log).toEqual(['click <button> "Go"', 'focus <button> "Go"', 'blur <button> "Go"'])
    stop()
    button.click()
    expect(log).toHaveLength(3)
  })

  it('does not log pointer moves — they would flood a 24-entry ring', () => {
    expect(DOM_ACTION_EVENTS).not.toContain('pointermove' as never)
    expect(DOM_ACTION_EVENTS).not.toContain('mousemove' as never)
  })
})
