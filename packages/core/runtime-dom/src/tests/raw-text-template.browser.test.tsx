/**
 * Raw-text elements (`<script>`/`<style>`) vs the compiled `_tpl` bake — real
 * Chromium, because **happy-dom masks the class**: it decodes character
 * references inside `<style>` like ordinary text, so an entity-encoded bake
 * reads back as the original CSS there and the broken compiler and the fixed
 * one are indistinguishable (the happy-dom mount spec in
 * `template-escape-audit.test.tsx` passed against the reverted gate — this
 * file is the one that can tell them apart).
 *
 * Per the HTML spec the content of `<script>`/`<style>` is RAW TEXT: the
 * parser never decodes `&gt;`/`&#10;` there, so a `_tpl` HTML string carrying
 * the entity-escaped CSS the compiler used to emit renders the entity
 * CHARACTERS (`.b &gt; i` — an invalid selector, rule dropped). The compiler
 * now bails such elements to h(), whose `textContent` assignment is correct.
 * The hand-written `_tpl` below is exactly the pre-fix emit
 * (`template-escape-audit.test.ts` locks that the compiler no longer produces
 * it); this spec locks WHY.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { _tpl, mountChild } from '../index'

const CSS = '.a { color: red }\n.b > i { top: 0 }'

describe('raw-text elements in real Chromium', () => {
  it('an entity-escaped <style> bake renders the ENTITIES literally (the pre-fix emit)', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(
      _tpl('<style>.a { color: red }&#10;.b &gt; i { top: 0 }</style>', () => null),
      container,
    )
    expect(container.querySelector('style')!.textContent).not.toBe(CSS)
    expect(container.querySelector('style')!.textContent).toContain('&gt;')
    cleanup()
    container.remove()
  })

  it('the h() path the compiler now bails to keeps the CSS byte-for-byte and the rule applies', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const cleanup = mountChild(
      h('div', null, h('style', null, CSS), h('b', { class: 'b' }, h('i', { class: 'probe' }, 'x'))),
      container,
    )
    expect(container.querySelector('style')!.textContent).toBe(CSS)
    expect(getComputedStyle(container.querySelector('.probe')!).top).toBe('0px')
    cleanup()
    container.remove()
  })
})
