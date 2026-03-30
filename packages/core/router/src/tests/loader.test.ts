import { hydrateLoaderData, prefetchLoaderData, serializeLoaderData } from "../loader"
import { createRouter, setActiveRouter, useIsActive, useSearchParams } from "../router"
import type { RouteRecord, RouterInstance } from "../types"

const Home = () => null
const About = () => null
const User = () => null

// ─── serializeLoaderData / hydrateLoaderData round-trip edge cases ────────────

describe("loader data serialization — edge cases", () => {
  test("serializes multiple route loaders", async () => {
    const routes: RouteRecord[] = [
      {
        path: "/admin",
        component: Home,
        loader: async () => "admin-data",
        children: [
          {
            path: "users",
            component: About,
            loader: async () => "users-data",
          },
        ],
      },
    ]
    const router = createRouter({ routes, url: "/admin/users" }) as RouterInstance
    await prefetchLoaderData(router, "/admin/users")

    const serialized = serializeLoaderData(router)
    expect(serialized["/admin"]).toBe("admin-data")
    expect(serialized.users).toBe("users-data")
  })

  test("hydrate ignores paths not in current route matched", () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/page", component: About, loader: async () => [] },
    ]
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    // Hydrate with data for a path that is NOT currently matched
    hydrateLoaderData(router, { "/page": "should-be-ignored" })
    expect(router._loaderData.size).toBe(0)
  })

  test("hydrate with non-object values is no-op", () => {
    const routes: RouteRecord[] = [{ path: "/", component: Home }]
    const router = createRouter({ routes, url: "/" }) as RouterInstance

    // These should not throw
    hydrateLoaderData(router, null as unknown as Record<string, unknown>)
    hydrateLoaderData(router, undefined as unknown as Record<string, unknown>)
    hydrateLoaderData(router, 42 as unknown as Record<string, unknown>)
    expect(router._loaderData.size).toBe(0)
  })

  test("round-trip with complex data types", async () => {
    const complexData = {
      items: [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
      ],
      meta: { total: 2, page: 1 },
      nested: { deep: { value: true } },
    }
    const routes: RouteRecord[] = [
      { path: "/data", component: Home, loader: async () => complexData },
    ]
    const ssrRouter = createRouter({ routes, url: "/data" }) as RouterInstance
    await prefetchLoaderData(ssrRouter, "/data")

    const serialized = serializeLoaderData(ssrRouter)
    const clientRouter = createRouter({ routes, url: "/data" }) as RouterInstance
    hydrateLoaderData(clientRouter, serialized)

    const values = Array.from(clientRouter._loaderData.values())
    expect(values[0]).toEqual(complexData)
  })

  test("prefetchLoaderData passes AbortSignal to loaders", async () => {
    let receivedSignal: AbortSignal | undefined
    const routes: RouteRecord[] = [
      {
        path: "/data",
        component: Home,
        loader: async ({ signal }) => {
          receivedSignal = signal
          return "ok"
        },
      },
    ]
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    await prefetchLoaderData(router, "/data")
    expect(receivedSignal).toBeDefined()
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
  })

  test("prefetchLoaderData skips routes without loaders", async () => {
    const routes: RouteRecord[] = [
      {
        path: "/admin",
        component: Home,
        children: [
          { path: "users", component: About }, // no loader
        ],
      },
    ]
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    await prefetchLoaderData(router, "/admin/users")
    expect(router._loaderData.size).toBe(0)
  })
})

// ─── useIsActive — edge cases ────────────────────────────────────────────────

describe("useIsActive — edge cases", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("throws when no router installed", () => {
    expect(() => useIsActive("/")).toThrow("[pyreon-router] No router installed")
  })

  test("exact match for root path", () => {
    const router = createRouter({ routes: [{ path: "/", component: Home }], url: "/" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/", true)
    expect(isActive()).toBe(true)
  })

  test("partial match: /admin matches /admin/users", () => {
    const routes: RouteRecord[] = [
      {
        path: "/admin",
        component: Home,
        children: [{ path: "users", component: About }],
      },
    ]
    const router = createRouter({ routes, url: "/admin/users" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/admin")
    expect(isActive()).toBe(true)
  })

  test("partial match: /admin does NOT match /admin-panel", async () => {
    const routes: RouteRecord[] = [
      { path: "/admin", component: Home },
      { path: "/admin-panel", component: About },
    ]
    const router = createRouter({ routes, url: "/admin-panel" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/admin")
    expect(isActive()).toBe(false)
  })

  test("exact match: /admin does NOT match /admin/users", () => {
    const routes: RouteRecord[] = [
      {
        path: "/admin",
        component: Home,
        children: [{ path: "users", component: About }],
      },
    ]
    const router = createRouter({ routes, url: "/admin/users" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/admin", true)
    expect(isActive()).toBe(false)
  })

  test("root path partial match only matches /", () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]
    const router = createRouter({ routes, url: "/about" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/")
    // Root path in partial mode should only match "/"
    expect(isActive()).toBe(false)
  })

  test("param pattern: /user/:id matches /user/42 in exact mode", () => {
    const routes: RouteRecord[] = [{ path: "/user/:id", component: User }]
    const router = createRouter({ routes, url: "/user/42" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/user/:id", true)
    expect(isActive()).toBe(true)
  })

  test("param pattern: /user/:id matches /user/42 in partial mode", () => {
    const routes: RouteRecord[] = [
      {
        path: "/user/:id",
        component: User,
        children: [{ path: "posts", component: About }],
      },
    ]
    const router = createRouter({ routes, url: "/user/42/posts" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/user/:id")
    expect(isActive()).toBe(true)
  })

  test("exact match with wrong segment count returns false", () => {
    const routes: RouteRecord[] = [{ path: "/a/b/c", component: Home }]
    const router = createRouter({ routes, url: "/a/b/c" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/a/b", true)
    expect(isActive()).toBe(false)
  })

  test("partial match with more pattern segments than current returns false", () => {
    const routes: RouteRecord[] = [{ path: "/a", component: Home }]
    const router = createRouter({ routes, url: "/a" })
    setActiveRouter(router as RouterInstance)
    const isActive = useIsActive("/a/b/c")
    expect(isActive()).toBe(false)
  })
})

// ─── useSearchParams — edge cases ────────────────────────────────────────────

describe("useSearchParams — edge cases", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("throws when no router installed", () => {
    expect(() => useSearchParams()).toThrow("[pyreon-router] No router installed")
  })

  test("returns query params from current route", () => {
    const routes: RouteRecord[] = [{ path: "/search", component: Home }]
    const router = createRouter({ routes, url: "/search?q=hello&page=1" })
    setActiveRouter(router as RouterInstance)
    const [get] = useSearchParams()
    expect(get().q).toBe("hello")
    expect(get().page).toBe("1")
  })

  test("merges defaults with route query", () => {
    const routes: RouteRecord[] = [{ path: "/search", component: Home }]
    const router = createRouter({ routes, url: "/search?q=hello" })
    setActiveRouter(router as RouterInstance)
    const [get] = useSearchParams({ q: "", page: "1", sort: "name" })
    expect(get().q).toBe("hello") // from URL, overrides default
    expect(get().page).toBe("1") // from default
    expect(get().sort).toBe("name") // from default
  })

  test("set navigates with merged query", async () => {
    const routes: RouteRecord[] = [{ path: "/search", component: Home }]
    const router = createRouter({ routes, url: "/search?q=hello" })
    setActiveRouter(router as RouterInstance)
    const [, set] = useSearchParams({ q: "", page: "1" })

    await set({ page: "2" })
    // Router should navigate — check that the route updated
    const route = router.currentRoute()
    expect(route.query.page).toBe("2")
    expect(route.query.q).toBe("hello")
  })
})

// ─── Router — trailing slash normalization ───────────────────────────────────

describe("router — trailing slash normalization", () => {
  const routes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
  ]

  test("strip mode (default) removes trailing slashes", () => {
    const router = createRouter({ routes, url: "/about/" })
    expect(router.currentRoute().path).toBe("/about")
  })

  test("add mode ensures trailing slashes", () => {
    const router = createRouter({ routes, url: "/about", trailingSlash: "add" })
    expect(router.currentRoute().path).toBe("/about/")
  })

  test("ignore mode does not modify path", () => {
    const router = createRouter({ routes, url: "/about/", trailingSlash: "ignore" })
    expect(router.currentRoute().path).toBe("/about/")
  })

  test("root path is not modified by strip mode", () => {
    const router = createRouter({ routes, url: "/", trailingSlash: "strip" })
    expect(router.currentRoute().path).toBe("/")
  })

  test("strip mode handles path with query string", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("/about/?q=1")
    expect(router.currentRoute().path).toBe("/about")
    expect(router.currentRoute().query.q).toBe("1")
  })
})

// ─── Router — onError handler ────────────────────────────────────────────────

describe("router — onError handler", () => {
  test("onError receives error from failed loader", async () => {
    const errors: unknown[] = []
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/fail",
        component: About,
        loader: async () => {
          throw new Error("loader-error")
        },
      },
    ]
    const router = createRouter({
      routes,
      url: "/",
      onError: (err) => {
        errors.push(err)
        return undefined
      },
    })

    await router.push("/fail")
    expect(errors.length).toBe(1)
    expect((errors[0] as Error).message).toBe("loader-error")
    expect(router.currentRoute().path).toBe("/fail")
  })

  test("onError returning false cancels navigation", async () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/fail",
        component: About,
        loader: async () => {
          throw new Error("fail")
        },
      },
    ]
    const router = createRouter({
      routes,
      url: "/",
      onError: () => false,
    })

    await router.push("/fail")
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── Router — destroy ────────────────────────────────────────────────────────

describe("router — destroy", () => {
  test("destroy clears guards, hooks, caches, and blockers", () => {
    const routes: RouteRecord[] = [{ path: "/", component: Home }]
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    router.beforeEach(() => true)
    router.afterEach(() => {})
    router._blockers.add(() => false)
    router._loaderData.set(routes[0] as RouteRecord, "data")

    router.destroy()

    expect(router._blockers.size).toBe(0)
    expect(router._loaderData.size).toBe(0)
    expect(router._abortController).toBeNull()
  })

  test("destroy is idempotent (safe to call twice)", () => {
    const routes: RouteRecord[] = [{ path: "/", component: Home }]
    const router = createRouter({ routes, url: "/" })
    expect(() => {
      router.destroy()
      router.destroy()
    }).not.toThrow()
  })
})

// ─── Router — isReady ────────────────────────────────────────────────────────

describe("router — isReady", () => {
  test("isReady resolves after initial navigation", async () => {
    const routes: RouteRecord[] = [{ path: "/", component: Home }]
    const router = createRouter({ routes, url: "/" })
    await router.isReady()
    // Should not hang
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── Router — relative path navigation ───────────────────────────────────────

describe("router — relative path navigation", () => {
  const routes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/user/:id", component: User },
    {
      path: "/admin",
      component: Home,
      children: [
        { path: "users", component: About },
        { path: "settings", component: User },
      ],
    },
  ]

  test("relative path ./sibling navigates correctly", async () => {
    const router = createRouter({ routes, url: "/admin/users" })
    await router.push("./settings")
    expect(router.currentRoute().path).toBe("/admin/settings")
  })

  test("relative path ../up navigates correctly", async () => {
    const router = createRouter({ routes, url: "/admin/users" })
    await router.push("../")
    expect(router.currentRoute().path).toBe("/")
  })

  test("absolute path is not modified", async () => {
    const router = createRouter({ routes, url: "/admin/users" })
    await router.push("/user/42")
    expect(router.currentRoute().path).toBe("/user/42")
  })
})

// ─── Router — replace with named route ───────────────────────────────────────

describe("router — replace with named route", () => {
  test("replace with named route navigates correctly", async () => {
    const routes: RouteRecord[] = [
      { path: "/", component: Home, name: "home" },
      { path: "/user/:id", component: User, name: "user" },
    ]
    const router = createRouter({ routes, url: "/" })
    await router.replace({ name: "user", params: { id: "42" } })
    expect(router.currentRoute().path).toBe("/user/42")
  })

  test("replace with unknown named route falls back to /", async () => {
    const routes: RouteRecord[] = [{ path: "/", component: Home }]
    const router = createRouter({ routes, url: "/" })
    await router.replace({ name: "nonexistent" })
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── Router — sanitize unsafe URLs ───────────────────────────────────────────

describe("router — URL sanitization", () => {
  const routes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
  ]

  test("blocks vbscript: URI", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("vbscript:alert(1)")
    expect(router.currentRoute().path).toBe("/")
  })

  test("blocks absolute URLs (http)", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("http://evil.com")
    expect(router.currentRoute().path).toBe("/")
  })

  test("blocks absolute URLs (https)", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("https://evil.com")
    expect(router.currentRoute().path).toBe("/")
  })

  test("blocks protocol-relative URLs", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("//evil.com")
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── Router — staleWhileRevalidate ───────────────────────────────────────────

describe("router — staleWhileRevalidate", () => {
  test("serves stale data immediately, revalidates in background", async () => {
    let loaderCallCount = 0
    const routes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/data",
        component: About,
        staleWhileRevalidate: true,
        loader: async () => {
          loaderCallCount++
          return `data-v${loaderCallCount}`
        },
      },
    ]
    const router = createRouter({ routes, url: "/" }) as RouterInstance

    // First navigation — loader runs as blocking
    await router.push("/data")
    expect(loaderCallCount).toBe(1)
    expect(router._loaderData.get(routes[1] as RouteRecord)).toBe("data-v1")

    // Navigate away and back — should show stale data and revalidate
    await router.push("/")
    await router.push("/data")

    // Give background revalidation time
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(loaderCallCount).toBe(2)
  })
})
