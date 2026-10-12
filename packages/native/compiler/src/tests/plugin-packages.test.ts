import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform as bareTransform } from '../index'
import { CORE_LOWERED_SURFACE, PLUGIN_OWNED_MODULES } from '../plugin-packages'
import { transform } from './first-party-plugins'

/**
 * Since the package-owned lowering migration the compiler knows no library: a
 * compile without a package's plugin emits that package's imports verbatim, and
 * the native build fails far from the cause. These specs lock the warning that
 * names the package and the fix, and keep the module list in step with the
 * manifests that declare a plugin.
 */

const PACKAGES = join(process.cwd(), '../..')

function manifestModules(): Set<string> {
  const out = new Set<string>()
  for (const category of readdirSync(PACKAGES)) {
    let dirs: string[]
    try {
      dirs = readdirSync(join(PACKAGES, category))
    } catch {
      continue
    }
    for (const dir of dirs) {
      let pkg: { name?: string; pyreon?: { native?: { plugin?: string; modules?: string[] } } }
      try {
        pkg = JSON.parse(readFileSync(join(PACKAGES, category, dir, 'package.json'), 'utf8'))
      } catch {
        continue
      }
      const native = pkg.pyreon?.native
      if (native?.plugin === undefined) continue
      for (const module of native.modules ?? [pkg.name ?? '']) out.add(module)
    }
  }
  return out
}

const CHART = `import { PieChart } from '@pyreon/charts'
import type { ChartProps } from '@pyreon/charts'
export function A() { return <PieChart data={[{ name: 'a', value: 1 }]} /> }`

const warningsOf = (result: { warnings?: readonly unknown[] }): string[] =>
  (result.warnings ?? []).map((w) => String((w as { message?: string }).message ?? w))

describe('imports from a package whose native plugin is not loaded', () => {
  it('PLUGIN_OWNED_MODULES lists exactly the modules whose manifests declare a native plugin', () => {
    expect([...PLUGIN_OWNED_MODULES].sort()).toEqual([...manifestModules()].sort())
    for (const module of CORE_LOWERED_SURFACE) expect(PLUGIN_OWNED_MODULES.has(module)).toBe(true)
  })

  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: names the package and the fix when its plugin is absent`, () => {
      const warnings = warningsOf(bareTransform(CHART, { target, filename: 'A.tsx' }))
      const hit = warnings.filter((w) => w.includes('(from @pyreon/charts)'))
      expect(hit).toHaveLength(1)
      expect(hit[0]).toContain(
        'PieChart (from @pyreon/charts) has NO native lowering in this compile',
      )
      expect(hit[0]).toContain("Declare @pyreon/charts in the app's package.json dependencies")
      // A type-only import names nothing the emit sees.
      expect(hit[0]).not.toContain('ChartProps')
    })

    it(`${target}: stays silent when the plugin is loaded`, () => {
      const warnings = warningsOf(transform(CHART, { target, filename: 'A.tsx' }))
      expect(warnings.some((w) => w.includes('NO native lowering in this compile'))).toBe(false)
    })
  }

  it('reports a hook from an unloaded plugin package once, through the package warning', () => {
    const source = `import { useToggle } from '@pyreon/hooks'
export function A() { const t = useToggle(); return null }`
    const warnings = warningsOf(bareTransform(source, { target: 'swift', filename: 'A.tsx' }))
    expect(warnings.filter((w) => w.includes('useToggle'))).toHaveLength(1)
    expect(warnings.find((w) => w.includes('useToggle'))).toContain('Declare @pyreon/hooks')
  })

  it('leaves the core-lowered surface and the webview bridge alone', () => {
    const source = `import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { ChartWebView } from '@pyreon/charts/webview'
export function A() { const n = signal(1); return <Stack /> }`
    const warnings = warningsOf(bareTransform(source, { target: 'swift', filename: 'A.tsx' }))
    expect(warnings.some((w) => w.includes('NO native lowering in this compile'))).toBe(false)
  })
})
