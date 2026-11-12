/**
 * The compiled-hydration mismatch helpers in `hydration-debug.ts`, driven at
 * their contract: what path a mismatch is reported at, what is (and is not)
 * reported for a first text write, and the leak-class-A removal rule of the
 * path-root stack. Real DOM (happy-dom), real `onHydrationMismatch` handlers.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  _markServerText,
  _popPathRoot,
  _pushPathRoot,
  compiledMismatchPath,
  compiledParentPath,
  onHydrationMismatch,
  rangeText,
  reportFirstText,
  reportTextWrite,
} from '../hydration-debug'

interface Seen {
  type: string
  expected: unknown
  actual: unknown
  path: string
}

const seen: Seen[] = []
const off = onHydrationMismatch((c) => {
  seen.push({ type: c.type, expected: c.expected, actual: c.actual, path: c.path })
})
afterEach(() => {
  seen.length = 0
})
// The handler is module-lifetime on purpose (one per file); no teardown needed
// beyond the array reset, but keep the unsubscribe referenced for the linter.
void off

const el = (html: string): HTMLElement => {
  const host = document.createElement('div')
  host.innerHTML = html
  return host
}

describe('compiledParentPath', () => {
  it('is just `root` for a null parent', () => {
    expect(compiledParentPath(null)).toBe('root')
  })

  it('lists the element ancestors up to the hydration container', () => {
    const host = el('<section><p><b id="leaf"></b></p></section>')
    const leaf = host.querySelector('#leaf')!
    _pushPathRoot(host)
    try {
      expect(compiledParentPath(leaf)).toBe('root > section > p > b')
      expect(compiledMismatchPath(leaf, 'text')).toBe('root > section > p > b > text')
    } finally {
      _popPathRoot(host)
    }
  })

  it('starts at the INNERMOST root when containers nest (islands)', () => {
    const outer = el('<main><div id="island"><i id="x"></i></div></main>')
    const island = outer.querySelector('#island')!
    const x = outer.querySelector('#x')!
    _pushPathRoot(outer)
    _pushPathRoot(island)
    try {
      expect(compiledParentPath(x)).toBe('root > i')
    } finally {
      _popPathRoot(island)
      _popPathRoot(outer)
    }
  })

  it('removes a root by identity, so an out-of-order pop leaves the other root', () => {
    const a = el('<p id="a"></p>')
    const b = el('<p id="b"></p>')
    const inA = a.firstElementChild!
    _pushPathRoot(a)
    _pushPathRoot(b)
    _popPathRoot(a) // out of order: b must stay the innermost root
    try {
      // `inA` is not under `b`, so the walk runs to the detached top: its own tag + a's tag chain
      expect(compiledParentPath(inA)).toBe('root > div > p')
      // popping a root that is not on the stack is a no-op, not a crash
      _popPathRoot(a)
      expect(compiledParentPath(b.firstElementChild)).toBe('root > p')
    } finally {
      _popPathRoot(b)
    }
  })
})

describe('rangeText', () => {
  it('reads the text of a depth-aware `<!--$-->…<!--/$-->` range', () => {
    const host = el('<!--$-->a<!--$-->b<!--/$-->c<!--/$-->tail')
    const open = host.firstChild as Comment
    expect(rangeText(open)).toBe('abc')
  })

  it('reads to the end when the range is never closed', () => {
    const host = el('<!--$-->open<b>x</b>')
    expect(rangeText(host.firstChild as Comment)).toBe('openx')
  })
})

describe('reportFirstText', () => {
  it('reports adopted server text that the first write will change', () => {
    const host = el('<p>server</p>')
    const text = host.firstElementChild!.firstChild as Text
    reportFirstText(text, 'client', 'client', 'text')
    expect(seen).toEqual([
      { type: 'text', expected: 'client', actual: 'server', path: 'root > div > p > text' },
    ])
  })

  it('is silent when the write equals the server text', () => {
    const text = document.createTextNode('same')
    reportFirstText(text, 'same', 'same', 'reactive')
    expect(seen).toEqual([])
  })

  it('is silent for an object or function value (mounted, not written as text)', () => {
    const text = document.createTextNode('server')
    reportFirstText(text, { vnode: true }, 'x', 'text')
    reportFirstText(text, () => 'x', 'x', 'reactive')
    expect(seen).toEqual([])
  })

  it('compares against the branded server text of a FRESH node, not its own data', () => {
    const host = el('<p></p>')
    const fresh = document.createTextNode('client')
    host.firstElementChild!.appendChild(fresh)
    _markServerText(fresh, 'from server')
    reportFirstText(fresh, 'client', 'client', 'reactive')
    expect(seen).toEqual([
      { type: 'text', expected: 'client', actual: 'from server', path: 'root > div > p > reactive' },
    ])
    // a fresh node whose branded text already equals the write reports nothing
    seen.length = 0
    _markServerText(fresh, 'client')
    reportFirstText(fresh, 'client', 'client', 'reactive')
    expect(seen).toEqual([])
  })
})

describe('reportTextWrite', () => {
  it('reports a text node whose static write changed the server text', () => {
    const host = el('<p>old</p>')
    const text = host.firstElementChild!.firstChild as Text
    const before = text.data
    text.data = 'new'
    reportTextWrite(text, before, 'text')
    expect(seen).toEqual([{ type: 'text', expected: 'new', actual: 'old', path: 'root > div > p > text' }])
  })

  it('reports an element whose textContent was set, at the element itself', () => {
    const host = el('<p>old</p>')
    const p = host.firstElementChild!
    const before = p.textContent ?? ''
    p.textContent = 'new'
    reportTextWrite(p, before, 'text')
    expect(seen).toEqual([{ type: 'text', expected: 'new', actual: 'old', path: 'root > div > p > text' }])
  })

  it('is silent when the write left the server text as it was', () => {
    const host = el('<p>same</p>')
    const text = host.firstElementChild!.firstChild as Text
    reportTextWrite(text, 'same', 'text')
    reportTextWrite(host.firstElementChild!, 'same', 'text')
    expect(seen).toEqual([])
  })
})
