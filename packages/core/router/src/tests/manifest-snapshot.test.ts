import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import routerManifest from '../manifest'

describe('gen-docs — router snapshot', () => {
  it('renders @pyreon/router to its expected llms.txt bullet', () => {
    expect(renderLlmsTxtLine(routerManifest)).toMatchInlineSnapshot(`"- @pyreon/router — hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive, View Transitions, middleware, typed search params. \`await router.push()\` resolves after \`updateCallbackDone\` (DOM commit), NOT after animation finishes. It does NOT wait for \`.finished\` (~200-300ms). \`.ready\` and \`.finished\` get empty \`.catch()\` handlers so \`AbortError: Transition was skipped\` rejections (from interrupted transitions) do not leak as unhandled promise rejections."`)
  })

  it('renders @pyreon/router to its expected llms-full.txt section — full body snapshot', () => {
    expect(renderLlmsFullSection(routerManifest)).toMatchInlineSnapshot(`
      "## @pyreon/router — Router

      Type-safe client-side router for Pyreon with nested routes, per-route and global navigation guards, data loaders, middleware chain, View Transitions API integration, and typed search params. Context-based (\`RouterContext\`) with hash and history mode support. Route params are inferred from path strings (\`"/user/:id"\` yields \`{ id: string }\`). Named routes enable typed programmatic navigation. SSR-compatible with server-side route resolution. Hash mode uses \`history.pushState\` (not \`window.location.hash\`) to avoid double-update. \`await router.push()\` resolves after the View Transition \`updateCallbackDone\` (DOM commit), not after animation completion.

      \`\`\`typescript
      import { createRouter, RouterProvider, RouterView, RouterLink, useRouter, useRoute, useIsActive, useTypedSearchParams, useTransition, useLoaderData, useMiddlewareData } from "@pyreon/router"
      import { mount } from "@pyreon/runtime-dom"

      // Define routes with typed params, guards, loaders, and middleware
      const router = createRouter({
        routes: [
          { path: "/", component: Home, name: "home" },
          { path: "/user/:id", component: User, name: "user",
            loader: ({ params }) => fetchUser(params.id),
            meta: { title: "User Profile" } },
          { path: "/admin", component: AdminLayout,
            beforeEnter: (to, from) => isAdmin() || "/login",
            children: [
              { path: "users", component: AdminUsers },
              { path: "settings", component: AdminSettings },
            ] },
          { path: "/settings", redirect: "/admin/settings" },
          { path: "(.*)", component: NotFound },
        ],
        middleware: [authMiddleware, loggerMiddleware],
      })

      // Mount with RouterProvider
      mount(
        <RouterProvider router={router}>
          <nav>
            <RouterLink to="/" activeClass="nav-active">Home</RouterLink>
            <RouterLink to={{ name: "user", params: { id: "42" } }}>Profile</RouterLink>
          </nav>
          <RouterView />
        </RouterProvider>,
        document.getElementById("app")!
      )

      // Inside a component — hooks
      const User = () => {
        const route = useRoute<"/user/:id">()
        const data = useLoaderData<UserData>()
        const router = useRouter()
        const isAdmin = useIsActive("/admin")
        const { isTransitioning } = useTransition()
        const params = useTypedSearchParams({ tab: "string", page: "number" })

        return (
          <div>
            <h1>{data.name} (ID: {route().params.id})</h1>
            <Show when={isTransitioning()}>
              <ProgressBar />
            </Show>
            <button onClick={() => router.push("/")}>Go Home</button>
          </div>
        )
      }
      \`\`\`

      > **View Transitions — what push() awaits**: \`await router.push()\` resolves after \`updateCallbackDone\` (DOM commit), NOT after animation finishes. It does NOT wait for \`.finished\` (~200-300ms). \`.ready\` and \`.finished\` get empty \`.catch()\` handlers so \`AbortError: Transition was skipped\` rejections (from interrupted transitions) do not leak as unhandled promise rejections.
      >
      > **Hash mode uses pushState**: Hash mode uses \`history.pushState\` — NOT \`window.location.hash\` assignment — to avoid double-update from the hashchange event. Reading \`location.hash\` directly will not reflect router state; use \`useRoute()\` instead.
      >
      > **Imperative navigation in render body**: \`router.push()\` or \`navigate()\` called synchronously in the component function body causes an infinite render loop. Wrap in \`onMount\`, event handlers, \`effect\`, or any deferred execution context. The \`pyreon/no-imperative-navigate-in-render\` lint rule catches this.
      >
      > **Hook ordering with View Transitions**: \`afterEach\` hooks and scroll restoration fire AFTER the View Transition callback completes — not before. This means hooks see the NEW route state, which is the correct per-spec behavior but a subtle change from pre-VT versions.
      >
      > **For uses by, not key**: \`<For>\` in route lists uses \`by\` not \`key\`. \`<For each={routes()} key={r => r.path}>\` silently passes the key to VNode reconciliation instead of the list reconciler. Use \`by={r => r.path}\`.
      "
    `)
  })

  it('renders @pyreon/router to MCP api-reference entries — one per api[] item', () => {
    const record = renderApiReferenceEntries(routerManifest)
    expect(Object.keys(record).length).toBe(18)
    expect(Object.keys(record)).toContain('router/createRouter')
    // PR-B added redirect/isRedirectError/getRedirectInfo entries.
    expect(Object.keys(record)).toContain('router/redirect')
    expect(Object.keys(record)).toContain('router/isRedirectError')
    expect(Object.keys(record)).toContain('router/getRedirectInfo')
    // Spot-check the flagship API — createRouter is the factory
    const createRouter = record['router/createRouter']!
    expect(createRouter.notes).toContain('routes')
    expect(createRouter.mistakes?.split('\n').length).toBeGreaterThan(2)
  })
})
