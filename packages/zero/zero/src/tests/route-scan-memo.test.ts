import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { invalidateRouteScanCache, scanRouteFiles, scanRouteFilesWithExports } from '../fs-router'

const DIR = join(__dirname, '.tmp-route-scan-memo')
const write = (rel: string, src = 'export default function P() { return null }\n') => {
  mkdirSync(join(DIR, rel, '..'), { recursive: true })
  writeFileSync(join(DIR, rel), src)
}
afterEach(() => {
  invalidateRouteScanCache()
  rmSync(DIR, { recursive: true, force: true })
})

describe('route scan memoization', () => {
  it('one walk serves every caller until invalidated', async () => {
    write('index.tsx')
    expect(await scanRouteFiles(DIR)).toEqual(['index.tsx'])
    write('about.tsx')
    // Same build: the tree is read once.
    expect(await scanRouteFiles(DIR)).toEqual(['index.tsx'])
    expect((await scanRouteFilesWithExports(DIR)).map((r) => r.filePath)).toEqual(['index.tsx'])
    // Dev add/unlink or a new outer build invalidates.
    invalidateRouteScanCache(DIR)
    expect((await scanRouteFiles(DIR)).sort()).toEqual(['about.tsx', 'index.tsx'])
  })

  it('callers get private copies', async () => {
    write('index.tsx')
    const a = await scanRouteFiles(DIR)
    a.push('mutated.tsx')
    expect(await scanRouteFiles(DIR)).toEqual(['index.tsx'])
    const r1 = await scanRouteFilesWithExports(DIR)
    ;(r1[0] as { urlPath: string }).urlPath = '/mutated'
    expect((await scanRouteFilesWithExports(DIR))[0]!.urlPath).toBe('/')
  })

  it('the .server sibling comes from the same walk', async () => {
    write('posts.tsx')
    write('posts.server.ts', 'export async function serverLoader() { return 1 }\n')
    const [route] = await scanRouteFilesWithExports(DIR)
    expect(route?.exports?.serverLoaderFile).toBe('posts.server.ts')
    expect(await scanRouteFiles(DIR)).toEqual(['posts.tsx'])
  })
})
