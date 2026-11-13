// @vitest-environment happy-dom
import type { HydrationMismatchContext } from '@pyreon/runtime-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { query } from '@pyreon/test-utils'
import { installDevOverlay, showDevOverlay } from '../dev-overlay'
import type { OverlayReport } from '../overlay/model'
import {
  overlayBehaviour,
  preferredTheme,
  renderOverlayDocument,
  renderOverlayMarkup,
} from '../overlay/view'

const handlers: Array<(ctx: HydrationMismatchContext) => void> = []

vi.mock('@pyreon/runtime-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pyreon/runtime-dom')>()
  return {
    ...actual,
    onHydrationMismatch: (h: (ctx: HydrationMismatchContext) => void) => {
      handlers.push(h)
      return () => {
        const i = handlers.indexOf(h)
        if (i >= 0) handlers.splice(i, 1)
      }
    },
  }
})

const report = (over: Partial<OverlayReport> = {}): OverlayReport => ({
  kind: 'render',
  route: '/x',
  message: 'boom',
  stack: [],
  ...over,
})

const ctx = (path = 'root > p'): HydrationMismatchContext => ({
  type: 'text',
  expected: 'client',
  actual: 'server',
  path,
  timestamp: 0,
})

const key = (k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  document.dispatchEvent(e)
  return e
}

/** happy-dom has no layout, so every element reports a box and counts as visible. */
const visible = vi.fn(() => [{}] as unknown as DOMRectList)

beforeEach(() => {
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(visible)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('overlayBehaviour — page mode', () => {
  const mount = () => {
    document.body.innerHTML = renderOverlayMarkup(
      report({
        location: { file: '/a.ts', display: 'a.ts', line: 3 },
        stack: [{ fn: 'f', file: 'f', library: false, where: 'src/f.ts' }],
      }),
      { mode: 'page' },
    )
    return overlayBehaviour(document)
  }

  it('focuses the primary action on open', () => {
    const off = mount()
    expect(document.activeElement?.hasAttribute('data-pz-copy')).toBe(true)
    off()
  })

  it('Esc hides the dialog and shows a "Show the error" button; clicking it brings the dialog back', () => {
    const off = mount()
    const wrap = query<HTMLElement>(document, '[data-pz-wrap]')
    const reopen = query<HTMLButtonElement>(document, '[data-pz-reopen]')
    const e = key('Escape')
    expect(e.defaultPrevented).toBe(true)
    expect(wrap.hidden).toBe(true)
    expect(reopen.hidden).toBe(false)
    expect(document.activeElement).toBe(reopen)
    // A second Esc while dismissed is ignored.
    expect(key('Escape').defaultPrevented).toBe(false)
    reopen.click()
    expect(wrap.hidden).toBe(false)
    expect(reopen.hidden).toBe(true)
    expect(document.activeElement?.hasAttribute('data-pz-copy')).toBe(true)
    off()
  })

  it('teardown removes the listeners', () => {
    const off = mount()
    off()
    expect(key('Escape').defaultPrevented).toBe(false)
    expect(query<HTMLElement>(document, '[data-pz-wrap]').hidden).toBe(false)
  })

  it('traps Tab: from the last control it wraps to the first, and Shift+Tab from the first wraps to the last', () => {
    const off = mount()
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-pz-dialog] a[href],[data-pz-dialog] button,[data-pz-dialog] summary,[data-pz-dialog] [tabindex="0"]',
      ),
    )
    const first = items[0] as HTMLElement
    const last = items[items.length - 1] as HTMLElement
    last.focus()
    expect(key('Tab').defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
    // In the middle Tab is left to the browser.
    items[1]?.focus()
    expect(key('Tab').defaultPrevented).toBe(false)
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(false)
    // Other keys are ignored.
    expect(key('a').defaultPrevented).toBe(false)
    off()
  })

  it('Tab from outside the dialog is pulled in', () => {
    const off = mount()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    // focusin on an outside element hands focus back to the primary action first.
    expect(document.activeElement?.hasAttribute('data-pz-copy')).toBe(true)
    off()
    outside.focus()
    expect(key('Tab').defaultPrevented).toBe(false)
  })

  it('does nothing on Tab when nothing is focusable', () => {
    const off = mount()
    visible.mockReturnValueOnce([] as unknown as DOMRectList)
    visible.mockReturnValue([] as unknown as DOMRectList)
    expect(key('Tab').defaultPrevented).toBe(false)
    visible.mockReturnValue([{}] as unknown as DOMRectList)
    off()
  })

  it('Tab from outside with the dialog focusable moves focus to the first control (Shift: last)', () => {
    const off = mount()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    // Skip the focusin guard by dispatching straight at the document with focus parked outside.
    Object.defineProperty(document, 'activeElement', { configurable: true, get: () => outside })
    expect(key('Tab').defaultPrevented).toBe(true)
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(true)
    delete (document as unknown as Record<string, unknown>).activeElement
    off()
  })
})

describe('overlayBehaviour — buttons', () => {
  const mount = () => {
    document.body.innerHTML = renderOverlayMarkup(
      report({ location: { file: '/a.ts', display: 'a.ts', line: 3, column: 2 } }),
      { mode: 'page' },
    )
    return overlayBehaviour(document)
  }
  const status = () => query<HTMLElement>(document, '[data-pz-status]').textContent

  it('Reload reloads the page', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const off = mount()
    ;query<HTMLElement>(document, '[data-pz-reload]').click()
    expect(reload).toHaveBeenCalledOnce()
    off()
  })

  it('Open in editor fetches the editor endpoint and says what happened', async () => {
    vi.useFakeTimers()
    const off = mount()
    const btn = query<HTMLElement>(document, 'button[data-pz-open]')
    const href = btn.getAttribute('data-pz-open')
    expect(href).toBe(`/__open-in-editor?file=${encodeURIComponent('/a.ts:3:2')}`)

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)
    btn.click()
    expect(fetchMock).toHaveBeenCalledWith(href)
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('Opening the file in your editor.')

    fetchMock.mockResolvedValue({ ok: false, status: 404 })
    btn.click()
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('The dev server could not open your editor (HTTP 404).')

    fetchMock.mockRejectedValue(new Error('down'))
    // The link form carries the href itself, not a data value.
    ;query<HTMLElement>(document, 'a[data-pz-open]').click()
    expect(fetchMock).toHaveBeenLastCalledWith(href)
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('The dev server could not be reached to open your editor.')
    off()
  })

  it('Copy uses the clipboard when it is there', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const off = mount()
    ;query<HTMLElement>(document, '[data-pz-copy]').click()
    expect(writeText).toHaveBeenCalledWith(
      query<HTMLTextAreaElement>(document, '[data-pz-copytext]').value,
    )
    expect(writeText.mock.calls[0]?.[0]).toContain('boom')
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('Copied. Paste it into your AI assistant.')
    off()
  })

  it('Copy falls back to execCommand when the clipboard is missing or refuses', async () => {
    vi.useFakeTimers()
    const exec = vi.fn().mockReturnValue(true)
    ;(document as unknown as { execCommand: unknown }).execCommand = exec
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const off = mount()
    const copy = query<HTMLElement>(document, '[data-pz-copy]')
    copy.click()
    expect(exec).toHaveBeenCalledWith('copy')
    // The temporary textarea is removed again.
    expect(document.querySelector('textarea[readonly]')).toBeNull()
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('Copied. Paste it into your AI assistant.')

    exec.mockReturnValue(false)
    copy.click()
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('Copying is blocked here. Select the error text and copy it by hand.')

    exec.mockImplementation(() => {
      throw new Error('denied')
    })
    copy.click()
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('Copying is blocked here. Select the error text and copy it by hand.')

    // A rejecting clipboard takes the same path.
    exec.mockReturnValue(true)
    exec.mockImplementation(() => true)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    })
    copy.click()
    await vi.advanceTimersByTimeAsync(40)
    expect(status()).toBe('Copied. Paste it into your AI assistant.')
    off()
  })

  it('ignores a click that is not on one of its controls', () => {
    const off = mount()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    ;query<HTMLElement>(document, '.pz-msg').click()
    expect(fetchMock).not.toHaveBeenCalled()
    off()
  })
})

describe('showDevOverlay — inline mode in a shadow root', () => {
  it('mounts over the page, applies the stored theme, and replaces an earlier overlay', () => {
    localStorage.setItem('zero-theme', 'light')
    const a = showDevOverlay(report({ kind: 'hydration' })) as HTMLElement
    expect(document.body.contains(a)).toBe(true)
    expect(a.shadowRoot?.querySelector('[data-pz-ol]')?.getAttribute('data-theme')).toBe('light')
    const b = showDevOverlay(report({ kind: 'hydration' })) as HTMLElement
    expect(document.body.contains(a)).toBe(false)
    expect(document.querySelectorAll('pyreon-dev-overlay')).toHaveLength(1)
    key('Escape')
  })

  it('Esc removes the host and gives focus back to what had it', () => {
    const before = document.createElement('button')
    document.body.appendChild(before)
    before.focus()
    const host = showDevOverlay(report()) as HTMLElement
    expect(key('Escape').defaultPrevented).toBe(true)
    expect(document.body.contains(host)).toBe(false)
    expect(document.activeElement).toBe(before)
  })

  it('focus that escapes the shadow root is pulled back to the primary action', () => {
    const host = showDevOverlay(report()) as HTMLElement
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    expect(host.shadowRoot?.activeElement?.hasAttribute('data-pz-copy')).toBe(true)
    key('Escape')
  })

  it('Tab inside the shadow root wraps at the ends', () => {
    const host = showDevOverlay(report()) as HTMLElement
    const root = host.shadowRoot as ShadowRoot
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-pz-dialog] button'))
    const first = items[0] as HTMLElement
    const last = items[items.length - 1] as HTMLElement
    // happy-dom's ShadowRoot.activeElement throws for a focused shadow child, so name the focused element.
    let active: Element | null = last
    Object.defineProperty(root, 'activeElement', { configurable: true, get: () => active })
    expect(key('Tab').defaultPrevented).toBe(true)
    active = first
    expect(key('Tab', { shiftKey: true }).defaultPrevented).toBe(true)
    key('Escape')
  })
})

describe('preferredTheme', () => {
  it('prefers zero-theme, then pyreon-theme, then the page data-theme, else undefined', () => {
    expect(preferredTheme()).toBeUndefined()
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(preferredTheme()).toBe('dark')
    localStorage.setItem('pyreon-theme', 'light')
    expect(preferredTheme()).toBe('light')
    localStorage.setItem('zero-theme', 'dark')
    expect(preferredTheme()).toBe('dark')
    localStorage.setItem('zero-theme', 'purple')
    expect(preferredTheme()).toBe('light')
  })

  it('falls back to the page attribute when storage throws', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(preferredTheme()).toBe('light')
  })
})

describe('renderOverlayDocument / renderOverlayMarkup', () => {
  it('inlines the behaviour and theme script into the page document', () => {
    const html = renderOverlayDocument(report({ route: '/a<b' }))
    expect(html).toContain('<script>')
    expect(html).toContain('data-pz-ol')
    expect(html).toContain('/a&lt;b')
    expect(html).toContain('data-pz-reopen')
  })

  it('renders details, a location without a column, a code frame with a caret, a fix with code, library frames and a note', () => {
    const html = renderOverlayMarkup(
      report({
        details: [{ label: 'Where', value: 'x' }],
        location: { file: '/a.ts', display: 'a.ts', line: 7 },
        frame: {
          caret: 3,
          lines: [
            { number: 6, text: '', highlight: false },
            { number: 7, text: 'bad()', highlight: true },
          ],
        },
        fix: { cause: 'use `a`', fix: 'do `b`', fixCode: 'b()' },
        stack: [
          { fn: '', file: 'f', library: true, where: 'pkg' },
          { fn: 'app', file: 'g', library: false, where: 'src/g.ts' },
        ],
        note: 'two more',
      }),
      { mode: 'inline' },
    )
    expect(html).toContain('<dt>Where</dt>')
    expect(html).toContain(encodeURIComponent('/a.ts:7'))
    expect(html).toContain('  ^ here')
    expect(html).toContain('<pre><code>b()</code></pre>')
    expect(html).toContain('<code>a</code>')
    expect(html).toContain('(anonymous)')
    expect(html).toContain('pz-lib')
    expect(html).toContain('two more')
    expect(html).not.toContain('data-pz-reopen')
  })
})

describe('installDevOverlay', () => {
  afterEach(() => {
    for (const h of [...handlers]) handlers.splice(handlers.indexOf(h), 1)
  })

  it('is a no-op in production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      expect(installDevOverlay()()).toBeUndefined()
      expect(handlers).toHaveLength(0)
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('is idempotent, mounts once after hydration with the first mismatch and a count of the rest, and unregisters', () => {
    vi.useFakeTimers()
    const off = installDevOverlay()
    expect(installDevOverlay()).toBe(off)
    expect(handlers).toHaveLength(1)
    const h = handlers[0] as (c: HydrationMismatchContext) => void
    h(ctx('first'))
    h(ctx('second'))
    h(ctx('third'))
    expect(document.querySelector('pyreon-dev-overlay')).toBeNull()
    vi.runAllTimers()
    const host = query<HTMLElement>(document, 'pyreon-dev-overlay')
    expect(host.shadowRoot?.textContent).toContain('at first')
    expect(host.shadowRoot?.textContent).toContain('2 more mismatches on this page')
    host.remove()
    // A later mismatch schedules a fresh overlay.
    h(ctx('later'))
    vi.runAllTimers()
    expect(document.querySelector('pyreon-dev-overlay')?.shadowRoot?.textContent).toContain(
      'at later',
    )
    document.querySelector('pyreon-dev-overlay')?.remove()
    off()
    expect(handlers).toHaveLength(0)
  })
})
