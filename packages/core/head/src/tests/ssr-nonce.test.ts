import { describe, expect, it } from 'vitest'
import type { HeadTag } from '../context'
import { serializeHead } from '../ssr'

// CSP: `serializeHead(tags, titleTemplate, nonce)` stamps the per-request nonce
// onto every inline/executable tag it emits so a strict `script-src`/`style-src
// 'nonce-…'` policy admits them. Only `<script>` / `<style>` are nonce-eligible.
describe('serializeHead — CSP nonce', () => {
  const scriptTag: HeadTag = {
    tag: 'script',
    props: { type: 'application/ld+json' },
    children: '{"@type":"X"}',
  }
  const styleTag: HeadTag = { tag: 'style', props: {}, children: '.a{color:red}' }
  const metaTag: HeadTag = { tag: 'meta', props: { name: 'x', content: 'y' } }
  const linkTag: HeadTag = { tag: 'link', props: { rel: 'stylesheet', href: '/a.css' } }

  it('stamps nonce on <script> and <style>, never on <meta>/<link>', () => {
    const out = serializeHead([scriptTag, styleTag, metaTag, linkTag], undefined, 'nonceABC')
    expect(out).toContain('<script type="application/ld+json" nonce="nonceABC">')
    expect(out).toContain('<style nonce="nonceABC">')
    // meta/link are external/inert — not nonce-eligible.
    expect(out).not.toContain('name="x" content="y" nonce=')
    expect(out).not.toContain('href="/a.css" nonce=')
  })

  it('omits the nonce attribute when no nonce is given (byte-identical)', () => {
    const out = serializeHead([scriptTag, styleTag], undefined)
    expect(out).not.toContain('nonce=')
  })

  it('respects a user-supplied nonce on the tag (never double-stamps)', () => {
    const userNonce: HeadTag = { tag: 'script', props: { nonce: 'user-set' }, children: 'x' }
    const out = serializeHead([userNonce], undefined, 'request-nonce')
    expect(out).toContain('nonce="user-set"')
    expect(out).not.toContain('request-nonce')
  })
})
