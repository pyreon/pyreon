/**
 * `measureBundleCost` against a bundler — the arms that only run when the host
 * HAS one.
 *
 * `Bun.build` is a HOST capability, not a framework module: under Node it is
 * simply absent, which is why the package's own `describe.runIf` blocks skip
 * there and why the whole success path is otherwise unreachable in this
 * runner. The specs below supply a bundler-shaped host so the mapping under
 * test — what Atlas asks for, and how it turns an answer into a cost — is the
 * thing being asserted. The bytes are real: the gzip is `node:zlib` over real
 * text, and the temp directory is really created and really removed.
 *
 * The distinction every one of these protects is UNMEASURED versus ZERO. A
 * component that cannot be bundled leaves the field ABSENT; a `0` would read
 * as "free", which is the most misleading number available.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bundleCostPlugin, canMeasureBundleCost, measureBundleCost } from '../bundle-cost'
import type { ComponentIntelligence } from '../../core'

type BuildOptions = {
  entrypoints: string[]
  outdir: string
  external: string[]
  minify: boolean
  splitting: boolean
  target: string
  define: Record<string, string>
}
type BuildResult = { success: boolean; outputs: { kind: string; text(): Promise<string> }[] }

const host = globalThis as unknown as { Bun?: unknown }

/** Install a bundler-shaped host, returning an exact restore. */
function withBundler(build: (o: BuildOptions) => Promise<BuildResult>): () => void {
  const had = Object.hasOwn(host, 'Bun')
  const previous = host.Bun
  host.Bun = { build }
  return () => {
    if (had) host.Bun = previous
    else delete host.Bun
  }
}

const output = (kind: string, text: string) => ({ kind, text: async () => text })

let dir: string
let restore: (() => void) | undefined
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atlas-covcost-'))
})
afterEach(() => {
  restore?.()
  restore = undefined
  rmSync(dir, { recursive: true, force: true })
})

const source = (name: string, body: string): string => {
  const file = join(dir, name)
  writeFileSync(file, body, 'utf8')
  return file
}

describe('what Atlas asks the bundler for', () => {
  it('measures the PRODUCTION build, externalizing the framework', async () => {
    // Four options, each load-bearing:
    //   `define` — without it the measurement includes every dev-only warning
    //     string, overstating what consumers ship by 5-20%.
    //   `external` — inlining workspace packages charges every component in a
    //     library for the same shared runtime, so the numbers stop being
    //     comparable with each other, which is the only thing they are for.
    //   `splitting` — a component that lazy-loads a heavy dependency must not
    //     be charged for bytes the consumer only pays on demand.
    //   `target: 'bun'` — auto-externalizes node builtins; `browser` silently
    //     failed on every server-touching package in the repo's own gate.
    let seen: BuildOptions | undefined
    restore = withBundler(async (o) => {
      seen = o
      return { success: true, outputs: [output('entry-point', 'export const a=1')] }
    })
    const file = source('a.ts', 'export const a = 1\n')

    expect(await measureBundleCost(file)).toBeDefined()
    expect(seen?.entrypoints).toEqual([file])
    expect(seen?.minify).toBe(true)
    expect(seen?.splitting).toBe(true)
    expect(seen?.target).toBe('bun')
    expect(seen?.define).toEqual({ 'process.env.NODE_ENV': '"production"' })
    expect(seen?.external).toContain('@pyreon/*')
    expect(seen?.external).toContain('node:*')
  })

  it('APPENDS the caller\'s externals rather than replacing the defaults', async () => {
    // A project that externalizes its own design system must not have to
    // restate `@pyreon/*` to keep the framework out of the number.
    let seen: BuildOptions | undefined
    restore = withBundler(async (o) => {
      seen = o
      return { success: true, outputs: [output('entry-point', 'x')] }
    })
    await measureBundleCost(source('b.ts', 'export const b = 1\n'), { external: ['@acme/*'] })
    expect(seen?.external).toEqual(['@pyreon/*', 'node:*', '@acme/*'])
  })

  it('reports raw and gzip bytes of the ENTRY chunk', async () => {
    // Only the entry point. A split chunk is a cost the consumer pays on
    // demand, and charging it here is the same overstatement `splitting`
    // exists to avoid.
    const text = 'a'.repeat(5000)
    restore = withBundler(async () => ({
      success: true,
      outputs: [output('chunk', 'z'.repeat(99999)), output('entry-point', text)],
    }))
    const cost = await measureBundleCost(source('c.ts', 'export const c = 1\n'))
    expect(cost!.raw, 'the entry, not the chunk').toBe(Buffer.byteLength(text, 'utf-8'))
    expect(cost!.gzip, 'highly compressible text must compress').toBeLessThan(cost!.raw)
  })

  it('writes into a FRESHLY CREATED temp directory, and removes it', async () => {
    // `mkdtempSync`, not a path derived from the file name. `/tmp` is
    // world-writable, and a predictable path can be pre-empted with a symlink
    // that redirects the build's writes. Traversal was already handled; this
    // is the other half, and the half that is easy to miss because the path
    // *looks* sanitised.
    let outdir = ''
    restore = withBundler(async (o) => {
      outdir = o.outdir
      expect(existsSync(o.outdir), 'created before the build runs').toBe(true)
      return { success: true, outputs: [output('entry-point', 'x')] }
    })
    await measureBundleCost(source('d.ts', 'export const d = 1\n'))

    expect(outdir).toContain('atlas-cost-')
    expect(existsSync(outdir), 'and removed afterwards').toBe(false)
  })

  it('removes the temp directory even when the build THROWS', async () => {
    // One directory per measured component would otherwise accumulate for the
    // life of the machine — 108 per scan on a real library.
    const before = readdirSync(tmpdir()).filter((n) => n.startsWith('atlas-cost-')).length
    restore = withBundler(async () => {
      throw new Error('bundler exploded')
    })
    expect(await measureBundleCost(source('e.ts', 'export const e = 1\n'))).toBeUndefined()
    const after = readdirSync(tmpdir()).filter((n) => n.startsWith('atlas-cost-')).length
    expect(after).toBe(before)
  })
})

describe('UNMEASURED, never zero', () => {
  it('is undefined when the build reports failure', async () => {
    restore = withBundler(async () => ({ success: false, outputs: [] }))
    expect(await measureBundleCost(source('f.ts', 'export const f = 1\n'))).toBeUndefined()
  })

  it('is undefined when the build succeeded with NO entry point', async () => {
    // A successful build whose outputs are all split chunks. Reporting 0 for
    // it would read as "this component is free".
    restore = withBundler(async () => ({
      success: true,
      outputs: [output('chunk', 'x'), output('sourcemap', 'y')],
    }))
    expect(await measureBundleCost(source('g.ts', 'export const g = 1\n'))).toBeUndefined()
  })
})

describe('the plugin, with a bundler present', () => {
  const ci = (source?: string): ComponentIntelligence =>
    ({
      name: 'X',
      controls: [],
      scenarios: [],
      axes: [],
      tags: [],
      ...(source ? { source } : {}),
    }) as ComponentIntelligence

  it('attaches the cost when the source measures', async () => {
    restore = withBundler(async () => ({
      success: true,
      outputs: [output('entry-point', 'x'.repeat(100))],
    }))
    const file = source('h.ts', 'export const h = 1\n')
    const decorated = await bundleCostPlugin().decorate!(ci(file), {} as never)
    expect(decorated.bundleCost?.raw).toBe(100)
  })

  it('leaves the field ABSENT when the measurement fails', async () => {
    restore = withBundler(async () => ({ success: false, outputs: [] }))
    const decorated = await bundleCostPlugin().decorate!(ci(source('i.ts', 'export const i=1\n')), {} as never)
    expect(Object.hasOwn(decorated, 'bundleCost'), 'absent, not zero').toBe(false)
  })

  it('never calls the bundler for a component with no source on record', async () => {
    let calls = 0
    restore = withBundler(async () => {
      calls += 1
      return { success: true, outputs: [output('entry-point', 'x')] }
    })
    const decorated = await bundleCostPlugin().decorate!(ci(), {} as never)
    expect(calls).toBe(0)
    expect(Object.hasOwn(decorated, 'bundleCost')).toBe(false)
  })

  it('does NOT report the no-bundler reason when there IS one', async () => {
    // The once-per-run notice is for a host that cannot measure. Printing it
    // where measurement works would be a permanent false alarm.
    restore = withBundler(async () => ({
      success: true,
      outputs: [output('entry-point', 'x')],
    }))
    const reasons: string[] = []
    const plugin = bundleCostPlugin({ onUnavailable: (r) => reasons.push(r) })
    await plugin.decorate!(ci(source('j.ts', 'export const j=1\n')), {} as never)
    expect(reasons).toEqual([])
  })

  it('reports the host as MEASURABLE only while the bundler is installed', () => {
    expect(canMeasureBundleCost(), 'node has none').toBe(false)
    restore = withBundler(async () => ({ success: true, outputs: [] }))
    expect(canMeasureBundleCost()).toBe(true)
  })
})
