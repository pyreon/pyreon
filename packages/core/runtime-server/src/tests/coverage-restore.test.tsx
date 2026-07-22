/**
 * Coverage-restoring REAL tests for arms the recent SSR fast-path work
 * (#2281/#2375/#2382) shipped thin — the Coverage (Full) main gate caught
 * the drift. Every spec exercises a REAL contract:
 *
 * - `_ssrForKeyed` (the fused keyed-<For> SSR emit): sync rows, accessor
 *   `each`, iterable spread, RawHtml rows, and the ASYNC-row continuation
 *   (resume-at-next-index — the marker/order contract must hold across the
 *   promotion).
 * - `RawHtml` nodes through the STREAMING renderer (renderToStream of an
 *   `_ssr` fast-path subtree).
 * - Stream cancellation: an aborted consumer closes silently (no error).
 * - `collectOptionText` with nested-array option children (PZ-09 select).
 */
import { h } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { _ssr, _ssrForKeyed, renderToStream, renderToString } from '../index'

// RawHtml is deliberately NOT exported — obtain instances through the public
// `_ssr` fast-path emitters and duck-type on `.value`.
type RawLike = { value: string }
const raw = (html: string): RawLike => _ssr([html]) as RawLike

async function drain(stream: ReadableStream<unknown>): Promise<string> {
  const reader = stream.getReader()
  const dec = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return out
    out += typeof value === 'string' ? value : dec.decode(value as Uint8Array)
  }
}

describe('_ssrForKeyed — the fused keyed-<For> SSR fast path', () => {
  const by = (x: unknown) => (x as { id: string }).id

  it('sync rows: bracket + per-key markers + row bytes, in order', () => {
    const r = _ssrForKeyed(
      [{ id: 'a' }, { id: 'b' }],
      by,
      (x) => `<li>${(x as { id: string }).id}</li>`,
    )
    expect(typeof (r as RawLike).value).toBe('string')
    expect((r as RawLike).value).toBe(
      '<!--pyreon-for--><!--k:a--><li>a</li><!--k:b--><li>b</li><!--/pyreon-for-->',
    )
  })

  it('accessor `each` (the compiled <For each={rows}> shape) resolves; a Set iterable spreads', () => {
    const viaAccessor = _ssrForKeyed(
      () => [{ id: 'x' }],
      by,
      () => '<i>r</i>',
    ) as RawLike
    expect(viaAccessor.value).toContain('<!--k:x-->')

    const viaIterable = _ssrForKeyed(
      new Set([{ id: 's1' }, { id: 's2' }]),
      by,
      (x) => `[${(x as { id: string }).id}]`,
    ) as RawLike
    expect(viaIterable.value).toContain('<!--k:s1-->[s1]<!--k:s2-->[s2]')
  })

  it('RawHtml rows unwrap verbatim (no double-escaping)', () => {
    const r = _ssrForKeyed(
      [{ id: 'r' }],
      by,
      () => raw('<b>pre&rendered</b>'),
    ) as RawLike
    expect(r.value).toContain('<!--k:r--><b>pre&rendered</b>')
  })

  it('ASYNC row promotes with the resume-at-next-index continuation — order + markers survive', async () => {
    const r = _ssrForKeyed(
      [{ id: '1' }, { id: '2' }, { id: '3' }],
      by,
      (x) => {
        const id = (x as { id: string }).id
        // Middle row is async — rows before it are already concatenated,
        // rows after resume through the continuation.
        return id === '2' ? Promise.resolve(`<p>async-${id}</p>`) : `<p>${id}</p>`
      },
    )
    expect(r).toBeInstanceOf(Promise)
    const out = (await r) as RawLike
    expect(out.value).toBe(
      '<!--pyreon-for--><!--k:1--><p>1</p><!--k:2--><p>async-2</p><!--k:3--><p>3</p><!--/pyreon-for-->',
    )
  })

  it('async row resolving a NUMBER goes through holeToString (String fallback)', async () => {
    const out = (await _ssrForKeyed([{ id: 'n' }], by, () => Promise.resolve(42))) as RawLike
    expect(out.value).toContain('<!--k:n-->42')
  })
})

describe('RawHtml through the streaming renderer', () => {
  it('a RawHtml node enqueues verbatim in renderToStream', async () => {
    const App = () => raw('<section>fast-path bytes</section>') as never
    const html = await drain(renderToStream(h(App, null)))
    expect(html).toContain('<section>fast-path bytes</section>')
  })
})

describe('stream consumer hang-up', () => {
  it('cancelling the reader mid-stream closes silently (no unhandled error)', async () => {
    const Slow = async () => {
      await new Promise((r) => setTimeout(r, 30))
      return h('div', null, 'late')
    }
    const stream = renderToStream(h('div', null, h(Slow as never, null))) as ReadableStream<unknown>
    const reader = stream.getReader()
    await reader.read() // first chunk (shell)
    await reader.cancel() // consumer hangs up — abort path
    // Give the abandoned async subtree time to resolve into the aborted
    // stream; the abort arm must swallow it (no throw, no controller error).
    await new Promise((r) => setTimeout(r, 60))
    expect(true).toBe(true) // reaching here without an unhandled rejection IS the assertion
  })
})

describe('collectOptionText — nested array option children (PZ-09)', () => {
  it('<select value> matches an option whose text arrives via nested array children', async () => {
    const html = await renderToString(
      h(
        'select',
        { value: 'beta' },
        h('option', null, ['be', 'ta'] as never),
        h('option', null, 'gamma'),
      ),
    ) as string
    expect(html).toContain('selected')
    expect(html.indexOf('selected')).toBeLessThan(html.indexOf('gamma'))
  })
})

describe('_ssr positional-hole fast path — every arity, both arms (#2382)', () => {
  const S = (n: number) => Array.from({ length: n + 1 }, (_, i) => `s${i}|`)

  it('all-string holes concatenate synchronously for arities 1–6', () => {
    expect((_ssr(S(1), 'A') as RawLike).value).toBe('s0|As1|')
    expect((_ssr(S(2), 'A', 'B') as RawLike).value).toBe('s0|As1|Bs2|')
    expect((_ssr(S(3), 'A', 'B', 'C') as RawLike).value).toBe('s0|As1|Bs2|Cs3|')
    expect((_ssr(S(4), 'A', 'B', 'C', 'D') as RawLike).value).toBe('s0|As1|Bs2|Cs3|Ds4|')
    expect((_ssr(S(5), 'A', 'B', 'C', 'D', 'E') as RawLike).value).toBe('s0|As1|Bs2|Cs3|Ds4|Es5|')
    expect((_ssr(S(6), 'A', 'B', 'C', 'D', 'E', 'F') as RawLike).value).toBe(
      's0|As1|Bs2|Cs3|Ds4|Es5|Fs6|',
    )
  })

  it('a RawHtml hole at each arity falls through to the general path (same bytes, unwrapped)', () => {
    // The hole contract is string | RawHtml | Promise — a RawHtml hole is
    // the valid non-string shape that skips the all-string fast arm.
    const R = raw('<hr>')
    expect((_ssr(S(1), R) as RawLike).value).toBe('s0|<hr>s1|')
    expect((_ssr(S(2), 'A', R) as RawLike).value).toBe('s0|As1|<hr>s2|')
    expect((_ssr(S(3), 'A', 'B', R) as RawLike).value).toBe('s0|As1|Bs2|<hr>s3|')
    expect((_ssr(S(4), 'A', 'B', 'C', R) as RawLike).value).toBe('s0|As1|Bs2|Cs3|<hr>s4|')
    expect((_ssr(S(5), 'A', 'B', 'C', 'D', R) as RawLike).value).toBe('s0|As1|Bs2|Cs3|Ds4|<hr>s5|')
    expect((_ssr(S(6), 'A', 'B', 'C', 'D', 'E', R) as RawLike).value).toBe(
      's0|As1|Bs2|Cs3|Ds4|Es5|<hr>s6|',
    )
  })
})

describe('_ssr positional path — missing trailing statics fall back to empty', () => {
  it('short statics arrays take the ?? fallback at every arity', () => {
    // The compiler always emits statics.length === holes+1; the runtime
    // tolerates short arrays via `?? ''` — locked here so the fallback
    // stays a real (tested) behavior rather than an uncoverable branch.
    expect((_ssr(['a|'], 'A') as RawLike).value).toBe('a|A')
    expect((_ssr(['a|'], 'A', 'B') as RawLike).value).toBe('a|AB')
    expect((_ssr(['a|'], 'A', 'B', 'C') as RawLike).value).toBe('a|ABC')
    expect((_ssr(['a|'], 'A', 'B', 'C', 'D') as RawLike).value).toBe('a|ABCD')
    expect((_ssr(['a|'], 'A', 'B', 'C', 'D', 'E') as RawLike).value).toBe('a|ABCDE')
    expect((_ssr(['a|'], 'A', 'B', 'C', 'D', 'E', 'F') as RawLike).value).toBe('a|ABCDEF')
  })
})
