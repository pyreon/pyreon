import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectRouteExports, generateRouteModuleFromRoutes, parseFileRoutes } from '../fs-router'

const DIR = join(__dirname, '.tmp-loader-key-lazy')
afterEach(() => rmSync(DIR, { recursive: true, force: true }))

const SRC = `export default function P() { return null }
export async function loader() { return 1 }
export function loaderKey(ctx) { return 'k:' + ctx.params.id }
export const gcTime = 1234
export const meta = { title: 'x' }
`

describe('loaderKey without a static import of the route', () => {
  it('delegates to the loaded module; before the load it never returns a reusable key', async () => {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(join(DIR, 'post.js'), SRC)
    const exp = new Map([['post.js', detectRouteExports(SRC, 'post.js')]])
    const code = generateRouteModuleFromRoutes(parseFileRoutes(['post.js'], 'ssr', exp), DIR)
    expect(code).not.toMatch(/import \* as/)
    expect(code).toContain('gcTime: 1234')
    writeFileSync(join(DIR, '__routes.js'), code)
    const { routes } = await import(/* @vite-ignore */ join(DIR, '__routes.js'))
    const rec = routes.find((r: { path: string }) => r.path === '/post')
    const ctx = { params: { id: '7' }, query: {} }
    const a = rec.loaderKey(ctx)
    const b = rec.loaderKey(ctx)
    expect(a).not.toBe(b) // pending keys never collide → never serve cached data
    await rec.loader({ ...ctx, signal: new AbortController().signal })
    expect(rec.loaderKey(ctx)).toBe('k:7')
    expect(rec.gcTime).toBe(1234)
  })
})
