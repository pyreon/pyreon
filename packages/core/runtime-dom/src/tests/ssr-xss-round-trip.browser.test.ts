import { afterEach, describe, expect, it, vi } from 'vitest'

// End-to-end XSS round-trip for the For-key-marker fix (PR #235).
// The happy-dom/Node tests assert the encoder produces safe-looking
// output; this one asserts a real Chromium browser parses the encoded
// SSR output without executing the injected script.
//
// runtime-server can't be imported in the browser (Node async_hooks),
// so we reconstruct SSR-shaped output directly: a pre-fix (vulnerable)
// string to prove the attack model, and a post-fix (encoded) string
// to prove the fix neutralizes it.

describe('SSR → real-browser round-trip — For-key marker XSS', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('unencoded attacker key in marker would execute script in Chromium (attack model)', async () => {
    const win = window as Window & { __preFixFired?: boolean }
    win.__preFixFired = false

    // Build what PRE-fix SSR would have emitted: the raw attacker key
    // interpolated directly into the comment.
    const attackKey = `--><script>window.__preFixFired = true</script><!--`
    const preFixHtml =
      `<!--pyreon-for--><!--k:${attackKey}--><li>item</li><!--/pyreon-for-->`

    const container = document.createElement('div')
    // innerHTML does not execute <script> per HTML5 spec — so use
    // document.write-free manual parsing via DOMParser, then adopt.
    // This mirrors what a streaming renderer would produce.
    const parsed = new DOMParser().parseFromString(
      `<body>${preFixHtml}</body>`,
      'text/html',
    )
    // Move the parsed body's children into our container; re-insert
    // script tags via createElement so they execute in the real page.
    for (const node of Array.from(parsed.body.childNodes)) {
      if (node.nodeType === 1 && (node as Element).tagName === 'SCRIPT') {
        const s = document.createElement('script')
        s.textContent = (node as HTMLScriptElement).textContent ?? ''
        container.appendChild(s)
      } else {
        container.appendChild(node)
      }
    }
    document.body.appendChild(container)
    await new Promise((r) => setTimeout(r, 0))

    // Attack model proof: the raw form DOES execute when re-inserted.
    expect(win.__preFixFired).toBe(true)

    container.remove()
    delete win.__preFixFired
  })

  it('encoded marker (post-fix) does NOT execute script in Chromium', async () => {
    const win = window as Window & { __postFixFired?: boolean }
    win.__postFixFired = false

    // Build what POST-fix SSR emits after safeKeyForMarker:
    // encodeURIComponent then all `-` → `%2D`.
    const attackKey = `--><script>window.__postFixFired = true</script><!--`
    const encoded = encodeURIComponent(attackKey).replace(/-/g, '%2D')
    const postFixHtml =
      `<!--pyreon-for--><!--k:${encoded}--><li>item</li><!--/pyreon-for-->`

    const container = document.createElement('div')
    const parsed = new DOMParser().parseFromString(
      `<body>${postFixHtml}</body>`,
      'text/html',
    )
    for (const node of Array.from(parsed.body.childNodes)) {
      if (node.nodeType === 1 && (node as Element).tagName === 'SCRIPT') {
        const s = document.createElement('script')
        s.textContent = (node as HTMLScriptElement).textContent ?? ''
        container.appendChild(s)
      } else {
        container.appendChild(node)
      }
    }
    document.body.appendChild(container)
    await new Promise((r) => setTimeout(r, 0))

    // Post-fix: no script was parsed out of the marker. Encoded key
    // stays inside the comment; nothing to execute.
    expect(win.__postFixFired).toBe(false)
    expect(container.querySelector('script')).toBeNull()

    container.remove()
    delete win.__postFixFired
  })
})
