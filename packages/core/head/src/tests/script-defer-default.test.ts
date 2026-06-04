/**
 * `useHead({ script: [...] })` defer-default contract.
 *
 * Modern web-perf best practice (Lighthouse "Eliminate render-blocking
 * resources" / Core Web Vitals): never emit a `<script src=...>` tag
 * that blocks HTML parsing. By default Pyreon's `useHead` adds `defer`
 * to any script tag with `src` and no explicit load strategy
 * (`type` / `async` / `defer`).
 *
 * Inline scripts (no `src`) are NOT touched — they're explicit
 * synchronous content by design.
 *
 * Author overrides ALWAYS win:
 *   - `type="module"` → module scripts defer by spec; no-op.
 *   - `async: ''`     → keep author intent (parallel + first-resolved-wins).
 *   - `defer: ''`     → already present.
 *
 * Bisect-verifiable: remove the defer-default branch in `use-head.ts`
 * → the `external src defaults to defer` spec fails with the script
 * tag missing the `defer=""` attribute.
 */
import { describe, expect, it } from 'vitest'
import { h, onMount, type VNode } from '@pyreon/core'
import { renderWithHead } from '../ssr'
import { useHead } from '../use-head'

async function head(node: VNode): Promise<string> {
  const r = await renderWithHead(node)
  return r.head
}

function Probe(props: {
  src?: string
  type?: string
  async?: string
  defer?: string
  children?: string
}): null {
  useHead({
    script: [
      {
        ...(props.src !== undefined ? { src: props.src } : {}),
        ...(props.type !== undefined ? { type: props.type } : {}),
        ...(props.async !== undefined ? { async: props.async } : {}),
        ...(props.defer !== undefined ? { defer: props.defer } : {}),
        ...(props.children !== undefined ? { children: props.children } : {}),
      },
    ],
  })
  // Suppress dev warning about onMount-less <Probe>
  onMount(() => undefined)
  return null
}

describe('useHead({ script }) — defer default for non-blocking page load', () => {
  it('external src defaults to defer (no async/type/defer set by author)', async () => {
    const out = await head(h(Probe, { src: 'https://cdn.example.com/x.js' }))
    expect(out).toContain('src="https://cdn.example.com/x.js"')
    expect(out).toContain('defer')
  })

  it('author-set async is preserved (no defer added — author intent wins)', async () => {
    const out = await head(h(Probe, { src: '/x.js', async: '' }))
    expect(out).toContain('async')
    // Defer should NOT have been auto-added.
    expect(out).not.toContain('defer')
  })

  it('author-set defer is preserved (no duplicate)', async () => {
    const out = await head(h(Probe, { src: '/x.js', defer: '' }))
    // Exactly ONE defer attr (no duplicate added).
    const matches = out.match(/\bdefer\b/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('type="module" preserved without adding defer (modules defer by spec)', async () => {
    const out = await head(h(Probe, { src: '/x.js', type: 'module' }))
    expect(out).toContain('type="module"')
    expect(out).not.toContain('defer')
  })

  it('type="importmap" preserved without adding defer', async () => {
    // importmap MUST execute synchronously per spec; never add defer.
    const out = await head(h(Probe, { src: '/imap.js', type: 'importmap' }))
    expect(out).toContain('type="importmap"')
    expect(out).not.toContain('defer')
  })

  it('inline script (no src) is NOT touched — synchronous by design', async () => {
    const out = await head(h(Probe, { children: 'console.log("hi")' }))
    expect(out).toContain('console.log')
    // No defer added to an inline script (it has no src — defer is meaningless).
    expect(out).not.toContain('defer')
  })

  it('inline JSON-LD (type="application/ld+json") is unaffected by the default', async () => {
    const root: VNode = h(
      function Inner(): null {
        useHead({ jsonLd: { '@type': 'Article', headline: 'X' } })
        onMount(() => undefined)
        return null
      } as never,
      null,
    )
    const out = await head(root)
    expect(out).toContain('application/ld+json')
    expect(out).not.toContain('defer')
  })
})
