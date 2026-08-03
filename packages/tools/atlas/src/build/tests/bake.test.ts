/**
 * The baked-RPC payload — what makes a STATIC site fully functional instead of
 * quietly missing its two node-answered panels.
 *
 * The escaping specs are the load-bearing ones. The payload carries COMPONENT
 * SOURCE, so a component that merely contains `</script>` in a string would
 * otherwise close the tag it is embedded in and inject the rest of the file as
 * markup — a broken site produced by a component that is itself perfectly fine.
 */
import { describe, expect, it } from 'vitest'
import { bakedRpcScript, bakeRpc, isBakedRpcError } from '../bake'
import type { RpcMethod } from '../../dev/plugin'

describe('bakeRpc', () => {
  const methods: Record<string, RpcMethod> = {
    source: (params) => ({ path: `/p/${String(params.component)}.tsx`, source: 'x' }),
    lens: (params) => {
      if (params.component === 'Broken') throw new Error('no compiler installed')
      return { path: '/p/a.tsx', lines: [], totals: {}, suspects: 0 }
    },
    components: () => ['Button', 'Broken'],
  }

  it('records one answer per component, per per-component method', async () => {
    const baked = await bakeRpc({ methods, components: ['Button', 'Broken'] })
    expect(Object.keys(baked.source!).sort()).toEqual(['Broken', 'Button'])
    expect((baked.source!.Button as { path: string }).path).toBe('/p/Button.tsx')
  })

  it('calls a no-parameter method ONCE, under the empty-string key', async () => {
    // The client derives its key with `String(params.component ?? '')`, so a
    // method taking no component has to land here or it is never found.
    const baked = await bakeRpc({ methods, components: ['Button'] })
    expect(baked.components!['']).toEqual(['Button', 'Broken'])
  })

  it('bakes a FAILURE with its reason rather than omitting it', async () => {
    // Omitting it would make the client fall through to a fetch that cannot
    // succeed on a static site, and report a network error about a request that
    // was never going to work — instead of "no compiler installed", which is
    // the actionable part.
    const warnings: string[] = []
    const baked = await bakeRpc({
      methods,
      components: ['Broken'],
      onWarn: (m) => warnings.push(m),
    })
    const entry = baked.lens!.Broken
    expect(isBakedRpcError(entry)).toBe(true)
    expect((entry as { __atlasRpcError: string }).__atlasRpcError).toBe('no compiler installed')
    expect(warnings[0]).toContain('lens(Broken)')
  })

  it('a failure does not abort the remaining components', async () => {
    const baked = await bakeRpc({ methods, components: ['Broken', 'Button'] })
    expect(isBakedRpcError(baked.lens!.Broken)).toBe(true)
    expect(isBakedRpcError(baked.lens!.Button)).toBe(false)
  })
})

describe('bakedRpcScript', () => {
  it('escapes a closing script tag hidden in component source', () => {
    const script = bakedRpcScript({ source: { A: { source: '<div>a</script><b>' } } })
    expect(script).not.toContain('</script><b>')
    expect(script).toContain('<\\/script>')
    // Still exactly one real closing tag — the wrapper's own.
    expect(script.match(/<\/script>/g)).toHaveLength(1)
  })

  it('escapes a comment opener, which also ends the script grammar', () => {
    const script = bakedRpcScript({ source: { A: { source: '<!-- x' } } })
    expect(script).toContain('<\\!--')
  })

  it('escapes U+2028 / U+2029 — legal in JSON, historically illegal in JS', () => {
    const raw = `a${String.fromCharCode(0x2028)}b${String.fromCharCode(0x2029)}c`
    const script = bakedRpcScript({ source: { A: { source: raw } } })
    expect(script).toContain('\\u2028')
    expect(script).toContain('\\u2029')
    expect(script).not.toContain(String.fromCharCode(0x2028))
  })

  it('round-trips through a real parse, escapes and all', () => {
    const payload = { source: { A: { source: '</script><!-- end' } } }
    const script = bakedRpcScript(payload)
    const json = script.slice(script.indexOf('=') + 1, script.lastIndexOf('</script>'))
    // eslint-disable-next-line no-new-func -- parsing the emitted literal is the assertion
    expect(new Function(`return ${json}`)()).toEqual(payload)
  })
})
