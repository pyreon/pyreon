/**
 * Security regression: the SANITIZED `innerHTML` prop's SSR/stream twins.
 *
 * `innerHTML` is Pyreon's SANITIZED innerHTML path — the client
 * (`applyStaticProp`) runs an allowlist sanitizer via `DOMParser`. That
 * sanitizer is DOM-based and CANNOT run in Node/workerd, so the SSR + stream
 * renderers used to emit the value RAW. Attacker-controlled markup then landed
 * in the initial HTML response and executed at PARSE time — before hydration
 * could re-sanitize it — a stored/reflected XSS. This was a client-guard
 * WITHOUT its SSR twin.
 *
 * The fix FAILS LOUD: both SSR paths throw a clear, actionable `[Pyreon]`
 * error instead of shipping raw markup (a DOM-based server sanitizer is a
 * follow-up — a hand-rolled string tokenizer over the SVG-inclusive allowlist
 * is mXSS-prone and deliberately not attempted). `dangerouslySetInnerHTML`
 * (raw by design, React semantics) is unaffected and still emits verbatim.
 *
 * Bisect: revert the two `throwSsrInnerHtmlUnsupported(tag)` calls in
 * `src/index.ts` back to `enqueue(String(plainInnerHtml))` / `html +=
 * String(plainInnerHtml)` → the `onerror` payload appears raw in the emitted
 * HTML and these specs fail (no throw, `onerror` present). Restore → blocked.
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { renderToStream, renderToString } from '../index'

const EXPLOIT = '<img src=x onerror=alert(1)>'
// Classic mXSS shape — inside `<svg>` foreign content the HTML parser treats
// `<style>`/`<title>` differently than a naive string tokenizer would.
const MXSS = '<svg><style><a title="</style><img src=x onerror=alert(1)>">'
const JS_URL = '<a href="javascript:alert(1)">click</a>'
const SVG_SCRIPT = '<svg><script>alert(1)</script></svg>'

// Accumulate whatever chunks a stream emitted, even when it errors — so we can
// assert the payload was NEVER enqueued before the throw surfaced.
async function collectStreamPartial(
  stream: ReadableStream<string>,
): Promise<{ out: string; error: unknown }> {
  const reader = stream.getReader()
  let out = ''
  let error: unknown = null
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      out += typeof value === 'string' ? value : new TextDecoder().decode(value as never)
    }
  } catch (err) {
    error = err
  }
  return { out, error }
}

describe('SSR sanitized-innerHTML XSS — fail-loud (string mode)', () => {
  for (const [name, payload] of [
    ['img onerror', EXPLOIT],
    ['mXSS svg/style breakout', MXSS],
    ['javascript: URL', JS_URL],
    ['svg <script>', SVG_SCRIPT],
  ] as const) {
    it(`throws instead of emitting raw markup — ${name}`, async () => {
      await expect(renderToString(h('div', { innerHTML: payload }))).rejects.toThrow(
        /\[Pyreon\].*sanitized `innerHTML` prop cannot be sanitized during SSR/,
      )
    })
  }

  it('never returns any HTML containing the executable payload', async () => {
    let out: string | undefined
    try {
      out = await renderToString(h('div', { innerHTML: EXPLOIT }))
    } catch {
      /* expected */
    }
    expect(out).toBeUndefined()
  })
})

describe('SSR sanitized-innerHTML XSS — fail-loud (stream mode)', () => {
  for (const [name, payload] of [
    ['img onerror', EXPLOIT],
    ['mXSS svg/style breakout', MXSS],
    ['svg <script>', SVG_SCRIPT],
  ] as const) {
    it(`stream errors and NEVER enqueues the payload — ${name}`, async () => {
      const { out, error } = await collectStreamPartial(
        renderToStream(h('div', { innerHTML: payload })),
      )
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toMatch(/cannot be sanitized during SSR/)
      // The open tag may have flushed, but the raw payload must never appear.
      expect(out).not.toContain('onerror')
      expect(out).not.toContain('alert(1)')
      expect(out).not.toContain('javascript:')
    })
  }
})

describe('SSR innerHTML — boundaries preserved', () => {
  it('dangerouslySetInnerHTML is RAW by design (unchanged) — string mode', async () => {
    const html = await renderToString(
      h('div', { dangerouslySetInnerHTML: { __html: EXPLOIT } }),
    )
    // The raw path is the developer-owns-sanitization contract; it emits verbatim.
    expect(html).toBe(`<div>${EXPLOIT}</div>`)
  })

  it('dangerouslySetInnerHTML is RAW by design (unchanged) — stream mode', async () => {
    const { out, error } = await collectStreamPartial(
      renderToStream(h('div', { dangerouslySetInnerHTML: { __html: EXPLOIT } })),
    )
    expect(error).toBeNull()
    expect(out).toContain(EXPLOIT)
  })

  it('empty innerHTML does NOT throw — falls through to children', async () => {
    const html = await renderToString(h('div', { innerHTML: '' }, h('em', null, 'child')))
    expect(html).toBe('<div><em>child</em></div>')
  })
})
