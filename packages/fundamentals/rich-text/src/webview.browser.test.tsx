/** @jsxImportSource @pyreon/core */
/**
 * `@pyreon/rich-text/webview` — REAL TipTap bridge proof (real Chromium).
 *
 * The host's bridge WAITS for a `window.TT` factory (the app's bundled TipTap),
 * so this test injects a factory backed by REAL `@tiptap/core` +
 * `@tiptap/starter-kit` into the same-origin iframe and exercises the full
 * bridge — forward content/editable push, reverse edit, the loop guard —
 * against a genuine TipTap editor.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { WebView } from '@pyreon/primitives'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { RichTextWebView, buildRichTextHostHtml } from './webview'

const HOST = buildRichTextHostHtml() // no inlined TT — the bridge waits for window.TT

interface HostEditor {
  setContent(c: unknown): void
  setEditable(on: boolean): void
  destroy(): void

}

/** Inject a real-TipTap `window.TT` factory into the iframe (the app's contract). */
function injectTT(win: Window): void {
  ;(win as unknown as { TT: unknown }).TT = {
    createEditor(el: HTMLElement, opts: { content?: unknown; editable?: boolean; onUpdate: (json: unknown) => void }): HostEditor {
      const editor = new Editor({
        element: el,
        extensions: [StarterKit],
        content: (opts.content as never) ?? undefined,
        editable: opts.editable !== false,
        onUpdate: ({ editor: e }) => opts.onUpdate(e.getJSON()),
      })
      return {
        // emitUpdate:false so a programmatic (native-pushed) setContent does
        // NOT echo through onUpdate — the primary loop guard.
        setContent: (c: unknown) => editor.commands.setContent(c as never, { emitUpdate: false } as never),
        setEditable: (on: boolean) => editor.setEditable(on),
        destroy: () => editor.destroy(),

      }
    },
  }
}

const para = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

async function mountRT(state: unknown, onMessage?: (m: string) => void) {
  const wvProps: Record<string, unknown> = { html: HOST }
  Object.defineProperty(wvProps, 'data', {
    enumerable: true,
    configurable: true,
    get: () => (typeof state === 'function' ? (state as () => unknown)() : state),
  })
  if (onMessage) wvProps.onMessage = onMessage
  const { container, unmount } = mountInBrowser(h(WebView as never, wvProps))
  container.style.width = '400px'
  container.style.height = '240px'
  await flush()
  const iframe = container.querySelector('iframe') as HTMLIFrameElement
  const start = performance.now()
  while (!iframe.contentWindow) {
    if (performance.now() - start > 3000) throw new Error('iframe never got a window')
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
  injectTT(iframe.contentWindow)
  return { iframe, unmount }
}

// Wait until the editor booted AND the initial forward content applied (non-empty
// text). All three tests push non-empty initial content, so waiting for it
// guarantees the bridge's `apply()` ran before we assert — the WebView's initial
// data push lands a tick AFTER the synchronous boot, and asserting on boot alone
// races that push (the same class the code host's waitForEditor guards).
async function waitForEditor(iframe: HTMLIFrameElement): Promise<HTMLElement> {
  const start = performance.now()
  for (;;) {
    const win = iframe.contentWindow as (Window & { __pyreonRichTextError?: string }) | null
    const pm = iframe.contentDocument?.querySelector('.ProseMirror') as HTMLElement | null
    if (win?.__pyreonRichTextError) throw new Error('host error: ' + win.__pyreonRichTextError)
    if (pm && (pm.textContent ?? '').length > 0) return pm
    if (performance.now() - start > 8000) throw new Error('editor did not boot / content not applied: err=' + win?.__pyreonRichTextError)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

describe('RichTextWebView bridge (real TipTap in a real iframe)', () => {
  it('FORWARD: pushing { content } renders a TipTap editor showing it; updating replaces in place', async () => {
    const state = signal({ content: para('First draft'), editable: true })
    const { iframe, unmount } = await mountRT(() => state())
    const pm = await waitForEditor(iframe)
    expect(pm.textContent, 'pushed content rendered').toContain('First draft')

    state.set({ content: para('Second version'), editable: true })
    await flush()
    await new Promise((r) => setTimeout(r, 80))
    // Same editor element, content replaced.
    expect(iframe.contentDocument!.querySelectorAll('.ProseMirror').length, 'no reload').toBe(1)
    expect(iframe.contentDocument!.querySelector('.ProseMirror')!.textContent).toContain('Second version')
    unmount()
  })

  it('REVERSE: a user edit drives onChange; the loop guard suppresses pushed-content echo', async () => {
    const received: unknown[] = []
    const state = signal({ content: para('start') })
    const { iframe, unmount } = await mountRT(
      () => state(),
      (m: string) => received.push(JSON.parse(m).content),
    )
    const ce = await waitForEditor(iframe)
    // A real user-origin edit into the ProseMirror contenteditable → TipTap
    // onUpdate → reverse bridge. execCommand('insertText') is a genuine
    // user-input-style mutation ProseMirror observes.
    ce.focus()
    const sel = iframe.contentWindow!.getSelection()!
    sel.selectAllChildren(ce)
    sel.collapseToEnd()
    iframe.contentDocument!.execCommand('insertText', false, '!')
    await flush()
    await new Promise((r) => setTimeout(r, 60))

    expect(received.length, 'edit reached onChange').toBeGreaterThan(0)
    expect(ce.textContent).toContain('start!')

    // Loop guard: a native push must NOT echo through onChange.
    received.length = 0
    state.set({ content: para('pushed-from-native') })
    await flush()
    await new Promise((r) => setTimeout(r, 80))
    expect(ce.textContent).toContain('pushed-from-native')
    expect(received, 'pushed content did NOT echo').toEqual([])
    unmount()
  })

  it('editable:false pushed across the bridge makes the editor read-only', async () => {
    const state = signal({ content: para('locked'), editable: false })
    const { iframe, unmount } = await mountRT(() => state())
    const pm = await waitForEditor(iframe)
    expect(pm.getAttribute('contenteditable')).toBe('false')
    unmount()
  })

  // The ergonomic <RichTextWebView> component (not the raw <WebView> the bridge
  // tests above drive) — proves the shipped wrapper builds its own host, forwards
  // `state` reactively, and routes reverse edits through `onChange` in a real
  // browser (the unit test only checks its emit shape).
  it('<RichTextWebView> forwards state reactively + drives onChange through a real editor', async () => {
    const content = signal(para('wrapped draft'))
    const edits: unknown[] = []
    const { container, unmount } = mountInBrowser(
      h(RichTextWebView as never, { state: () => ({ content: content() }), onChange: (c: unknown) => edits.push(c) }),
    )
    container.style.width = '400px'
    container.style.height = '240px'
    await flush()
    const iframe = container.querySelector('iframe') as HTMLIFrameElement
    const start = performance.now()
    while (!iframe.contentWindow) {
      if (performance.now() - start > 3000) throw new Error('iframe never got a window')
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    }
    injectTT(iframe.contentWindow)
    const pm = await waitForEditor(iframe)
    expect(pm.textContent, 'component forwarded initial state').toContain('wrapped draft')

    // Reactive forward: bumping the signal replaces the document in place.
    content.set(para('wrapped v2'))
    await flush()
    await new Promise((r) => setTimeout(r, 80))
    expect(iframe.contentDocument!.querySelector('.ProseMirror')!.textContent).toContain('wrapped v2')

    // Reverse: a user edit routes through the component's onChange.
    pm.focus()
    const sel = iframe.contentWindow!.getSelection()!
    sel.selectAllChildren(iframe.contentDocument!.querySelector('.ProseMirror')!)
    sel.collapseToEnd()
    iframe.contentDocument!.execCommand('insertText', false, '!')
    await flush()
    await new Promise((r) => setTimeout(r, 60))
    expect(edits.length, 'edit routed through <RichTextWebView> onChange').toBeGreaterThan(0)
    unmount()
  })
})
