// `createRouter({ mode: 'memory', initialEntries, initialIndex })` (#4372).
//
// The native routers are in-memory stacks already (a NavigationStack / a Compose
// back stack), so `mode: 'memory'` asks for what iOS and Android always do and
// lowers with no warning, like `'hash'` / `'history'`. The start position
// (`initialEntries` / `initialIndex`) has no native counterpart — the native
// router always opens on its root route — so it is NAMED and ignored, never
// dropped silently.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'

const src = (config: string): string => `
import { createRouter, RouterProvider, RouterView } from '@pyreon/router'
const Home = () => <text>Home</text>
const User = () => <text>User</text>
export function App() {
  const router = createRouter({ routes: [{ path: '/', component: Home }, { path: '/user', component: User }]${config} })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}
`

const memoryWarnings = (code: string, target: 'swift' | 'kotlin'): string[] =>
  transform(code, { target }).warnings.filter((w) => w.includes('initialEntries') || w.includes('memory'))

describe.each(['swift', 'kotlin'] as const)('createRouter memory mode — %s', (target) => {
  it("mode: 'memory' alone lowers without a warning", () => {
    expect(memoryWarnings(src(", mode: 'memory'"), target)).toEqual([])
  })

  it('initialEntries / initialIndex are named and ignored', () => {
    const warnings = memoryWarnings(src(", mode: 'memory', initialEntries: ['/', '/user'], initialIndex: 0"), target)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('[pyreon-native]')
    expect(warnings[0]).toContain('initialEntries')
    expect(warnings[0]).toContain('initialIndex')
    expect(warnings[0]).toContain('IGNORED')
  })

  it('the routes still lower when the start position is ignored', () => {
    const out = transform(src(", mode: 'memory', initialEntries: ['/user']"), { target })
    expect(out.code).toContain('"/user"')
  })
})
