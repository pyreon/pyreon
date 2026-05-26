import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { query, queryAll, queryOptional } from '../dom-query'

describe('query', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    root.innerHTML = `
      <a href="/foo">link</a>
      <button data-testid="primary">go</button>
      <input type="text" name="email" />
      <div data-card>card</div>
      <span class="badge">!</span>
    `
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  describe('return-type narrowing via HTMLElementTagNameMap', () => {
    it('narrows tag selectors to the right HTMLXxxElement', () => {
      const anchor = query(root, 'a')
      // Type-level check — if this compiles, the narrowing works.
      const href: string = anchor.href
      expect(href).toContain('/foo')

      const button = query(root, 'button')
      const txt: string = button.textContent ?? ''
      expect(txt).toBe('go')

      const input = query(root, 'input')
      const name: string = input.name
      expect(name).toBe('email')
    })

    it('explicit generic narrows attribute / class / id selectors', () => {
      const card = query<HTMLDivElement>(root, '[data-card]')
      expect(card.dataset.card).toBe('')

      const badge = query<HTMLSpanElement>(root, '.badge')
      expect(badge.className).toBe('badge')
    })

    it('default generic for non-tag selectors returns HTMLElement', () => {
      const card = query(root, '[data-card]')
      expect(card).toBeInstanceOf(HTMLElement)
    })
  })

  describe('throwing semantics', () => {
    it('throws a labeled error when no element matches', () => {
      expect(() => query(root, '.does-not-exist')).toThrow(
        /\[@pyreon\/test-utils\] query: no element matches ".does-not-exist"/,
      )
    })

    it('throws on missing tag selector', () => {
      expect(() => query(root, 'form')).toThrow(/no element matches "form"/)
    })
  })
})

describe('queryOptional', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    root.innerHTML = `<button>x</button>`
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('returns the element when present (narrowed by tag map)', () => {
    const btn = queryOptional(root, 'button')
    expect(btn).not.toBeNull()
    // Type-level — should narrow to HTMLButtonElement | null.
    expect(btn?.type).toBe('submit') // default
  })

  it('returns null when missing — does not throw', () => {
    const result = queryOptional(root, '.missing')
    expect(result).toBeNull()
  })

  it('supports the absence-then-presence assertion pattern', () => {
    expect(queryOptional(root, '.modal')).toBeNull()
    const modal = document.createElement('div')
    modal.className = 'modal'
    root.appendChild(modal)
    expect(queryOptional(root, '.modal')).not.toBeNull()
  })
})

describe('queryAll', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    root.innerHTML = `
      <button>a</button>
      <button>b</button>
      <button>c</button>
      <span>not me</span>
    `
    document.body.appendChild(root)
  })

  afterEach(() => {
    root.remove()
  })

  it('returns a real Array (not NodeList)', () => {
    const buttons = queryAll(root, 'button')
    expect(Array.isArray(buttons)).toBe(true)
    expect(buttons).toHaveLength(3)
  })

  it('narrows return type by tag selector', () => {
    const buttons = queryAll(root, 'button')
    const labels = buttons.map((b) => b.textContent)
    expect(labels).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array when no matches (does not throw)', () => {
    const empty = queryAll(root, 'form')
    expect(empty).toEqual([])
  })

  it('supports explicit generic for attribute selectors', () => {
    const divs = queryAll<HTMLDivElement>(root, 'div')
    expect(divs).toEqual([]) // root has no nested divs
  })
})
