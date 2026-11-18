// A router with one nested route switches to the NESTED dispatch, which lowered less than the flat one: every
// redirect was dropped (the path fell through to the 404 page), a route `loader` was dropped (its page never got its
// data), and the wildcard became a `matchPath(path, "*")` branch. A parameterless global hook
// (`afterEach: [countVisit]`) and `useRouter()` did not compile on either target. Each is held here on both
// targets, and compiled where the toolchains exist; the router demo's RouterFeatures device tests hold them on devices.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `import { createRouter, useRouter, RouterProvider, RouterView } from '@pyreon/router'
import { signal } from '@pyreon/reactivity'
import { Button, Stack, Text } from '@pyreon/primitives'
type Loaded = { title: string }
const visits = signal(0)
function countVisit() { visits.set(visits() + 1) }
function allowAll(to: { path: string }) { return to.path !== '/blocked' }
function trace() { console.log('nav') }
function Home() {
  const router = useRouter()
  return (
    <Stack>
      <Text>Visits: {visits()}</Text>
      <Button onPress={() => router.replace('/mail/inbox')}>Replace</Button>
      <Button onPress={() => router.back()}>Back</Button>
      <Button onPress={() => router.forward()}>Forward</Button>
      <Button onPress={() => router.push('/mail')}>Push</Button>
    </Stack>
  )
}
function Shell() { return <Stack><Text>Shell</Text><RouterView /></Stack> }
function Inbox() { return <Text>Inbox</Text> }
function LoadedPage() { return <Text>Loaded</Text> }
function NotFound() { return <Text>Not found</Text> }
export function App() {
  const router = createRouter({
    routes: [
      { path: '/', component: Home },
      { path: '/old', redirect: '/mail/inbox' },
      { path: '/loaded', component: LoadedPage, loader: (): Loaded => ({ title: 'x' }) },
      { path: '/mail', component: Shell, children: [{ path: 'inbox', component: Inbox }] },
      { path: '*', component: NotFound },
    ],
    beforeEach: [allowAll],
    afterEach: [countVisit, trace],
  })
  return <RouterProvider router={router}><RouterView /></RouterProvider>
}`

describe('nested router dispatch lowers what the flat one does', () => {
  const swift = transform(SRC, { target: 'swift' })
  const kotlin = transform(SRC, { target: 'kotlin' })

  it('lowers with no warning', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })

  it('aliases the redirect to its nested target, inside the layout', () => {
    expect(swift.code).toMatch(/matchPath\(path, "\/old"\) != nil \{\s*Shell \{ Inbox\(\) \}/)
    expect(kotlin.code).toContain('PyreonRouter.matchPath(currentPath, "/old") != null -> Shell { Inbox() }')
  })

  it('wraps the loader route in its loader host', () => {
    expect(swift.code).toMatch(/PyreonRouteLoader\(path: path, load: \{[^\n]*\}\) \{ LoadedPage\(\) \}/)
    expect(kotlin.code).toMatch(/PyreonRouteLoader\(path = currentPath, load = \{[^\n]*\}\) \{ LoadedPage\(\) \}/)
  })

  it('renders the wildcard as the else branch only', () => {
    expect(swift.code).not.toContain('"*"')
    expect(kotlin.code).not.toContain('"*"')
    expect(kotlin.code).toContain('else -> NotFound()')
  })

  it('adapts a parameterless hook to the path the routers pass, and keeps a one-parameter guard bare', () => {
    expect(swift.code).toContain('r.beforeEachGuards.append(allowAll)')
    expect(swift.code).toContain('r.afterEachHooks.append({ _ in countVisit() })')
    expect(swift.code).toContain('r.afterEachHooks.append({ _ in trace() })')
    expect(kotlin.code).toContain('beforeEachGuards.add(::allowAll)')
    expect(kotlin.code).toContain('afterEachHooks.add({ _ -> countVisit() })')
    expect(kotlin.code).toContain('afterEachHooks.add({ _ -> trace() })')
  })

  it('lowers useRouter() to the router handle', () => {
    expect(swift.code).toContain('private var router: PyreonRouterHandle { useRouter(router: pyreonRouter) }')
    expect(swift.code).toContain('router.replace("/mail/inbox")')
    expect(kotlin.code).toContain('val router = useRouter()')
    expect(kotlin.code).toContain('router.replace("/mail/inbox")')
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
    const v = validateSwiftWithStubs(swift.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
    const v = validateKotlin(kotlin.code)
    expect(v.ok, v.error).toBe(true)
  })

  it('names a parameterless guard that returns a value (read as a component) instead of emitting it', () => {
    const src = SRC.replace("function trace() { console.log('nav') }", 'function allowNone() { return false }').replace(
      'beforeEach: [allowAll]',
      'beforeEach: [allowAll, allowNone]',
    ).replace('afterEach: [countVisit, trace]', 'afterEach: [countVisit]')
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n'), target).toMatch(/guard `allowNone` takes no parameter and returns a value/)
      expect(r.code, target).not.toMatch(/beforeEachGuards\.(append|add)\([^)]*allowNone/)
    }
  })
})
