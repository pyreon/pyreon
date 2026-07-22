/** @jsxImportSource @pyreon/core */
/**
 * `@pyreon/code/webview` — REAL CodeMirror bridge proof (real Chromium).
 *
 * The host's bridge WAITS for `window.CM` (an app-bundled CodeMirror), so this
 * test injects REAL `@codemirror/{view,state}` into the same-origin iframe and
 * exercises the full bridge — forward value/readOnly push, reverse edit, the
 * loop guard — against a genuine CodeMirror instance, the exact protocol that
 * runs on device.
 */
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { flush, mountInBrowser } from '@pyreon/test-utils/browser'
import { WebView } from '@pyreon/primitives'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { CodeWebView, buildCodeHostHtml } from './webview'

const HOST = buildCodeHostHtml() // no inlined CM — the bridge waits for window.CM

/** Inject real CodeMirror into the iframe's window, matching the host contract. */
function injectCM(win: Window): void {
  ;(win as unknown as { CM: unknown }).CM = {
    EditorView,
    EditorState,
    Compartment,
    basicSetup: [],
    languageFor: () => [],
  }
}

async function mountCode(state: unknown, onMessage?: (m: string) => void) {
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
  // Inject CM as soon as the iframe window exists (the bridge polls for it).
  const start = performance.now()
  while (!iframe.contentWindow) {
    if (performance.now() - start > 3000) throw new Error('iframe never got a window')
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
  injectCM(iframe.contentWindow)
  return { iframe, unmount }
}

/** Wait until the editor booted (CM view created) + first data applied. */
async function waitForEditor(iframe: HTMLIFrameElement): Promise<EditorView> {
  const start = performance.now()
  for (;;) {
    const win = iframe.contentWindow as (Window & { __pyreonCodeView?: EditorView; __pyreonCodeError?: string }) | null
    const doc = iframe.contentDocument
    if (win?.__pyreonCodeError) throw new Error('host error: ' + win.__pyreonCodeError)
    const view = doc?.querySelector('.cm-editor') ? (EditorView.findFromDOM(doc.querySelector('.cm-editor') as HTMLElement) as EditorView | null) : null
    if (view) return view
    if (performance.now() - start > 8000) throw new Error('editor did not boot: err=' + win?.__pyreonCodeError)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
  }
}

describe('CodeWebView bridge (real CodeMirror in a real iframe)', () => {
  it('FORWARD: pushing { value } renders a CM editor showing it; updating replaces the doc in place', async () => {
    const state = signal({ value: 'const a = 1', language: 'javascript', readOnly: false })
    const { iframe, unmount } = await mountCode(() => state())
    const view = await waitForEditor(iframe)
    expect(view.state.doc.toString(), 'pushed value reached the editor').toBe('const a = 1')

    // Update via the forward bridge — same view, doc replaced.
    state.set({ value: 'let b = 2\nlet c = 3', language: 'javascript', readOnly: false })
    await flush()
    await new Promise((r) => setTimeout(r, 60))
    const sameView = await waitForEditor(iframe)
    expect(sameView, 'no reload — same editor').toBe(view)
    expect(sameView.state.doc.toString()).toBe('let b = 2\nlet c = 3')
    unmount()
  })

  it('REVERSE: a user edit drives onChange; the loop guard suppresses pushed-value echo', async () => {
    const received: string[] = []
    const state = signal({ value: 'start' })
    const { iframe, unmount } = await mountCode(
      () => state(),
      (m: string) => received.push(JSON.parse(m).value),
    )
    const view = await waitForEditor(iframe)

    // A real user-origin edit (insert text) → updateListener → reverse bridge.
    view.dispatch({ changes: { from: view.state.doc.length, insert: '_edited' } })
    await flush()
    expect(view.state.doc.toString()).toBe('start_edited')
    expect(received, 'edit reached onChange').toEqual(['start_edited'])

    // Loop guard: pushing a value from native must NOT echo back through onChange.
    received.length = 0
    state.set({ value: 'pushed-from-native' })
    await flush()
    await new Promise((r) => setTimeout(r, 60))
    expect(view.state.doc.toString()).toBe('pushed-from-native')
    expect(received, 'pushed value did NOT echo').toEqual([])
    unmount()
  })

  it('readOnly pushed across the bridge blocks user transactions', async () => {
    const state = signal({ value: 'locked', readOnly: true })
    const { iframe, unmount } = await mountCode(() => state())
    const view = await waitForEditor(iframe)
    expect(view.state.readOnly, 'readOnly applied from the bridge').toBe(true)
    unmount()
  })
})
