import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generateRouteModuleFromRoutes } from '../fs-router'
import type { FileRoute, RouteFileExports } from '../types'

/**
 * A page's own `export function error()` must become its `errorComponent`
 * whether or not its directory has an `_error.tsx`. Pre-fix every emission
 * branch gated on the DIRECTORY error name, so a lone page error export was
 * silently ignored.
 */
function page(exp: Partial<RouteFileExports>, extra: Partial<FileRoute> = {}): FileRoute {
  return {
    filePath: 'about.ts',
    urlPath: '/about',
    dirPath: '',
    depth: 1,
    isLayout: false,
    isError: false,
    isLoading: false,
    isNotFound: false,
    isCatchAll: false,
    renderMode: 'ssr',
    exports: {
      hasLoader: false,
      hasGuard: false,
      hasMeta: false,
      hasRenderMode: false,
      hasError: true,
      hasMiddleware: false,
      ...exp,
    },
    ...extra,
  }
}

const TMP = join(__dirname, '.tmp-page-error-export')
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('page-level `error` export without a directory _error file', () => {
  it.each([
    ['static (SSG bundle)', {}, true],
    ['mixed (inline meta + function exports)', { hasMeta: true, metaLiteral: '{}' }, false],
    ['namespace fallback (non-literal meta)', { hasMeta: true }, false],
  ] as const)('%s emits errorComponent', (_label, exp, staticImports) => {
    const code = generateRouteModuleFromRoutes([page(exp as Partial<RouteFileExports>)], './routes', {
      staticImports,
    })
    expect(code).toMatch(/errorComponent: /)
  })

  it('the real route record carries the page error component', async () => {
    mkdirSync(TMP, { recursive: true })
    writeFileSync(
      join(TMP, 'about.ts'),
      'export default function Page() { return "p" }\nexport function error() { return "boom" }\nerror.marker = "page-error"\n',
    )
    const code = generateRouteModuleFromRoutes([page({})], TMP, { staticImports: true })
    writeFileSync(join(TMP, '__routes.ts'), code)
    const mod = await import(/* @vite-ignore */ join(TMP, '__routes.ts'))
    const rec = (mod.routes as Array<{ path: string; errorComponent?: { marker?: string } }>).find(
      (r) => r.path === '/about',
    )
    expect(rec?.errorComponent?.marker).toBe('page-error')
  })
})
