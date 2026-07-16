/**
 * `@pyreon/testing/router` — happy-dom suite.
 *
 * renderWithRouter settles the INITIAL route before mount (lazy components
 * resolved + loaders run — the SSR-handler contract), `navigate()` resolves
 * after the pipeline commits, expectRouter matches concrete paths AND
 * matched-record patterns.
 */
import { h } from '@pyreon/core'
import type { RouteRecord } from '@pyreon/router'
import { createRouter, lazy, useLoaderData, useParams } from '@pyreon/router'
import { describe, expect, it } from 'vitest'
import { expectRouter, renderWithRouter } from '../router'

const Home = () => <div>Home Page</div>
const About = () => <div>About Page</div>

function Post() {
  const params = useParams()
  const data = useLoaderData<{ title: string }>()
  return (
    <div>
      Post {params.id}: {data.title}
    </div>
  )
}

const routes: RouteRecord[] = [
  { path: '/', component: Home },
  { path: '/about', component: About },
  {
    path: '/posts/:id',
    component: Post,
    loader: ({ params }) => Promise.resolve({ title: `Title ${params.id}` }),
  },
]

describe('renderWithRouter', () => {
  it('mounts a bare <RouterView/> (ui = null) settled at the initial route', async () => {
    const { container, unmount } = await renderWithRouter(null, { routes, route: '/about' })
    expect(container.textContent).toContain('About Page')
    unmount()
  })

  it('runs the initial route loaders BEFORE mount — useLoaderData populated on first render', async () => {
    const { container, unmount } = await renderWithRouter(null, { routes, route: '/posts/7' })
    expect(container.textContent).toContain('Post 7: Title 7')
    unmount()
  })

  it('resolves lazy route components before the synchronous mount', async () => {
    const lazyRoutes: RouteRecord[] = [
      { path: '/lazy', component: lazy(() => Promise.resolve({ default: About })) },
    ]
    const { container, unmount } = await renderWithRouter(null, { routes: lazyRoutes, route: '/lazy' })
    // No loading fallback — the component was preloaded into the cache.
    expect(container.textContent).toContain('About Page')
    unmount()
  })

  it('navigate() settles guards + loaders + DOM before resolving', async () => {
    const { container, navigate, unmount } = await renderWithRouter(null, { routes, route: '/' })
    expect(container.textContent).toContain('Home Page')
    const result = await navigate('/posts/3')
    expect(result).toBe('committed')
    expect(container.textContent).toContain('Post 3: Title 3')
    unmount()
  })

  it('mounts custom ui inside the provider (app-shell shape)', async () => {
    const { RouterView } = await import('@pyreon/router')
    const Shell = () => (
      <main>
        <nav>Shell Nav</nav>
        {h(RouterView, {})}
      </main>
    )
    const { container, unmount } = await renderWithRouter(<Shell />, { routes, route: '/about' })
    expect(container.textContent).toContain('Shell Nav')
    expect(container.textContent).toContain('About Page')
    unmount()
  })

  it('accepts a pre-built router', async () => {
    const router = createRouter({ routes, url: '/about' })
    const { container, router: returned, unmount } = await renderWithRouter(null, { router, route: '/about' })
    expect(returned).toBe(router)
    expect(container.textContent).toContain('About Page')
    unmount()
  })

  it('composes an outer wrapper around the provider tree', async () => {
    const { container, unmount } = await renderWithRouter(null, {
      routes,
      route: '/',
      wrapper: (children) => <section data-outer="1">{children}</section>,
    })
    expect(container.querySelector('[data-outer="1"]')!.textContent).toContain('Home Page')
    unmount()
  })

  it('throws an actionable error when neither routes nor router is given', async () => {
    await expect(renderWithRouter(null, {} as never)).rejects.toThrow(
      /pass `routes` \(or a pre-built `router`\)/,
    )
  })
})

describe('expectRouter', () => {
  it('toBeAt matches the concrete path AND the matched pattern', async () => {
    const { router, unmount } = await renderWithRouter(null, { routes, route: '/posts/7' })
    expectRouter(router).toBeAt('/posts/7')
    expectRouter(router).toBeAt('/posts/:id')
    expectRouter(router).notToBeAt('/about')
    unmount()
  })

  it('failure messages name the current path + matched patterns', async () => {
    const { router, unmount } = await renderWithRouter(null, { routes, route: '/posts/7' })
    expect(() => expectRouter(router).toBeAt('/about')).toThrow(
      /expected router to be at "\/about", but it is at path "\/posts\/7" \(matched: \/posts\/:id\)/,
    )
    expect(() => expectRouter(router).notToBeAt('/posts/:id')).toThrow(
      /expected router NOT to be at "\/posts\/:id"/,
    )
    unmount()
  })

  it('tracks navigation', async () => {
    const { router, navigate, unmount } = await renderWithRouter(null, { routes, route: '/' })
    expectRouter(router).toBeAt('/')
    await navigate('/about')
    expectRouter(router).toBeAt('/about')
    unmount()
  })
})
