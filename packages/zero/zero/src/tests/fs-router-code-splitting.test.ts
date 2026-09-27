import { describe, expect, it } from 'vitest'
import { generateRouteModuleFromRoutes, parseFileRoutes, detectRouteExports } from '../fs-router'

// The ssr-showcase `posts/[id].ts` shape: loader + getStaticPaths + a literal
// meta. Pre-fix getStaticPaths forced a static `import * as` next to the lazy
// component, so the route lost code splitting and every build warned
// INEFFECTIVE_DYNAMIC_IMPORT.
const SRC = `export default function P() { return null }
export async function loader() { return 1 }
export function getStaticPaths() { return [{ params: { id: '1' } }] }
export const meta = { title: 'Post' }
`

describe('loader + getStaticPaths routes keep code splitting', () => {
  it('emits no static import of the route module', () => {
    const exp = new Map([['posts/[id].ts', detectRouteExports(SRC, 'posts/[id].ts')]])
    const code = generateRouteModuleFromRoutes(parseFileRoutes(['posts/[id].ts'], 'ssr', exp), '/app/routes')
    expect(code).not.toMatch(/import \* as \w+ from "\/app\/routes\/posts\/\[id\]\.ts"/)
    expect(code).toContain('lazy(() => import("/app/routes/posts/[id].ts")')
    expect(code).toContain('getStaticPaths: (...args) => import("/app/routes/posts/[id].ts")')
  })
})
