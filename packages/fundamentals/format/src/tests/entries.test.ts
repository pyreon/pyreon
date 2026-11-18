import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as core from '../core'
import * as index from '../index'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const PKG = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as {
  sideEffects: boolean
  exports: Record<string, { bun: string }>
  peerDependencies: Record<string, string>
}

async function bundle(entry: string, mode: 'dev' | 'prod', external: string[] = ['@pyreon/*']) {
  const esbuild = await import('esbuild')
  return esbuild.build({
    entryPoints: [join(SRC, entry)],
    bundle: true,
    format: 'esm',
    write: false,
    minify: true,
    treeShaking: true,
    metafile: true,
    external,
    define: { 'process.env.NODE_ENV': mode === 'dev' ? '"development"' : '"production"' },
  })
}

describe('entries', () => {
  it('declares the three entries and no side effects', () => {
    expect(Object.keys(PKG.exports)).toEqual(['.', './core', './components'])
    expect(PKG.sideEffects).toBe(false)
  })

  it('/core imports nothing from @pyreon/* or node:*', async () => {
    const r = await bundle('core.ts', 'dev', [])
    const inputs = Object.keys(r.metafile.inputs)
    expect(inputs.every((i) => i.startsWith('src/') || i.includes('/format/src/'))).toBe(true)
    for (const file of Object.values(r.metafile.inputs)) {
      for (const imp of file.imports) expect(imp.path).not.toMatch(/^(node:|@pyreon\/)/)
    }
  })

  it('no source file imports node:*', () => {
    for (const file of readdirSync(SRC).filter((f) => /\.tsx?$/.test(f))) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).not.toMatch(/from ['"]node:/)
    }
  })

  it('/ and /components import only @pyreon/core and @pyreon/reactivity', async () => {
    for (const entry of ['index.ts', 'components.ts']) {
      const r = await bundle(entry, 'dev')
      const external = new Set<string>()
      for (const file of Object.values(r.metafile.inputs)) {
        for (const imp of file.imports) if (imp.external) external.add(imp.path)
      }
      expect([...external].every((p) => p === '@pyreon/core' || p === '@pyreon/reactivity'), `${entry}: ${[...external]}`).toBe(true)
    }
  })

  it('the reactive entry exports every core name plus the locale API', () => {
    for (const name of Object.keys(core)) expect(index, name).toHaveProperty(name)
    for (const name of ['locale', 'setLocale', 'provideLocale', 'timeZone', 'setTimeZone', 'provideTimeZone']) {
      expect(index).toHaveProperty(name)
      expect(core).not.toHaveProperty(name)
    }
  })

  it('the core entry is exactly the documented surface', () => {
    expect(Object.keys(core).sort()).toEqual(
      [
        'createFormatter', 'defineFormats', 'formatBytes', 'formatCompact', 'formatCurrency', 'formatDate', 'formatDateRange',
        'formatDateTime', 'formatDateToParts', 'formatDuration', 'formatList', 'formatNumber', 'formatNumberRange',
        'formatNumberToParts', 'formatPercent', 'formatRelative', 'formatRelativeTo', 'formatTime', 'formatUnit',
        'parseDate', 'parseNumber', 'parseCurrency', 'numberFormatter', 'currencyFormatter', 'percentFormatter', 'compactFormatter',
        'unitFormatter', 'bytesFormatter', 'durationFormatter', 'listFormatter', 'dateFormatter', 'timeFormatter',
        'dateTimeFormatter', 'relativeFormatter',
      ].sort(),
    )
  })

  it('declares @pyreon/core and @pyreon/reactivity as peers (optional for /core users)', () => {
    expect(Object.keys(PKG.peerDependencies).sort()).toEqual(['@pyreon/core', '@pyreon/reactivity'])
  })
})

describe('the dev-only gate', () => {
  it('prod bundles drop the dev warnings, dev bundles keep them', async () => {
    const prod = (await bundle('core.ts', 'prod', [])).outputFiles[0]!.text
    const dev = (await bundle('core.ts', 'dev', [])).outputFiles[0]!.text
    expect(prod).not.toContain('returning the fallback')
    expect(prod).not.toContain('is not a valid BCP 47 tag')
    expect(dev).toContain('returning the fallback')
    expect(dev).toContain('is not a valid BCP 47 tag')
    expect(dev.length).toBeGreaterThan(prod.length)
    // Programmer errors are not dev-only.
    expect(prod).toContain('[Pyreon]')
  })

  it('nothing runs on import: no Intl object is constructed, no timer is set', async () => {
    vi.resetModules()
    const names = ['NumberFormat', 'DateTimeFormat', 'ListFormat', 'RelativeTimeFormat', 'PluralRules'] as const
    const originals = names.map((n) => Reflect.get(Intl, n))
    let constructed = 0
    names.forEach((n, i) => {
      Reflect.set(Intl, n, new Proxy(originals[i] as new () => object, { construct(t, a) { constructed++; return Reflect.construct(t, a) as object } }))
    })
    const timers = [vi.spyOn(globalThis, 'setTimeout'), vi.spyOn(globalThis, 'setInterval')]
    try {
      await import('../index')
      await import('../core')
      await import('../components')
      expect(constructed).toBe(0)
      for (const t of timers) expect(t).not.toHaveBeenCalled()
    } finally {
      names.forEach((n, i) => Reflect.set(Intl, n, originals[i]))
    }
  })
})
