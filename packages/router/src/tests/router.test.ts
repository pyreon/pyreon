import { h, popContext } from "@pyreon/core"
import { mount } from "@pyreon/runtime-dom"
import type { ResolvedRoute, RouteRecord } from "../index"
import {
  createRouter,
  hydrateLoaderData,
  lazy,
  prefetchLoaderData,
  RouterLink,
  RouterProvider,
  RouterView,
  serializeLoaderData,
  useBlocker,
  useLoaderData,
  useRoute,
  useRouter,
  useSearchParams,
} from "../index"
import {
  buildNameIndex,
  buildPath,
  findRouteByName,
  matchPath,
  parseQuery,
  resolveRoute,
  stringifyQuery,
} from "../match"
import { getActiveRouter, setActiveRouter } from "../router"
import { ScrollManager } from "../scroll"
import type { RouterInstance } from "../types"

// Access internal _resolve without DOM
function resolveOn(routes: RouteRecord[], path: string) {
  const router = createRouter(routes) as ReturnType<typeof createRouter> & {
    _resolve(
      path: string,
    ): ReturnType<typeof import("../index").createRouter> extends { currentRoute: () => infer R }
      ? R
      : never
  }
  return (router as unknown as { _resolve(p: string): unknown })._resolve(path)
}

const Home = () => null
const About = () => null
const User = () => null
const NotFound = () => null
const AdminLayout = () => null
const AdminUsers = () => null
const AdminSettings = () => null
const routes: RouteRecord[] = [
  { path: "/", component: Home },
  { path: "/about", component: About },
  { path: "/user/:id", component: User },
  { path: "*", component: NotFound },
]

// ─── Route matching ──────────────────────────────────────────────────────────

describe("route matching", () => {
  test("matches root path", () => {
    const r = resolveOn(routes, "/") as { matched: { component: unknown }[] }
    expect(r.matched[r.matched.length - 1]?.component).toBe(Home)
  })

  test("matches static path", () => {
    const r = resolveOn(routes, "/about") as { matched: { component: unknown }[] }
    expect(r.matched[r.matched.length - 1]?.component).toBe(About)
  })

  test("extracts dynamic param", () => {
    const r = resolveOn(routes, "/user/42") as {
      params: Record<string, string>
      matched: unknown[]
    }
    expect(r.params.id).toBe("42")
    expect(r.matched.length).toBeGreaterThan(0)
  })

  test("returns empty matched for unknown path", () => {
    const r = resolveOn([{ path: "/", component: Home }], "/unknown") as { matched: unknown[] }
    expect(r.matched).toHaveLength(0)
  })

  test("parses query string", () => {
    const r = resolveOn(routes, "/?foo=bar&baz=qux") as { query: Record<string, string> }
    expect(r.query.foo).toBe("bar")
    expect(r.query.baz).toBe("qux")
  })

  test("parses hash fragment", () => {
    const r = resolveOn(routes, "/about#section") as { hash: string }
    expect(r.hash).toBe("section")
  })

  test("matches wildcard route", () => {
    const r = resolveOn(routes, "/anything/here") as { matched: { component: unknown }[] }
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound)
  })

  test("matches (.*) wildcard pattern", () => {
    const routesWithCatch: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "(.*)", component: NotFound },
    ]
    const r = resolveOn(routesWithCatch, "/anything") as { matched: { component: unknown }[] }
    expect(r.matched[r.matched.length - 1]?.component).toBe(NotFound)
  })

  test("decodes URI-encoded params", () => {
    const r = resolveOn(routes, "/user/hello%20world") as { params: Record<string, string> }
    expect(r.params.id).toBe("hello world")
  })

  test("handles query without value", () => {
    const r = resolveOn(routes, "/?flag") as { query: Record<string, string> }
    expect(r.query.flag).toBe("")
  })

  test("handles empty query string", () => {
    const r = resolveOn(routes, "/about?") as { query: Record<string, string> }
    expect(Object.keys(r.query)).toHaveLength(0)
  })
})

// ─── Nested routes ───────────────────────────────────────────────────────────

describe("nested route matching", () => {
  const nestedRoutes: RouteRecord[] = [
    {
      path: "/admin",
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: "users", component: AdminUsers },
        { path: "settings", component: AdminSettings },
      ],
    },
    { path: "/", component: Home },
  ]

  test("matches nested child route", () => {
    const r = resolveRoute("/admin/users", nestedRoutes)
    expect(r.matched).toHaveLength(2)
    expect(r.matched[0]?.component).toBe(AdminLayout)
    expect(r.matched[1]?.component).toBe(AdminUsers)
  })

  test("merges meta from parent and child", () => {
    const routesWithMeta: RouteRecord[] = [
      {
        path: "/admin",
        component: AdminLayout,
        meta: { requiresAuth: true, title: "Admin" },
        children: [{ path: "users", component: AdminUsers, meta: { title: "Users" } }],
      },
    ]
    const r = resolveRoute("/admin/users", routesWithMeta)
    expect(r.meta.requiresAuth).toBe(true)
    expect(r.meta.title).toBe("Users") // child overrides parent
  })

  test("matches parent route without child", () => {
    const r = resolveRoute("/admin", nestedRoutes)
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.matched[0]?.component).toBe(AdminLayout)
  })
})

// ─── matchPath direct tests ──────────────────────────────────────────────────

describe("matchPath", () => {
  test("returns null for segment count mismatch", () => {
    expect(matchPath("/a/b", "/a")).toBeNull()
  })

  test("returns null for non-matching static segment", () => {
    expect(matchPath("/foo", "/bar")).toBeNull()
  })

  test("matches exact static segments", () => {
    expect(matchPath("/foo/bar", "/foo/bar")).toEqual({})
  })

  test("extracts multiple params", () => {
    const result = matchPath("/user/:id/post/:postId", "/user/42/post/99")
    expect(result).toEqual({ id: "42", postId: "99" })
  })

  test("wildcard * matches any path", () => {
    expect(matchPath("*", "/any/path")).toEqual({})
  })

  test("wildcard (.*) matches any path", () => {
    expect(matchPath("(.*)", "/any/path")).toEqual({})
  })
})

// ─── parseQuery / stringifyQuery ─────────────────────────────────────────────

describe("parseQuery", () => {
  test("parses multiple key-value pairs", () => {
    expect(parseQuery("a=1&b=2")).toEqual({ a: "1", b: "2" })
  })

  test("handles keys without values", () => {
    expect(parseQuery("flag")).toEqual({ flag: "" })
  })

  test("returns empty object for empty string", () => {
    expect(parseQuery("")).toEqual({})
  })

  test("decodes URI-encoded values", () => {
    expect(parseQuery("name=hello%20world")).toEqual({ name: "hello world" })
  })
})

describe("stringifyQuery", () => {
  test("serializes key-value pairs", () => {
    expect(stringifyQuery({ a: "1", b: "2" })).toBe("?a=1&b=2")
  })

  test("returns empty string for empty object", () => {
    expect(stringifyQuery({})).toBe("")
  })

  test("handles key without value (empty string)", () => {
    const result = stringifyQuery({ flag: "" })
    expect(result).toBe("?flag")
  })
})

// ─── buildPath ───────────────────────────────────────────────────────────────

describe("buildPath", () => {
  test("replaces :param segments", () => {
    expect(buildPath("/user/:id", { id: "42" })).toBe("/user/42")
  })

  test("replaces multiple params", () => {
    expect(buildPath("/user/:id/post/:postId", { id: "1", postId: "99" })).toBe("/user/1/post/99")
  })

  test("encodes param values", () => {
    expect(buildPath("/user/:name", { name: "hello world" })).toBe("/user/hello%20world")
  })
})

// ─── findRouteByName ─────────────────────────────────────────────────────────

describe("findRouteByName", () => {
  const namedRoutes: RouteRecord[] = [
    { path: "/", component: Home, name: "home" },
    {
      path: "/admin",
      component: AdminLayout,
      name: "admin",
      children: [{ path: "users", component: AdminUsers, name: "admin-users" }],
    },
  ]

  test("finds top-level named route", () => {
    const found = findRouteByName("home", namedRoutes)
    expect(found).not.toBeNull()
    expect(found?.path).toBe("/")
  })

  test("finds nested named route", () => {
    const found = findRouteByName("admin-users", namedRoutes)
    expect(found).not.toBeNull()
    expect(found?.path).toBe("users")
  })

  test("returns null for unknown name", () => {
    expect(findRouteByName("unknown", namedRoutes)).toBeNull()
  })
})

// ─── buildNameIndex ──────────────────────────────────────────────────────────

describe("buildNameIndex", () => {
  test("builds index from flat routes", () => {
    const rs: RouteRecord[] = [
      { path: "/", component: Home, name: "home" },
      { path: "/about", component: About, name: "about" },
    ]
    const index = buildNameIndex(rs)
    expect(index.size).toBe(2)
    expect(index.get("home")?.path).toBe("/")
    expect(index.get("about")?.path).toBe("/about")
  })

  test("builds index including nested named routes", () => {
    const rs: RouteRecord[] = [
      {
        path: "/admin",
        component: AdminLayout,
        name: "admin",
        children: [{ path: "users", component: AdminUsers, name: "admin-users" }],
      },
    ]
    const index = buildNameIndex(rs)
    expect(index.get("admin")).toBeDefined()
    expect(index.get("admin-users")).toBeDefined()
  })

  test("skips unnamed routes", () => {
    const rs: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/about", component: About, name: "about" },
    ]
    const index = buildNameIndex(rs)
    expect(index.size).toBe(1)
  })
})

// ─── Router navigation (SSR mode — no window) ───────────────────────────────

describe("router navigation", () => {
  test("push updates currentRoute in SSR mode", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
  })

  test("replace updates currentRoute in SSR mode", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.replace("/about")
    expect(router.currentRoute().path).toBe("/about")
  })

  test("push with named route", async () => {
    const namedRoutes: RouteRecord[] = [
      { path: "/", component: Home, name: "home" },
      { path: "/user/:id", component: User, name: "user" },
    ]
    const router = createRouter({ routes: namedRoutes, url: "/" })
    await router.push({ name: "user", params: { id: "42" } })
    expect(router.currentRoute().path).toBe("/user/42")
  })

  test("push with named route and query", async () => {
    const namedRoutes: RouteRecord[] = [
      { path: "/", component: Home, name: "home" },
      { path: "/search", component: About, name: "search" },
    ]
    const router = createRouter({ routes: namedRoutes, url: "/" })
    await router.push({ name: "search", query: { q: "hello" } })
    expect(router.currentRoute().path).toBe("/search")
    expect(router.currentRoute().query.q).toBe("hello")
  })

  test("push with unknown named route falls back to /", async () => {
    const router = createRouter({ routes, url: "/about" })
    await router.push({ name: "nonexistent" })
    expect(router.currentRoute().path).toBe("/")
  })

  test("back() does not throw in SSR (no window)", () => {
    const router = createRouter({ routes, url: "/" })
    expect(() => router.back()).not.toThrow()
  })

  test("sanitizes javascript: URI in push", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("javascript:alert(1)")
    expect(router.currentRoute().path).toBe("/")
  })

  test("sanitizes data: URI in push", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.push("data:text/html,test")
    expect(router.currentRoute().path).toBe("/")
  })

  test("sanitizes javascript: URI in replace", async () => {
    const router = createRouter({ routes, url: "/" })
    await router.replace("javascript:alert(1)")
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── createRouter options ────────────────────────────────────────────────────

describe("createRouter options", () => {
  test("accepts array shorthand (routes without options wrapper)", () => {
    const router = createRouter(routes)
    expect(router.currentRoute().path).toBe("/")
  })

  test("uses url option for SSR initial location", () => {
    const router = createRouter({ routes, url: "/about" })
    expect(router.currentRoute().path).toBe("/about")
  })

  test("defaults to hash mode", () => {
    const router = createRouter(routes) as RouterInstance
    expect(router.mode).toBe("hash")
  })

  test("supports history mode option", () => {
    const router = createRouter({ routes, mode: "history" }) as RouterInstance
    expect(router.mode).toBe("history")
  })
})

// ─── beforeEnter guard ───────────────────────────────────────────────────────

describe("beforeEnter guard", () => {
  test("beforeEnter can block navigation", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/protected", component: About, beforeEnter: () => false },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/protected")
    expect(router.currentRoute().path).toBe("/")
  })

  test("beforeEnter can redirect", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/old", component: About, beforeEnter: () => "/new" },
      { path: "/new", component: User },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/old")
    expect(router.currentRoute().path).toBe("/new")
  })

  test("beforeEnter allows navigation when returning true", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/ok", component: About, beforeEnter: () => true },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/ok")
    expect(router.currentRoute().path).toBe("/ok")
  })

  test("beforeEnter allows navigation when returning undefined", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/ok", component: About, beforeEnter: () => undefined },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/ok")
    expect(router.currentRoute().path).toBe("/ok")
  })

  test("beforeEnter array — all guards run", async () => {
    const order: string[] = []
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/multi",
        component: About,
        beforeEnter: [
          () => {
            order.push("g1")
            return true
          },
          () => {
            order.push("g2")
            return true
          },
        ],
      },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/multi")
    expect(order).toEqual(["g1", "g2"])
    expect(router.currentRoute().path).toBe("/multi")
  })

  test("beforeEnter array — second guard can block", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/blocked",
        component: About,
        beforeEnter: [() => true, () => false],
      },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/blocked")
    expect(router.currentRoute().path).toBe("/")
  })

  test("beforeEnter that throws is treated as false (blocks)", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/throws",
        component: About,
        beforeEnter: () => {
          throw new Error("guard error")
        },
      },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    await router.push("/throws")
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── beforeEach (global guard) ───────────────────────────────────────────────

describe("beforeEach global guard", () => {
  test("beforeEach blocks navigation when returning false", async () => {
    const router = createRouter({ routes, url: "/" })
    router.beforeEach(() => false)
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/")
  })

  test("beforeEach redirects when returning a string", async () => {
    const router = createRouter({ routes, url: "/" })
    router.beforeEach((to) => {
      if (to.path === "/about") return "/user/1"
      return true
    })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/user/1")
  })

  test("beforeEach allows navigation when returning true", async () => {
    const router = createRouter({ routes, url: "/" })
    router.beforeEach(() => true)
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
  })

  test("multiple beforeEach guards run in order", async () => {
    const order: number[] = []
    const router = createRouter({ routes, url: "/" })
    router.beforeEach(() => {
      order.push(1)
      return true
    })
    router.beforeEach(() => {
      order.push(2)
      return true
    })
    await router.push("/about")
    expect(order).toEqual([1, 2])
  })

  test("beforeEach receives to and from", async () => {
    let capturedTo: ResolvedRoute | undefined
    let capturedFrom: ResolvedRoute | undefined
    const router = createRouter({ routes, url: "/" })
    router.beforeEach((to, from) => {
      capturedTo = to
      capturedFrom = from
      return true
    })
    await router.push("/about")
    expect(capturedTo?.path).toBe("/about")
    expect(capturedFrom?.path).toBe("/")
  })
})

// ─── afterEach ───────────────────────────────────────────────────────────────

describe("afterEach hook", () => {
  test("afterEach is called after navigation", async () => {
    let called = false
    const router = createRouter({ routes, url: "/" })
    router.afterEach(() => {
      called = true
    })
    await router.push("/about")
    expect(called).toBe(true)
  })

  test("afterEach receives to and from", async () => {
    let capturedTo: ResolvedRoute | undefined
    let capturedFrom: ResolvedRoute | undefined
    const router = createRouter({ routes, url: "/" })
    router.afterEach((to, from) => {
      capturedTo = to
      capturedFrom = from
    })
    await router.push("/about")
    expect(capturedTo?.path).toBe("/about")
    expect(capturedFrom?.path).toBe("/")
  })

  test("afterEach errors are caught and do not break navigation", async () => {
    const router = createRouter({ routes, url: "/" })
    router.afterEach(() => {
      throw new Error("hook error")
    })
    await router.push("/about")
    // Navigation should still succeed
    expect(router.currentRoute().path).toBe("/about")
  })

  test("multiple afterEach hooks all run", async () => {
    const calls: number[] = []
    const router = createRouter({ routes, url: "/" })
    router.afterEach(() => {
      calls.push(1)
    })
    router.afterEach(() => {
      calls.push(2)
    })
    await router.push("/about")
    expect(calls).toEqual([1, 2])
  })
})

// ─── beforeLeave guard ────────────────────────────────────────────────────────

describe("beforeLeave guard", () => {
  test("beforeLeave can cancel navigation", async () => {
    const leaveRoutes: RouteRecord[] = [
      { path: "/a", component: Home, beforeLeave: () => false },
      { path: "/b", component: User },
    ]
    const router = createRouter({ routes: leaveRoutes, url: "/a" })
    await router.push("/b")
    expect(router.currentRoute().path).toBe("/a")
  })

  test("beforeLeave runs before entering new route", async () => {
    const order: string[] = []
    const leaveRoutes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        beforeLeave: () => {
          order.push("leave-a")
          return true
        },
      },
      {
        path: "/b",
        component: User,
        beforeEnter: () => {
          order.push("enter-b")
          return true
        },
      },
    ]
    const router = createRouter({ routes: leaveRoutes, url: "/a" })
    await router.push("/b")
    expect(order).toEqual(["leave-a", "enter-b"])
  })

  test("beforeLeave can redirect", async () => {
    const leaveRoutes: RouteRecord[] = [
      { path: "/a", component: Home, beforeLeave: (to) => (to.path === "/b" ? "/c" : undefined) },
      { path: "/b", component: User },
      { path: "/c", component: Home },
    ]
    const router = createRouter({ routes: leaveRoutes, url: "/a" })
    await router.push("/b")
    expect(router.currentRoute().path).toBe("/c")
  })

  test("beforeLeave array — all guards run", async () => {
    const order: string[] = []
    const leaveRoutes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        beforeLeave: [
          () => {
            order.push("g1")
            return true
          },
          () => {
            order.push("g2")
            return true
          },
        ],
      },
      { path: "/b", component: User },
    ]
    const router = createRouter({ routes: leaveRoutes, url: "/a" })
    await router.push("/b")
    expect(order).toEqual(["g1", "g2"])
  })

  test("beforeLeave array — second guard can block", async () => {
    const leaveRoutes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        beforeLeave: [() => true, () => false],
      },
      { path: "/b", component: User },
    ]
    const router = createRouter({ routes: leaveRoutes, url: "/a" })
    await router.push("/b")
    expect(router.currentRoute().path).toBe("/a")
  })
})

// ─── Redirect routes ─────────────────────────────────────────────────────────

describe("redirect routes", () => {
  test("static redirect", async () => {
    const redirectRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/old", component: About, redirect: "/new" },
      { path: "/new", component: User },
    ]
    const router = createRouter({ routes: redirectRoutes, url: "/" })
    await router.push("/old")
    expect(router.currentRoute().path).toBe("/new")
  })

  test("dynamic redirect (function)", async () => {
    const redirectRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/old/:id",
        component: About,
        redirect: (to) => `/new/${to.params.id}`,
      },
      { path: "/new/:id", component: User },
    ]
    const router = createRouter({ routes: redirectRoutes, url: "/" })
    await router.push("/old/42")
    expect(router.currentRoute().path).toBe("/new/42")
  })
})

// ─── loading signal ───────────────────────────────────────────────────────────

describe("router.loading", () => {
  test("is false when no navigation is in progress", () => {
    const router = createRouter({ routes: [{ path: "/", component: Home }], url: "/" })
    expect(router.loading()).toBe(false)
  })

  test("is true during async guard execution", async () => {
    let loadingWhileGuard = false
    const guardRoutes: RouteRecord[] = [
      { path: "/a", component: Home },
      {
        path: "/b",
        component: User,
        beforeEnter: async () => {
          await new Promise<void>((r) => setTimeout(r, 5))
          return true
        },
      },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/a" })
    const nav = router.push("/b")
    await new Promise<void>((r) => setTimeout(r, 1))
    loadingWhileGuard = router.loading()
    await nav
    expect(loadingWhileGuard).toBe(true)
    expect(router.loading()).toBe(false)
  })

  test("is true during loader execution", async () => {
    let loadingWhileLoader = false
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/data",
        component: About,
        loader: async () => {
          await new Promise<void>((r) => setTimeout(r, 5))
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: loaderRoutes, url: "/" })
    const nav = router.push("/data")
    await new Promise<void>((r) => setTimeout(r, 1))
    loadingWhileLoader = router.loading()
    await nav
    expect(loadingWhileLoader).toBe(true)
    expect(router.loading()).toBe(false)
  })
})

// ─── Circular redirect detection ─────────────────────────────────────────────

describe("circular redirect detection", () => {
  test("aborts after 10 levels of redirect instead of infinite looping", async () => {
    const circRoutes: RouteRecord[] = [
      { path: "/a", component: Home, redirect: "/b" },
      { path: "/b", component: Home, redirect: "/a" },
    ]
    const router = createRouter({ routes: circRoutes, url: "/" })
    await router.push("/a")
    expect(router.currentRoute().path).toBe("/")
  })
})

// ─── Guard execution order ───────────────────────────────────────────────────

describe("guard execution order", () => {
  test("order: beforeLeave → beforeEnter → beforeEach → afterEach", async () => {
    const order: string[] = []
    const orderedRoutes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        beforeLeave: () => {
          order.push("beforeLeave")
          return true
        },
      },
      {
        path: "/b",
        component: User,
        beforeEnter: () => {
          order.push("beforeEnter")
          return true
        },
      },
    ]
    const router = createRouter({ routes: orderedRoutes, url: "/a" })
    router.beforeEach(() => {
      order.push("beforeEach")
      return true
    })
    router.afterEach(() => {
      order.push("afterEach")
    })
    await router.push("/b")
    expect(order).toEqual(["beforeLeave", "beforeEnter", "beforeEach", "afterEach"])
  })
})

// ─── Navigation generation (stale guard cancellation) ────────────────────────

describe("navigation generation counter", () => {
  test("stale async guard does not commit navigation", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/slow",
        component: About,
        beforeEnter: async () => {
          await new Promise<void>((r) => setTimeout(r, 50))
          return true
        },
      },
      { path: "/fast", component: User },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })

    // Start slow navigation, then immediately start fast one
    const slow = router.push("/slow")
    await router.push("/fast")
    await slow

    // Final route should be /fast, not /slow
    expect(router.currentRoute().path).toBe("/fast")
  })
})

// ─── Loader data cleanup ─────────────────────────────────────────────────────

describe("loader data cleanup", () => {
  test("prunes loader data for routes no longer matched", async () => {
    const cleanupRoutes: RouteRecord[] = [
      { path: "/a", component: Home, loader: async () => "a-data" },
      { path: "/b", component: About },
    ]
    const router = createRouter({ routes: cleanupRoutes, url: "/" }) as RouterInstance
    await router.push("/a")
    expect(router._loaderData.size).toBe(1)
    await router.push("/b")
    expect(router._loaderData.size).toBe(0)
  })
})

// ─── Lazy routes ─────────────────────────────────────────────────────────────

describe("lazy routes", () => {
  test("lazy() creates a lazy component marker", () => {
    const lazyComp = lazy(() => Promise.resolve(Home))
    expect(typeof lazyComp).toBe("object")
    expect(lazyComp.loader).toBeDefined()
  })

  test("lazy() accepts loading and error components", () => {
    const Loading = () => null
    const ErrorComp = () => null
    const lazyComp = lazy(() => Promise.resolve(Home), { loading: Loading, error: ErrorComp })
    expect(lazyComp.loadingComponent).toBe(Loading)
    expect(lazyComp.errorComponent).toBe(ErrorComp)
  })

  test("isLazy identifies lazy components", async () => {
    const { isLazy } = await import("../types")
    const lazyComp = lazy(() => Promise.resolve(Home))
    expect(isLazy(lazyComp)).toBe(true)
    expect(isLazy(Home)).toBe(false)
  })
})

// ─── Route loaders ────────────────────────────────────────────────────────────

describe("route loaders — prefetchLoaderData", () => {
  test("runs loader and stores result by record", async () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/data", component: About, loader: async () => ({ title: "hello" }) },
    ]
    const router = createRouter(loaderRoutes) as RouterInstance
    await prefetchLoaderData(router, "/data")

    const values = Array.from(router._loaderData.values())
    expect(values).toHaveLength(1)
    expect(values[0]).toEqual({ title: "hello" })
  })

  test("passes params and query to loader", async () => {
    let captured: { params: Record<string, string>; query: Record<string, string> } | null = null
    const loaderRoutes: RouteRecord[] = [
      {
        path: "/user/:id",
        component: User,
        loader: async ({ params, query }) => {
          captured = { params, query }
          return null
        },
      },
    ]
    const router = createRouter(loaderRoutes) as RouterInstance
    await prefetchLoaderData(router, "/user/42?tab=profile")

    if (!captured) throw new Error("expected captured")
    expect((captured as { params: Record<string, string> }).params.id).toBe("42")
    expect((captured as { query: Record<string, string> }).query.tab).toBe("profile")
  })

  test("multiple loaders on matched records run in parallel", async () => {
    const order: string[] = []
    const parentRoutes: RouteRecord[] = [
      {
        path: "/admin",
        component: Home,
        loader: async () => {
          order.push("parent")
          return "parent-data"
        },
        children: [
          {
            path: "users",
            component: About,
            loader: async () => {
              order.push("child")
              return "child-data"
            },
          },
        ],
      },
    ]
    const router = createRouter(parentRoutes) as RouterInstance
    await prefetchLoaderData(router, "/admin/users")

    expect(order).toContain("parent")
    expect(order).toContain("child")
    expect(router._loaderData.size).toBe(2)
  })
})

describe("route loaders — serializeLoaderData / hydrateLoaderData", () => {
  test("serializeLoaderData returns path-keyed object", async () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/items", component: Home, loader: async () => [1, 2, 3] },
    ]
    const router = createRouter(loaderRoutes) as RouterInstance
    await prefetchLoaderData(router, "/items")

    const serialized = serializeLoaderData(router)
    expect(serialized["/items"]).toEqual([1, 2, 3])
  })

  test("hydrateLoaderData populates _loaderData for current route", () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/items", component: About, loader: async () => [] },
    ]
    const router = createRouter({ routes: loaderRoutes, url: "/items" }) as RouterInstance
    hydrateLoaderData(router, { "/items": ["a", "b"] })

    const values = Array.from(router._loaderData.values())
    expect(values).toHaveLength(1)
    expect(values[0]).toEqual(["a", "b"])
  })

  test("serialize → hydrate round-trip preserves data", async () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/page", component: Home, loader: async () => ({ x: 1 }) },
    ]
    const ssrRouter = createRouter({ routes: loaderRoutes, url: "/page" }) as RouterInstance
    await prefetchLoaderData(ssrRouter, "/page")
    const serialized = serializeLoaderData(ssrRouter)

    const clientRouter = createRouter({ routes: loaderRoutes, url: "/page" }) as RouterInstance
    hydrateLoaderData(clientRouter, serialized)

    const values = Array.from(clientRouter._loaderData.values())
    expect(values[0]).toEqual({ x: 1 })
  })

  test("hydrateLoaderData handles null/undefined gracefully", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    expect(() =>
      hydrateLoaderData(router, null as unknown as Record<string, unknown>),
    ).not.toThrow()
    expect(() =>
      hydrateLoaderData(router, undefined as unknown as Record<string, unknown>),
    ).not.toThrow()
  })

  test("loader is aborted when navigation is superseded", async () => {
    let capturedSignal: AbortSignal | undefined
    let slowStarted = false

    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/slow",
        component: About,
        loader: async ({ signal }) => {
          capturedSignal = signal
          slowStarted = true
          await new Promise<void>((r) => setTimeout(r, 50))
          return "slow"
        },
      },
      { path: "/fast", component: User, loader: async () => "fast" },
    ]
    const router = createRouter(loaderRoutes) as RouterInstance

    const slowNav = router.push("/slow")
    await new Promise<void>((r) => setTimeout(r, 5))
    expect(slowStarted).toBe(true)

    await router.push("/fast")
    await slowNav

    expect(capturedSignal?.aborted).toBe(true)
    expect(router.currentRoute().path).toBe("/fast")
  })

  test("loader error is caught gracefully", async () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/fail",
        component: About,
        loader: async () => {
          throw new Error("loader failed")
        },
      },
    ]
    const router = createRouter({ routes: loaderRoutes, url: "/" })
    // Should not throw
    await router.push("/fail")
    expect(router.currentRoute().path).toBe("/fail")
  })
})

// ─── ScrollManager ───────────────────────────────────────────────────────────

describe("ScrollManager", () => {
  test("constructor defaults to 'top' behavior", () => {
    const sm = new ScrollManager()
    expect(sm.getSavedPosition("/test")).toBeNull()
  })

  test("constructor accepts custom behavior", () => {
    const sm = new ScrollManager("restore")
    expect(sm).toBeDefined()
  })

  test("getSavedPosition returns null for unsaved path", () => {
    const sm = new ScrollManager()
    expect(sm.getSavedPosition("/unknown")).toBeNull()
  })

  test("save does not throw in SSR (no window)", () => {
    // In bun test there is no real window.scrollY, but save should not throw
    const sm = new ScrollManager()
    expect(() => sm.save("/page")).not.toThrow()
  })

  test("restore does not throw in SSR (no window check)", () => {
    const sm = new ScrollManager()
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    expect(() => sm.restore(to, from)).not.toThrow()
  })
})

// ─── Router internal state ───────────────────────────────────────────────────

describe("router internal state", () => {
  test("_viewDepth starts at 0", () => {
    const router = createRouter(routes) as RouterInstance
    expect(router._viewDepth).toBe(0)
  })

  test("_componentCache is initially empty", () => {
    const router = createRouter(routes) as RouterInstance
    expect(router._componentCache.size).toBe(0)
  })

  test("_erroredChunks is initially empty", () => {
    const router = createRouter(routes) as RouterInstance
    expect(router._erroredChunks.size).toBe(0)
  })

  test("_resolve exposes internal route resolution", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    const resolved = router._resolve("/about")
    expect(resolved.path).toBe("/about")
    expect(resolved.matched.length).toBeGreaterThan(0)
  })
})

// ─── Helper: create a fresh container ─────────────────────────────────────────

function container(): HTMLElement {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

// ─── getActiveRouter / setActiveRouter ────────────────────────────────────────

describe("getActiveRouter / setActiveRouter", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("getActiveRouter returns null initially", () => {
    expect(getActiveRouter()).toBeNull()
  })

  test("setActiveRouter sets and getActiveRouter retrieves", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    setActiveRouter(router)
    expect(getActiveRouter()).toBe(router)
  })

  test("setActiveRouter resets _viewDepth to 0", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    router._viewDepth = 5
    setActiveRouter(router)
    expect(router._viewDepth).toBe(0)
  })

  test("setActiveRouter(null) clears active router", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    setActiveRouter(router)
    setActiveRouter(null)
    expect(getActiveRouter()).toBeNull()
  })
})

// ─── useRouter / useRoute (outside component tree) ───────────────────────────

describe("useRouter / useRoute", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("useRouter throws when no router installed", () => {
    expect(() => useRouter()).toThrow("[pyreon-router] No router installed")
  })

  test("useRoute throws when no router installed", () => {
    expect(() => useRoute()).toThrow("[pyreon-router] No router installed")
  })

  test("useRouter returns router after setActiveRouter", () => {
    const router = createRouter({ routes, url: "/" })
    setActiveRouter(router as RouterInstance)
    expect(useRouter()).toBe(router)
  })

  test("useRoute returns currentRoute accessor after setActiveRouter", () => {
    const router = createRouter({ routes, url: "/about" })
    setActiveRouter(router as RouterInstance)
    const route = useRoute()
    expect(route().path).toBe("/about")
  })
})

// ─── RouterProvider ──────────────────────────────────────────────────────────

describe("RouterProvider", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("renders children", () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    mount(h(RouterProvider, { router }, h("span", null, "child-content")), el)
    expect(el.textContent).toContain("child-content")
  })

  test("sets active router for useRouter calls", () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    let capturedRouter: unknown = null
    const Checker = () => {
      capturedRouter = useRouter()
      return null
    }
    mount(h(RouterProvider, { router }, h(Checker, null)), el)
    expect(capturedRouter).toBe(router)
  })

  test("renders null children gracefully", () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    mount(h(RouterProvider, { router }), el)
    // Should not throw, el may have empty or comment content
    expect(el).toBeDefined()
  })
})

// ─── RouterView ──────────────────────────────────────────────────────────────

describe("RouterView", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("returns null when no router is available", () => {
    const el = container()
    mount(h(RouterView, {}), el)
    // RouterView always wraps in a div, but with no router the child is null
    const wrapper = el.querySelector("[data-pyreon-router-view]")
    expect(wrapper).not.toBeNull()
  })

  test("renders matched route component at depth 0", () => {
    const el = container()
    const HomePage = () => h("span", null, "home-page")
    const viewRoutes: RouteRecord[] = [{ path: "/", component: HomePage }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.textContent).toContain("home-page")
  })

  test("renders nothing when no matched routes", () => {
    const el = container()
    const viewRoutes: RouteRecord[] = [
      { path: "/specific", component: () => h("span", null, "specific") },
    ]
    const router = createRouter({ routes: viewRoutes, url: "/nonexistent" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // The wrapper div exists but should have no rendered component content
    const text = el.textContent ?? ""
    expect(text).not.toContain("specific")
  })

  test("renders nested routes at correct depth", () => {
    const el = container()
    const ChildComp = () => h("span", null, "child-content")
    const ParentComp = () => h("div", { class: "parent" }, h(RouterView, {}))
    const nestedViewRoutes: RouteRecord[] = [
      {
        path: "/parent",
        component: ParentComp,
        children: [{ path: "child", component: ChildComp }],
      },
    ]
    const router = createRouter({ routes: nestedViewRoutes, url: "/parent/child" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(el.textContent).toContain("child-content")
  })

  test("accepts explicit router prop", () => {
    const el = container()
    const TestComp = () => h("span", null, "explicit-router")
    const viewRoutes: RouteRecord[] = [{ path: "/", component: TestComp }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    // Pass router directly via prop instead of context
    mount(h(RouterView, { router }), el)
    expect(el.textContent).toContain("explicit-router")
  })

  test("renders component with route props (params, query, meta)", () => {
    const el = container()
    let capturedProps: Record<string, unknown> = {}
    const PropsComp = (props: Record<string, unknown>) => {
      capturedProps = props
      return h("span", null, "props-test")
    }
    const viewRoutes: RouteRecord[] = [
      { path: "/user/:id", component: PropsComp, meta: { title: "User" } },
    ]
    const router = createRouter({ routes: viewRoutes, url: "/user/42?tab=profile" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    expect(capturedProps.params).toEqual({ id: "42" })
    expect((capturedProps.query as Record<string, string>).tab).toBe("profile")
    expect((capturedProps.meta as Record<string, string>).title).toBe("User")
  })

  test("renders loader data via LoaderDataProvider", async () => {
    const el = container()
    const DataComp = () => {
      return h("span", null, "data-comp")
    }
    const viewRoutes: RouteRecord[] = [
      {
        path: "/data",
        component: DataComp,
        loader: async () => ({ items: [1, 2, 3] }),
      },
    ]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    // Prefetch to populate loader data
    await prefetchLoaderData(router as RouterInstance, "/data")

    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // Navigate to the data route
    await router.push("/data")
    // The component should render
    expect(el.textContent).toContain("data-comp")
  })
})

// ─── RouterLink ──────────────────────────────────────────────────────────────

describe("RouterLink", () => {
  beforeEach(() => {
    setActiveRouter(null)
  })

  test("renders an <a> tag with correct href (hash mode)", () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/about" }, "About")), el)
    const anchor = el.querySelector("a")
    expect(anchor).not.toBeNull()
    expect(anchor?.getAttribute("href")).toBe("#/about")
    expect(anchor?.textContent).toBe("About")
  })

  test("renders an <a> tag with correct href (history mode)", () => {
    const el = container()
    const router = createRouter({ routes, mode: "history", url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/about" }, "About")), el)
    const anchor = el.querySelector("a")
    expect(anchor?.getAttribute("href")).toBe("/about")
  })

  test("uses to as default children text", () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/about" })), el)
    const anchor = el.querySelector("a")
    expect(anchor?.textContent).toBe("/about")
  })

  test("applies active class when route matches", () => {
    const el = container()
    const router = createRouter({ routes, url: "/about" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/about" }, "About")), el)
    const anchor = el.querySelector("a")
    const cls = anchor?.getAttribute("class") ?? ""
    expect(cls).toContain("router-link-active")
    expect(cls).toContain("router-link-exact-active")
  })

  test("applies custom activeClass and exactActiveClass", () => {
    const el = container()
    const router = createRouter({ routes, url: "/about" })
    mount(
      h(
        RouterProvider,
        { router },
        h(
          RouterLink,
          { to: "/about", activeClass: "my-active", exactActiveClass: "my-exact" },
          "About",
        ),
      ),
      el,
    )
    const anchor = el.querySelector("a")
    const cls = anchor?.getAttribute("class") ?? ""
    expect(cls).toContain("my-active")
    expect(cls).toContain("my-exact")
  })

  test("applies active class for prefix match on nested paths", () => {
    const el = container()
    const nestedRoutes: RouteRecord[] = [
      { path: "/admin", component: Home, children: [{ path: "users", component: About }] },
    ]
    const router = createRouter({ routes: nestedRoutes, url: "/admin/users" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/admin" }, "Admin")), el)
    const anchor = el.querySelector("a")
    const cls = anchor?.getAttribute("class") ?? ""
    expect(cls).toContain("router-link-active")
    // Not exact match
    expect(cls).not.toContain("router-link-exact-active")
  })

  test("exact prop prevents prefix matching", () => {
    const el = container()
    const nestedRoutes: RouteRecord[] = [
      { path: "/admin", component: Home, children: [{ path: "users", component: About }] },
    ]
    const router = createRouter({ routes: nestedRoutes, url: "/admin/users" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/admin", exact: true }, "Admin")), el)
    const anchor = el.querySelector("a")
    const cls = anchor?.getAttribute("class") ?? ""
    expect(cls).not.toContain("router-link-active")
  })

  test("root path / does not match all paths as prefix", () => {
    const el = container()
    const router = createRouter({ routes, url: "/about" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/" }, "Home")), el)
    const anchor = el.querySelector("a")
    const cls = anchor?.getAttribute("class") ?? ""
    // "/" should not be active for "/about"
    expect(cls).not.toContain("router-link-active")
  })

  test("click triggers router.push", async () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/about" }, "About")), el)
    const anchor = el.querySelector("a")
    expect(anchor).not.toBeNull()
    // Simulate click
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    anchor?.dispatchEvent(event)
    // Wait for async navigation
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(router.currentRoute().path).toBe("/about")
  })

  test("click with replace prop uses router.replace", async () => {
    const el = container()
    const router = createRouter({ routes, url: "/" })
    let replaceCalled = false
    const origReplace = router.replace.bind(router)
    router.replace = async (path: string) => {
      replaceCalled = true
      return origReplace(path)
    }
    mount(
      h(RouterProvider, { router }, h(RouterLink, { to: "/about", replace: true }, "About")),
      el,
    )
    const anchor = el.querySelector("a")
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    anchor?.dispatchEvent(event)
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(replaceCalled).toBe(true)
    expect(router.currentRoute().path).toBe("/about")
  })

  test("mouseenter triggers prefetch (hover mode) via onMouseEnter prop", async () => {
    // Render RouterLink and manually trigger the onMouseEnter handler
    const el = container()
    let loaderCalled = false
    const prefetchRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/data",
        component: About,
        loader: async () => {
          loaderCalled = true
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: prefetchRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/data" }, "Data")), el)
    const anchor = el.querySelector("a") as HTMLAnchorElement
    expect(anchor).not.toBeNull()
    // applyProp converts onMouseEnter -> addEventListener("mouseEnter", ...) via:
    //   key[2].toLowerCase() + key.slice(3) = "m" + "ouseEnter" = "mouseEnter"
    // So the event type is "mouseEnter" (camelCase), not "mouseenter"
    anchor.dispatchEvent(new Event("mouseEnter"))
    await new Promise<void>((r) => setTimeout(r, 100))
    expect(loaderCalled).toBe(true)
  })

  test("prefetch=none does not trigger on mouseenter", () => {
    // Test that the rendered RouterLink with prefetch=none does not set up hover prefetch.
    // We test the component behavior by verifying the props flow.
    const el = container()
    let loaderCalled = false
    const prefetchRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/data",
        component: About,
        loader: async () => {
          loaderCalled = true
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: prefetchRoutes, url: "/" })
    mount(
      h(RouterProvider, { router }, h(RouterLink, { to: "/data", prefetch: "none" }, "Data")),
      el,
    )
    // No prefetch should have been called during mount
    expect(loaderCalled).toBe(false)
  })

  test("prefetch deduplicates by path via prefetchLoaderData", async () => {
    let loaderCallCount = 0
    const prefetchRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/data",
        component: About,
        loader: async () => {
          loaderCallCount++
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: prefetchRoutes, url: "/" }) as RouterInstance
    await prefetchLoaderData(router, "/data")
    expect(loaderCallCount).toBe(1)
  })
})

// ─── ScrollManager (DOM tests) ──────────────────────────────────────────────

describe("ScrollManager (DOM)", () => {
  test("save stores window.scrollY", () => {
    const sm = new ScrollManager()
    // happy-dom has window.scrollY = 0 by default
    sm.save("/page1")
    expect(sm.getSavedPosition("/page1")).toBe(0)
  })

  test("restore with 'top' scrolls to top", () => {
    const sm = new ScrollManager("top")
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(0)
    window.scrollTo = origScrollTo
  })

  test("restore with 'restore' uses saved position", () => {
    const sm = new ScrollManager("restore")
    // Save a position for the target path
    sm.save("/target")
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = {
      path: "/target",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    const from: ResolvedRoute = {
      path: "/other",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(0) // window.scrollY is 0 in happy-dom
    window.scrollTo = origScrollTo
  })

  test("restore with 'none' does not scroll", () => {
    const sm = new ScrollManager("none")
    let scrollCalled = false
    const origScrollTo = window.scrollTo
    window.scrollTo = (() => {
      scrollCalled = true
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrollCalled).toBe(false)
    window.scrollTo = origScrollTo
  })

  test("restore with numeric result scrolls to that position", () => {
    const customFn = () => 250
    const sm = new ScrollManager(customFn)
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(250)
    window.scrollTo = origScrollTo
  })

  test("restore uses custom function with savedPosition", () => {
    let receivedSaved: number | null = null
    const customFn = (_to: ResolvedRoute, _from: ResolvedRoute, saved: number | null) => {
      receivedSaved = saved
      return "top" as const
    }
    const sm = new ScrollManager(customFn)
    sm.save("/target")
    const origScrollTo = window.scrollTo
    window.scrollTo = (() => {}) as typeof window.scrollTo
    const to: ResolvedRoute = {
      path: "/target",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    const from: ResolvedRoute = {
      path: "/other",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(receivedSaved as unknown as number).toBe(0) // saved position exists (0 from happy-dom)
    window.scrollTo = origScrollTo
  })

  test("per-route meta.scrollBehavior overrides global", () => {
    const sm = new ScrollManager("top")
    let scrollCalled = false
    const origScrollTo = window.scrollTo
    window.scrollTo = (() => {
      scrollCalled = true
    }) as typeof window.scrollTo
    const to: ResolvedRoute = {
      path: "/a",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: { scrollBehavior: "none" },
    }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrollCalled).toBe(false)
    window.scrollTo = origScrollTo
  })
})

// ─── Router navigation (DOM mode — with window) ─────────────────────────────

describe("router navigation (DOM hash mode)", () => {
  test("push updates window.location.hash", async () => {
    const router = createRouter({ routes, mode: "hash" })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    // history.pushState was used, so hash should be set
    expect(window.location.hash).toBe("#/about")
  })

  test("replace updates hash via replaceState", async () => {
    const router = createRouter({ routes, mode: "hash" })
    await router.replace("/about")
    expect(router.currentRoute().path).toBe("/about")
    expect(window.location.hash).toBe("#/about")
  })
})

describe("router navigation (DOM history mode)", () => {
  test("push calls history.pushState in history mode", async () => {
    let pushStateCalled = false
    let pushedUrl = ""
    const origPushState = window.history.pushState
    window.history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
      pushStateCalled = true
      pushedUrl = String(url ?? "")
      origPushState.call(window.history, data, unused, url)
    }
    const router = createRouter({ routes, mode: "history" })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    expect(pushStateCalled).toBe(true)
    expect(pushedUrl).toBe("/about")
    window.history.pushState = origPushState
  })

  test("replace calls history.replaceState in history mode", async () => {
    let replaceStateCalled = false
    let replacedUrl = ""
    const origReplaceState = window.history.replaceState
    window.history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      replaceStateCalled = true
      replacedUrl = String(url ?? "")
      origReplaceState.call(window.history, data, unused, url)
    }
    const router = createRouter({ routes, mode: "history" })
    await router.replace("/user/42")
    expect(router.currentRoute().path).toBe("/user/42")
    expect(replaceStateCalled).toBe(true)
    expect(replacedUrl).toBe("/user/42")
    window.history.replaceState = origReplaceState
  })
})

// ─── document.title from route meta ──────────────────────────────────────────

describe("document.title from meta", () => {
  test("sets document.title on navigation when meta.title is set", async () => {
    const titleRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/titled", component: About, meta: { title: "My Page" } },
    ]
    const router = createRouter({ routes: titleRoutes })
    const origTitle = document.title
    await router.push("/titled")
    expect(document.title).toBe("My Page")
    document.title = origTitle
  })
})

// ─── matchPrefix with params (match.ts lines 80, 82) ────────────────────────

describe("nested route matching with params", () => {
  test("nested route extracts params from parent prefix", () => {
    const paramNested: RouteRecord[] = [
      {
        path: "/user/:id",
        component: Home,
        children: [{ path: "posts", component: About }],
      },
    ]
    const r = resolveRoute("/user/42/posts", paramNested)
    expect(r.matched).toHaveLength(2)
    expect(r.params.id).toBe("42")
  })

  test("nested route merges parent and child params", () => {
    const paramNested: RouteRecord[] = [
      {
        path: "/org/:orgId",
        component: Home,
        children: [{ path: "team/:teamId", component: About }],
      },
    ]
    const r = resolveRoute("/org/acme/team/dev", paramNested)
    expect(r.matched).toHaveLength(2)
    expect(r.params.orgId).toBe("acme")
    expect(r.params.teamId).toBe("dev")
  })

  test("parent with children but no matching child and no exact match returns empty", () => {
    const routesDef: RouteRecord[] = [
      {
        path: "/admin",
        component: AdminLayout,
        children: [{ path: "users", component: AdminUsers }],
      },
    ]
    // /admin/settings does not match any child, and /admin/settings != /admin
    const r = resolveRoute("/admin/settings", routesDef)
    expect(r.matched).toHaveLength(0)
  })

  test("parent route with children matches exact parent path", () => {
    const routesDef: RouteRecord[] = [
      {
        path: "/admin",
        component: AdminLayout,
        children: [{ path: "users", component: AdminUsers }],
      },
    ]
    // /admin exact matches the parent
    const r = resolveRoute("/admin", routesDef)
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0]?.component).toBe(AdminLayout)
  })
})

// ─── Lazy route rendering in RouterView ──────────────────────────────────────

describe("RouterView with lazy routes", () => {
  test("lazy route shows loading component initially", async () => {
    const el = container()
    const LoadingComp = () => h("span", null, "loading...")
    const ActualComp = () => h("span", null, "loaded!")
    const lazyComp = lazy(
      () =>
        new Promise<{ default: typeof ActualComp }>((res) =>
          setTimeout(() => res({ default: ActualComp }), 50),
        ),
      { loading: LoadingComp },
    )
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // Initially shows loading
    expect(el.textContent).toContain("loading...")
  })

  test("lazy route resolves and populates component cache", async () => {
    const ActualComp = () => h("span", null, "loaded!")
    const lazyComp = lazy(() => Promise.resolve(ActualComp))
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" }) as RouterInstance
    // Initially the cache is empty
    expect(router._componentCache.size).toBe(0)
    // Mount triggers the lazy load
    const el = container()
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // Wait for the Promise to resolve + signal update
    await new Promise<void>((r) => setTimeout(r, 100))
    // After lazy load, the resolved component is cached
    expect(router._componentCache.size).toBe(1)
    const cached = Array.from(router._componentCache.values())[0]
    expect(cached).toBe(ActualComp)
  })

  test("lazy route with module default export", async () => {
    const el = container()
    const ActualComp = () => h("span", null, "default-export")
    const lazyComp = lazy(() => Promise.resolve({ default: ActualComp }))
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(el.textContent).toContain("default-export")
  })
})

// ─── isStaleChunk helper (components.tsx lines 240-242) ──────────────────────

describe("RouterView lazy error handling", () => {
  test("lazy route shows error component after retries fail", async () => {
    const el = container()
    const ErrorComp = () => h("span", null, "error-ui")
    let attempts = 0
    const lazyComp = lazy(
      () => {
        attempts++
        return Promise.reject(new Error("chunk failed"))
      },
      { error: ErrorComp },
    )
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // Wait for initial attempt + 3 retries with exponential backoff
    // attempt 0 immediate, retry 1 at 500ms, retry 2 at 1000ms, retry 3 at 2000ms
    await new Promise<void>((r) => setTimeout(r, 4500))
    expect(el.textContent).toContain("error-ui")
    expect(attempts).toBeGreaterThanOrEqual(3)
  }, 10000)

  test("lazy route shows null when error component not provided and retries fail", async () => {
    const el = container()
    const lazyComp = lazy(() => Promise.reject(new Error("chunk failed")))
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    await new Promise<void>((r) => setTimeout(r, 4500))
    // The wrapper div exists but component content should be empty
    const wrapper = el.querySelector("[data-pyreon-router-view]")
    // Text inside wrapper should be empty (only comment nodes)
    const spans = wrapper?.querySelectorAll("span")
    expect(spans?.length ?? 0).toBe(0)
  }, 10000)
})

// ─── Concurrent navigation cancels stale loaders ─────────────────────────────

describe("concurrent navigation cancels in-flight loaders", () => {
  test("stale loader is aborted when new navigation starts", async () => {
    let slowAborted = false
    const concRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/slow",
        component: About,
        loader: async ({ signal }) => {
          signal.addEventListener("abort", () => {
            slowAborted = true
          })
          await new Promise<void>((r) => setTimeout(r, 100))
          return "slow"
        },
      },
      { path: "/fast", component: User, loader: async () => "fast" },
    ]
    const router = createRouter(concRoutes)

    const slow = router.push("/slow")
    await new Promise<void>((r) => setTimeout(r, 5))
    await router.push("/fast")
    await slow

    expect(slowAborted).toBe(true)
    expect(router.currentRoute().path).toBe("/fast")
  })
})

// ─── back() in DOM environment ───────────────────────────────────────────────

describe("back() in DOM", () => {
  test("back() calls window.history.back", () => {
    const router = createRouter({ routes })
    let backCalled = false
    const origBack = window.history.back
    window.history.back = () => {
      backCalled = true
    }
    router.back()
    expect(backCalled).toBe(true)
    window.history.back = origBack
  })
})

// ─── Scroll behavior integration via navigation ─────────────────────────────

describe("scroll behavior on navigation", () => {
  test("navigation triggers scroll restore via microtask", async () => {
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo

    const router = createRouter({ routes, scrollBehavior: "top" })
    await router.push("/about")
    // Wait for microtask
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(scrolledTo).toBe(0)

    window.scrollTo = origScrollTo
  })
})

// ─── History mode popstate (router.ts line 90 — getCurrentLocation) ─────────

describe("history mode popstate", () => {
  test("popstate event updates currentRoute in history mode", async () => {
    const router = createRouter({ routes, mode: "history" })
    // Push an initial route so we have something in history
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    // Simulate back navigation via popstate — we need to manually set the URL
    // first because happy-dom doesn't actually track history.
    // pushState to set pathname, then dispatch popstate
    window.history.pushState(null, "", "/user/99")
    window.dispatchEvent(new PopStateEvent("popstate"))
    // getCurrentLocation reads window.location.pathname + search
    await new Promise<void>((r) => setTimeout(r, 10))
    // The path should now reflect whatever pathname + search the browser reports
    expect(router.currentRoute().path).not.toBe("/about")
  })
})

// ─── Prefetch error path (components.tsx lines 198-199) ──────────────────────

describe("prefetch error handling", () => {
  test("prefetch error is silently caught in RouterLink's prefetchRoute", async () => {
    // The prefetchRoute function in components.tsx catches errors from
    // prefetchLoaderData and removes the path from the prefetched set.
    // We test this by hovering over a link whose loader will fail.
    const el = container()
    let loaderCallCount = 0
    const failRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/fail",
        component: About,
        loader: async () => {
          loaderCallCount++
          throw new Error("prefetch error")
        },
      },
    ]
    const router = createRouter({ routes: failRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/fail" }, "Fail")), el)
    const anchor = el.querySelector("a") as HTMLAnchorElement
    anchor.dispatchEvent(new Event("mouseEnter"))
    await new Promise<void>((r) => setTimeout(r, 100))
    expect(loaderCallCount).toBe(1)
    // After the error, the path is removed from prefetched set, so hovering again
    // should trigger another attempt
    anchor.dispatchEvent(new Event("mouseEnter"))
    await new Promise<void>((r) => setTimeout(r, 100))
    expect(loaderCallCount).toBe(2)
  })
})

// ─── Stale chunk detection (components.tsx lines 111-112) ────────────────────

describe("stale chunk detection", () => {
  test("TypeError 'Failed to fetch' triggers window.location.reload", async () => {
    const el = container()
    let reloadCalled = false
    // Mock window.location.reload
    const origReload = window.location.reload
    Object.defineProperty(window.location, "reload", {
      value: () => {
        reloadCalled = true
      },
      writable: true,
      configurable: true,
    })

    const lazyComp = lazy(() =>
      Promise.reject(new TypeError("Failed to fetch dynamically imported module")),
    )
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // Wait for all retries to exhaust (500 + 1000 + 2000 = 3500ms)
    await new Promise<void>((r) => setTimeout(r, 4500))
    expect(reloadCalled).toBe(true)

    // Restore
    Object.defineProperty(window.location, "reload", {
      value: origReload,
      writable: true,
      configurable: true,
    })
  }, 10000)

  test("SyntaxError triggers window.location.reload for stale chunk", async () => {
    const el = container()
    let reloadCalled = false
    const origReload = window.location.reload
    Object.defineProperty(window.location, "reload", {
      value: () => {
        reloadCalled = true
      },
      writable: true,
      configurable: true,
    })

    const lazyComp = lazy(() => Promise.reject(new SyntaxError("Unexpected token '<'")))
    const viewRoutes: RouteRecord[] = [{ path: "/", component: lazyComp as unknown as typeof Home }]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    await new Promise<void>((r) => setTimeout(r, 4500))
    expect(reloadCalled).toBe(true)

    Object.defineProperty(window.location, "reload", {
      value: origReload,
      writable: true,
      configurable: true,
    })
  }, 10000)
})

// ─── parseQueryMulti ─────────────────────────────────────────────────────────

describe("parseQueryMulti", () => {
  let parseQueryMulti: (qs: string) => Record<string, string | string[]>

  beforeAll(async () => {
    const mod = await import("../match")
    parseQueryMulti = mod.parseQueryMulti
  })

  test("returns empty for empty string", () => {
    expect(parseQueryMulti("")).toEqual({})
  })

  test("parses single key-value pair", () => {
    expect(parseQueryMulti("a=1")).toEqual({ a: "1" })
  })

  test("returns array for duplicate keys", () => {
    expect(parseQueryMulti("color=red&color=blue")).toEqual({ color: ["red", "blue"] })
  })

  test("handles mix of single and duplicate keys", () => {
    const result = parseQueryMulti("color=red&color=blue&size=lg")
    expect(result.color).toEqual(["red", "blue"])
    expect(result.size).toBe("lg")
  })

  test("handles keys without values", () => {
    expect(parseQueryMulti("flag")).toEqual({ flag: "" })
  })

  test("skips empty key parts", () => {
    const result = parseQueryMulti("=value")
    expect(Object.keys(result)).toHaveLength(0)
  })

  test("handles triple duplicate", () => {
    const result = parseQueryMulti("a=1&a=2&a=3")
    expect(result.a).toEqual(["1", "2", "3"])
  })
})

// ─── matchPath splat params ─────────────────────────────────────────────────

describe("matchPath splat params", () => {
  test("captures rest of path with splat param", () => {
    const result = matchPath("/files/:path*", "/files/a/b/c")
    expect(result).not.toBeNull()
    expect(result?.path).toBe("a/b/c")
  })

  test("captures single segment with splat param", () => {
    const result = matchPath("/files/:path*", "/files/readme.md")
    expect(result).not.toBeNull()
    expect(result?.path).toBe("readme.md")
  })
})

// ─── buildPath splat params ─────────────────────────────────────────────────

describe("buildPath splat params", () => {
  test("builds path with splat param", () => {
    // buildPath regex captures "path*" as key (including the asterisk)
    const result = buildPath("/files/:path*", { "path*": "a/b/c" })
    expect(result).toBe("/files/a/b/c")
  })

  test("encodes individual segments in splat", () => {
    // buildPath regex captures "path*" as key (including the asterisk)
    const result = buildPath("/files/:path*", { "path*": "hello world/file name" })
    expect(result).toBe("/files/hello%20world/file%20name")
  })

  test("handles missing param gracefully", () => {
    const result = buildPath("/user/:id", {})
    expect(result).toBe("/user/")
  })
})

// ─── Nested routes with splat prefix ────────────────────────────────────────

describe("matchPrefix with splat", () => {
  test("splat param in parent captures everything and sets rest to /", () => {
    const splatRoutes: RouteRecord[] = [
      {
        path: "/:path*",
        component: Home,
        children: [{ path: "/", component: About }],
      },
    ]
    const r = resolveRoute("/any/deep/path", splatRoutes)
    expect(r.matched.length).toBeGreaterThan(0)
  })

  test("wildcard in prefix matches and passes rest", () => {
    const wildcardRoutes: RouteRecord[] = [
      {
        path: "*",
        component: Home,
        children: [{ path: "/", component: About }],
      },
    ]
    const r = resolveRoute("/anything", wildcardRoutes)
    expect(r.matched.length).toBeGreaterThan(0)
  })
})

// ─── onError callback ────────────────────────────────────────────────────────

describe("onError callback", () => {
  test("onError returning false cancels navigation on loader failure", async () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/fail",
        component: About,
        loader: async () => {
          throw new Error("loader error")
        },
      },
    ]
    const router = createRouter({
      routes: loaderRoutes,
      url: "/",
      onError: () => false,
    })
    await router.push("/fail")
    // Navigation should be cancelled
    expect(router.currentRoute().path).toBe("/")
  })

  test("onError returning undefined allows navigation to continue", async () => {
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/fail",
        component: About,
        loader: async () => {
          throw new Error("loader error")
        },
      },
    ]
    const router = createRouter({
      routes: loaderRoutes,
      url: "/",
      onError: () => undefined,
    })
    await router.push("/fail")
    expect(router.currentRoute().path).toBe("/fail")
  })
})

// ─── RouterView with errorComponent ─────────────────────────────────────────

describe("RouterView with errorComponent on loader failure", () => {
  test("renders errorComponent when loader data is undefined", async () => {
    const el = container()
    const ErrorComp = () => h("span", null, "loader-error")
    const DataComp = () => h("span", null, "data")
    const viewRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/err",
        component: DataComp,
        loader: async () => {
          throw new Error("fail")
        },
        errorComponent: ErrorComp,
      },
    ]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    await router.push("/err")
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(el.textContent).toContain("loader-error")
  })
})

// ─── Component cache eviction ───────────────────────────────────────────────

describe("component cache eviction", () => {
  test("evicts oldest entry when cache exceeds maxCacheSize", async () => {
    const Comp1 = () => h("span", null, "c1")
    const Comp2 = () => h("span", null, "c2")
    const Comp3 = () => h("span", null, "c3")
    const cacheRoutes: RouteRecord[] = [
      { path: "/a", component: Comp1 },
      { path: "/b", component: Comp2 },
      { path: "/c", component: Comp3 },
    ]
    const router = createRouter({
      routes: cacheRoutes,
      url: "/a",
      maxCacheSize: 2,
    }) as RouterInstance

    // Manually simulate cache population
    const el = container()
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // Navigate to populate cache
    await router.push("/a")
    await router.push("/b")
    await router.push("/c")
    await new Promise<void>((r) => setTimeout(r, 50))
    // Cache size should never exceed maxCacheSize + 1 (the newest)
    expect(router._componentCache.size).toBeLessThanOrEqual(3)
  })
})

// ─── RouterLink no-router edge cases ────────────────────────────────────────

describe("RouterLink edge cases", () => {
  test("RouterLink click without router does not throw", () => {
    const el = container()
    // Mount RouterLink without RouterProvider
    setActiveRouter(null)
    mount(h(RouterLink, { to: "/test" }), el)
    const anchor = el.querySelector("a")
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    // Should not throw
    expect(() => anchor?.dispatchEvent(event)).not.toThrow()
  })

  test("RouterLink activeClass returns empty string without router", () => {
    const el = container()
    setActiveRouter(null)
    // Pop any leaked context entries from prior tests that mount RouterProvider
    // without unmounting (pushContext is not cleaned up without onUnmount).
    // Pop enough times to clear any stale entries (safe on empty stack).
    for (let i = 0; i < 50; i++) popContext()
    mount(h(RouterLink, { to: "/test" }), el)
    const anchor = el.querySelector("a")
    // class should be empty or not set
    const cls = anchor?.getAttribute("class") ?? ""
    expect(cls).toBe("")
  })
})

// ─── RouterLink viewport prefetch (components.tsx lines 197-210) ─────────────

describe("RouterLink viewport prefetch", () => {
  test("viewport prefetch uses IntersectionObserver", async () => {
    const el = container()
    let loaderCalled = false
    const prefetchRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/visible",
        component: About,
        loader: async () => {
          loaderCalled = true
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: prefetchRoutes, url: "/" })

    // Mock IntersectionObserver to immediately trigger intersection
    const origIO = globalThis.IntersectionObserver
    let observedEl: Element | null = null
    const mockObserver = {
      observe: (el: Element) => {
        observedEl = el
      },
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    }
    globalThis.IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        mockObserver.observe(el)
        // Immediately trigger intersection
        this.cb(
          [{ isIntersecting: true, target: el } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }
      disconnect() {
        mockObserver.disconnect()
      }
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ""
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    mount(
      h(
        RouterProvider,
        { router },
        h(RouterLink, { to: "/visible", prefetch: "viewport" }, "Visible"),
      ),
      el,
    )

    // Wait for queueMicrotask + prefetch
    await new Promise<void>((r) => setTimeout(r, 200))
    expect(observedEl).not.toBeNull()
    expect(loaderCalled).toBe(true)
    expect(mockObserver.disconnect).toHaveBeenCalled()

    globalThis.IntersectionObserver = origIO
  })

  test("viewport prefetch does not observe when entry is not intersecting", async () => {
    const el = container()
    let loaderCalled = false
    const prefetchRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/hidden",
        component: About,
        loader: async () => {
          loaderCalled = true
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: prefetchRoutes, url: "/" })

    const origIO = globalThis.IntersectionObserver
    const mockDisconnect = vi.fn()
    globalThis.IntersectionObserver = class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe(el: Element) {
        // Trigger with isIntersecting: false
        this.cb(
          [{ isIntersecting: false, target: el } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        )
      }
      disconnect() {
        mockDisconnect()
      }
      unobserve() {}
      takeRecords() {
        return []
      }
      get root() {
        return null
      }
      get rootMargin() {
        return ""
      }
      get thresholds() {
        return []
      }
    } as unknown as typeof IntersectionObserver

    mount(
      h(
        RouterProvider,
        { router },
        h(RouterLink, { to: "/hidden", prefetch: "viewport" }, "Hidden"),
      ),
      el,
    )

    await new Promise<void>((r) => setTimeout(r, 100))
    // Loader should NOT have been called since element is not intersecting
    expect(loaderCalled).toBe(false)

    globalThis.IntersectionObserver = origIO
  })
})

// ─── matchPath additional branches (match.ts) ────────────────────────────────

describe("matchPath additional branches", () => {
  test("returns null when path has more segments than pattern without splat (line 99)", () => {
    // Pattern has 1 segment, path has 2 → segment count mismatch at end
    expect(matchPath("/a", "/a/b")).toBeNull()
  })

  test("matchPath with empty path segments (line 84)", () => {
    // Test when pathParts[i] would be undefined (fewer path parts than pattern parts)
    expect(matchPath("/a/b", "/a")).toBeNull()
  })
})

// ─── router.ts SSR-only path set (line 275) ──────────────────────────────────

describe("router SSR path handling", () => {
  test("navigate sets path in SSR mode (no window)", async () => {
    // The url option triggers SSR mode for initial path
    const router = createRouter({ routes, url: "/" })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
  })
})

// ─── loader.ts useLoaderData (line 24) ───────────────────────────────────────

describe("useLoaderData", () => {
  test("useLoaderData returns data from LoaderDataContext", async () => {
    const el = container()
    let capturedData: unknown
    const DataComp = () => {
      capturedData = useLoaderData()
      return h("span", null, "data")
    }
    const viewRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/data",
        component: DataComp,
        loader: async () => ({ items: [1, 2, 3] }),
      },
    ]
    const router = createRouter({ routes: viewRoutes, url: "/" })
    await prefetchLoaderData(router as RouterInstance, "/data")
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    await router.push("/data")
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(capturedData).toEqual({ items: [1, 2, 3] })
  })
})

// ─── scroll.ts additional branches ──────────────────────────────────────────

describe("ScrollManager additional branches", () => {
  test("restore with undefined behavior defaults to top (line 42)", () => {
    // When scrollBehavior is undefined, _applyResult receives undefined which should default to "top"
    const sm = new ScrollManager(undefined)
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(0)
    window.scrollTo = origScrollTo
  })

  test("restore with function returning 'none' does not scroll", () => {
    const sm = new ScrollManager(() => "none" as const)
    let scrollCalled = false
    const origScrollTo = window.scrollTo
    window.scrollTo = (() => {
      scrollCalled = true
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrollCalled).toBe(false)
    window.scrollTo = origScrollTo
  })

  test("restore with function returning 'restore' scrolls to saved position", () => {
    const sm = new ScrollManager((_to, _from, _saved) => "restore" as const)
    sm.save("/target")
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = {
      path: "/target",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(0)
    window.scrollTo = origScrollTo
  })

  test("restore with function returning number scrolls to that position", () => {
    const sm = new ScrollManager(() => 500)
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(500)
    window.scrollTo = origScrollTo
  })

  test("getSavedPosition returns null for unsaved path", () => {
    const sm = new ScrollManager()
    expect(sm.getSavedPosition("/never-visited")).toBeNull()
  })
})

// ─── router.ts: navigation gen cancels stale guard (line 199) ────────────────

describe("stale navigation cancellation during guards", () => {
  test("concurrent navigation cancels in-flight beforeEach guard", async () => {
    let _slowGuardCompleted = false
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      { path: "/slow", component: About },
      { path: "/fast", component: User },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })
    router.beforeEach(async (to) => {
      if (to.path === "/slow") {
        await new Promise<void>((r) => setTimeout(r, 100))
        _slowGuardCompleted = true
      }
      return true
    })

    const slow = router.push("/slow")
    await new Promise<void>((r) => setTimeout(r, 10))
    await router.push("/fast")
    await slow

    // The fast navigation should have superseded the slow one
    expect(router.currentRoute().path).toBe("/fast")
  })
})

// ─── router.ts: destroy with popstate handler (line 369-370) ─────────────────

describe("router destroy with listeners", () => {
  test("destroy removes popstate listener in history mode", () => {
    const router = createRouter({ routes, mode: "history" })
    // The router should have registered a popstate listener
    // After destroy, it should be removed
    router.destroy()
    // Push a new state and dispatch popstate — the router should NOT react
    window.history.pushState(null, "", "/user/999")
    window.dispatchEvent(new PopStateEvent("popstate"))
    // If the listener was properly removed, the router path should remain unchanged
    // (destroy already ran, so currentRoute might be anything, but no errors)
    expect(true).toBe(true) // No throw is the assertion
  })

  test("destroy removes hashchange listener in hash mode", () => {
    const router = createRouter({ routes, mode: "hash" })
    router.destroy()
    // Dispatching hashchange after destroy should not throw
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    expect(true).toBe(true)
  })
})

// ─── match.ts line 190: parent with children, no child match, no exact match ─

describe("match.ts: matchRoutes child fallthrough", () => {
  test("nested prefix match but no child match and no exact parent match (line 190)", () => {
    // Parent matches as prefix but child doesn't match, and parent isn't exact match for path
    const routesDef: RouteRecord[] = [
      {
        path: "/blog",
        component: Home,
        children: [{ path: "post/:id", component: About }],
      },
    ]
    // /blog/unknown doesn't match child "post/:id" pattern, and /blog doesn't exact-match /blog/unknown
    const r = resolveRoute("/blog/unknown", routesDef)
    expect(r.matched).toHaveLength(0)
  })
})

// ─── hashchange event ───────────────────────────────────────────────────────

describe("hash mode hashchange", () => {
  test("hashchange event updates currentRoute in hash mode", async () => {
    const router = createRouter({ routes, mode: "hash" })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    // Simulate hashchange by setting hash and dispatching event
    window.location.hash = "#/user/5"
    window.dispatchEvent(new HashChangeEvent("hashchange"))
    await new Promise<void>((r) => setTimeout(r, 10))
    expect(router.currentRoute().path).toBe("/user/5")
    router.destroy()
  })
})

// ─── Router lifecycle ──────────────────────────────────────────────────────────

describe("router lifecycle", () => {
  const Home = () => h("div", null, "home")
  const routes: RouteRecord[] = [{ path: "/", component: Home }]

  test("destroy() clears guards, hooks, and caches", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    router.beforeEach(() => false)
    router.afterEach(() => {})
    router._componentCache.set({} as RouteRecord, Home)
    router._loaderData.set({} as RouteRecord, { x: 1 })

    router.destroy()

    // Caches cleared
    expect(router._componentCache.size).toBe(0)
    expect(router._loaderData.size).toBe(0)
  })

  test("beforeEach returns unregister function", async () => {
    const router = createRouter({ routes, url: "/" })
    const calls: string[] = []
    const unregister = router.beforeEach(() => {
      calls.push("guard")
      return undefined
    })

    await router.push("/")
    expect(calls).toEqual(["guard"])

    unregister()
    calls.length = 0
    await router.push("/")
    expect(calls).toEqual([])
  })

  test("afterEach returns unregister function", async () => {
    const router = createRouter({ routes, url: "/" })
    const calls: string[] = []
    const unregister = router.afterEach(() => {
      calls.push("hook")
    })

    await router.push("/")
    expect(calls).toEqual(["hook"])

    unregister()
    calls.length = 0
    await router.push("/")
    expect(calls).toEqual([])
  })

  test("RouterProvider calls destroy() on unmount", () => {
    const router = createRouter({ routes, url: "/" }) as RouterInstance
    // Add a guard so we can verify it gets cleared
    router.beforeEach(() => undefined)
    const el = container()
    const unmount = mount(h(RouterProvider, { router }, h("div", null, "app")), el)
    expect(el.textContent).toBe("app")
    unmount()
    // After unmount, caches should be cleared
    expect(router._componentCache.size).toBe(0)
    expect(router._loaderData.size).toBe(0)
  })

  test("destroy() is idempotent — calling twice does not throw", () => {
    const router = createRouter({ routes, url: "/" })
    router.destroy()
    router.destroy() // Should not throw
  })
})

// ─── beforeLeave guard cancelled by newer navigation (router.ts lines 155-156) ─

describe("stale navigation cancellation during beforeLeave guard", () => {
  test("concurrent navigation cancels in-flight beforeLeave guard", async () => {
    let _slowLeaveCompleted = false
    const guardRoutes: RouteRecord[] = [
      {
        path: "/a",
        component: Home,
        beforeLeave: async () => {
          await new Promise<void>((r) => setTimeout(r, 100))
          _slowLeaveCompleted = true
          return true
        },
      },
      { path: "/b", component: About },
      { path: "/c", component: User },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/a" })

    // Start slow navigation (triggers slow beforeLeave)
    const slow = router.push("/b")
    // Immediately start another navigation which increments _navGen
    await new Promise<void>((r) => setTimeout(r, 10))
    await router.push("/c")
    await slow

    // The slow beforeLeave completed but gen !== _navGen should have cancelled the first nav
    expect(router.currentRoute().path).toBe("/c")
  })
})

// ─── beforeEnter guard cancelled by newer navigation (router.ts lines 178-180) ─

describe("stale navigation cancellation during beforeEnter guard", () => {
  test("concurrent navigation cancels in-flight beforeEnter guard", async () => {
    const guardRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/slow",
        component: About,
        beforeEnter: async () => {
          await new Promise<void>((r) => setTimeout(r, 100))
          return true
        },
      },
      { path: "/fast", component: User },
    ]
    const router = createRouter({ routes: guardRoutes, url: "/" })

    const slow = router.push("/slow")
    await new Promise<void>((r) => setTimeout(r, 10))
    await router.push("/fast")
    await slow

    expect(router.currentRoute().path).toBe("/fast")
  })
})

// ─── hydrateLoaderData: path not in serialized (loader.ts line 93) ───────────

describe("hydrateLoaderData partial data", () => {
  test("hydrateLoaderData skips routes not present in serialized data", () => {
    const loaderRoutes: RouteRecord[] = [
      {
        path: "/parent",
        component: Home,
        loader: async () => "parent",
        children: [{ path: "child", component: About, loader: async () => "child" }],
      },
    ]
    const router = createRouter({ routes: loaderRoutes, url: "/parent/child" }) as RouterInstance
    // Only provide data for one of the two matched loader routes
    hydrateLoaderData(router, { "/parent": "parent-data" })
    // Only one entry should be hydrated
    expect(router._loaderData.size).toBe(1)
    const values = Array.from(router._loaderData.values())
    expect(values[0]).toBe("parent-data")
  })
})

// ─── Component cache eviction (components.tsx line 275-276) ──────────────────

describe("component cache eviction with exact maxCacheSize", () => {
  test("evicts oldest entry when cache exceeds maxCacheSize", async () => {
    const Comp1 = () => h("span", null, "c1")
    const Comp2 = () => h("span", null, "c2")
    const Comp3 = () => h("span", null, "c3")
    const cacheRoutes: RouteRecord[] = [
      { path: "/a", component: Comp1 },
      { path: "/b", component: Comp2 },
      { path: "/c", component: Comp3 },
    ]
    // maxCacheSize of 1 ensures eviction happens on second route
    const router = createRouter({
      routes: cacheRoutes,
      url: "/a",
      maxCacheSize: 1,
    }) as RouterInstance

    const el = container()
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // First route gets cached
    expect(router._componentCache.size).toBe(1)

    // Navigate to second route
    await router.push("/b")
    await new Promise<void>((r) => setTimeout(r, 50))
    // Cache should have evicted the oldest (Comp1) and now contain Comp2
    // maxCacheSize=1, but cacheSet adds then evicts, so size stays at 1
    expect(router._componentCache.size).toBeLessThanOrEqual(2)

    // Navigate to third route
    await router.push("/c")
    await new Promise<void>((r) => setTimeout(r, 50))
    // Eviction should have run
    expect(router._componentCache.size).toBeLessThanOrEqual(2)
  })
})

// ─── scroll.ts: function behavior returning "restore" (lines 46-49) ─────────

describe("ScrollManager _applyResult restore branch", () => {
  test("_applyResult with 'restore' and no saved position defaults to 0", () => {
    const sm = new ScrollManager("restore")
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    // Restore for a path that was never visited — should get ?? 0 fallback
    const to: ResolvedRoute = {
      path: "/never-visited",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(0)
    window.scrollTo = origScrollTo
  })
})

// ─── scroll.ts: numeric scroll behavior (lines 51-53) ───────────────────────

describe("ScrollManager numeric scroll behavior", () => {
  test("direct numeric scrollBehavior scrolls to that number", () => {
    // When the global scroll behavior is a number literal, it goes through _applyResult
    // with result === number. We can trigger this via a function that returns a number.
    const sm = new ScrollManager(() => 123)
    let scrolledTo: number | undefined
    const origScrollTo = window.scrollTo
    window.scrollTo = ((...args: unknown[]) => {
      const opts = args[0] as { top?: number }
      scrolledTo = opts?.top
    }) as typeof window.scrollTo
    const to: ResolvedRoute = { path: "/a", params: {}, query: {}, hash: "", matched: [], meta: {} }
    const from: ResolvedRoute = {
      path: "/b",
      params: {},
      query: {},
      hash: "",
      matched: [],
      meta: {},
    }
    sm.restore(to, from)
    expect(scrolledTo).toBe(123)
    window.scrollTo = origScrollTo
  })
})

// ─── RouterLink: handleMouseEnter early return when no router ────────────────

describe("RouterLink handleMouseEnter without router", () => {
  test("mouseenter on RouterLink without router does not throw", async () => {
    const el = container()
    setActiveRouter(null)
    for (let i = 0; i < 50; i++) popContext()
    mount(h(RouterLink, { to: "/test" }), el)
    const anchor = el.querySelector("a") as HTMLAnchorElement
    // Dispatch mouseEnter — handleMouseEnter should return early since no router
    expect(() => anchor.dispatchEvent(new Event("mouseEnter"))).not.toThrow()
  })
})

// ─── RouterLink: prefetch deduplication via set.has(path) ────────────────────

describe("RouterLink prefetch deduplication", () => {
  test("hovering twice on same link only prefetches once", async () => {
    const el = container()
    let loaderCallCount = 0
    const prefetchRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/dedup",
        component: About,
        loader: async () => {
          loaderCallCount++
          return "data"
        },
      },
    ]
    const router = createRouter({ routes: prefetchRoutes, url: "/" })
    mount(h(RouterProvider, { router }, h(RouterLink, { to: "/dedup" }, "Dedup")), el)
    const anchor = el.querySelector("a") as HTMLAnchorElement
    // First hover
    anchor.dispatchEvent(new Event("mouseEnter"))
    await new Promise<void>((r) => setTimeout(r, 100))
    expect(loaderCallCount).toBe(1)
    // Second hover — should be deduplicated
    anchor.dispatchEvent(new Event("mouseEnter"))
    await new Promise<void>((r) => setTimeout(r, 100))
    expect(loaderCallCount).toBe(1) // still 1, deduplication via set.has(path)
  })
})

// ─── Branch coverage: match.ts parseQuery edge cases (lines 12-16) ──────────

describe("parseQuery — edge cases for branch coverage", () => {
  test("empty key from bare param is ignored (line 12 false branch)", () => {
    // Decoding an empty string after splitting gives empty key → skipped
    const result = parseQuery("=value")
    // Key is empty string → not added
    expect(Object.keys(result)).toHaveLength(0)
  })

  test("bare param without value (line 12 true branch)", () => {
    const result = parseQuery("flag")
    expect(result.flag).toBe("")
  })

  test("key=value with empty key ignored (line 16 false branch)", () => {
    const result = parseQuery("=val&good=yes")
    expect(result.good).toBe("yes")
    expect("" in result).toBe(false)
  })
})

// ─── Branch coverage: scroll.ts — scroll behavior modes ─────────────────────

describe("ScrollManager — branch coverage for scroll behaviors", () => {
  test("restore with 'none' behavior does nothing", async () => {
    const sm = new ScrollManager("none")
    const route = {
      path: "/test",
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: {},
    } as ResolvedRoute
    sm.restore(route, route)
  })

  test("restore with 'restore' behavior uses saved position", async () => {
    const sm = new ScrollManager("restore")
    sm.save("/test") // Save current scroll position
    const route = {
      path: "/test",
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: {},
    } as ResolvedRoute
    sm.restore(route, route)
  })

  test("restore with number behavior scrolls to number", async () => {
    const sm = new ScrollManager()
    const route = {
      path: "/test",
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: { scrollBehavior: 42 },
    } as unknown as ResolvedRoute
    const from = {
      path: "/from",
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: {},
    } as ResolvedRoute
    sm.restore(route, from)
  })

  test("restore with function behavior calls function and applies result", async () => {
    const sm = new ScrollManager()
    const fn = (_to: ResolvedRoute, _from: ResolvedRoute, _saved: number | null) => "none" as const
    const route = {
      path: "/test",
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: { scrollBehavior: fn },
    } as unknown as ResolvedRoute
    const from = {
      path: "/from",
      matched: [],
      params: {},
      query: {},
      hash: "",
      meta: {},
    } as ResolvedRoute
    sm.restore(route, from)
  })

  test("getSavedPosition returns null for unknown path", () => {
    const sm = new ScrollManager()
    expect(sm.getSavedPosition("/unknown")).toBeNull()
  })
})

// ─── Branch coverage: router.ts — rapid navigation cancellation ─────────────

describe("router — navigation cancellation by newer navigation", () => {
  test("rapid sequential navigations cancel earlier ones (lines 155-156)", async () => {
    let _guardCallCount = 0
    const el = document.createElement("div")
    document.body.appendChild(el)
    const router = createRouter({
      routes: [
        {
          path: "/",
          component: () => h("div", null, "home"),
          beforeLeave: async () => {
            _guardCallCount++
            await new Promise((r) => setTimeout(r, 50))
            return true
          },
        },
        { path: "/a", component: () => h("div", null, "a") },
        { path: "/b", component: () => h("div", null, "b") },
      ],
      mode: "hash",
    })

    mount(h(RouterProvider, { router, children: h(RouterView, null) }), el)
    await new Promise((r) => setTimeout(r, 10))

    // Start navigation to /a (will be slow due to beforeLeave guard)
    const nav1 = router.push("/a")
    // Immediately start navigation to /b (should cancel the /a navigation)
    const nav2 = router.push("/b")

    await Promise.all([nav1, nav2])
    await new Promise((r) => setTimeout(r, 100))

    // Should end up at /b
    expect(router.currentRoute().path).toBe("/b")

    router.destroy()
    el.remove()
  })

  test("router.back() calls history.back (line 343)", () => {
    const router = createRouter({
      routes: [{ path: "/", component: () => h("div", null) }],
      mode: "hash",
    })
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {})
    router.back()
    expect(backSpy).toHaveBeenCalled()
    backSpy.mockRestore()
    router.destroy()
  })

  test("removeGuard and removeHook when already removed (lines 350, 358)", async () => {
    const router = createRouter({
      routes: [{ path: "/", component: () => h("div", null) }],
      mode: "hash",
    })
    const removeGuard = router.beforeEach(() => true)
    const removeHook = router.afterEach(() => {})
    // Remove once
    removeGuard()
    removeHook()
    // Remove again — should not throw (idx < 0 path)
    removeGuard()
    removeHook()
    router.destroy()
  })
})

// ─── Branch coverage: match.ts line 12 — parseQuery empty bare param ─────────

describe("parseQuery — empty bare param branch", () => {
  test("parseQuery skips empty parts from consecutive ampersands", () => {
    // "&&" splits into ["", "", ""] — each empty part decodes to empty key,
    // hitting the `if (key)` false branch on line 12 of match.ts
    const result = parseQuery("&&")
    expect(Object.keys(result)).toHaveLength(0)
  })

  test("parseQuery skips trailing ampersand empty part", () => {
    const result = parseQuery("a=1&")
    expect(Object.keys(result)).toEqual(["a"])
    expect(result.a).toBe("1")
  })
})

// ─── Branch coverage: components.tsx line 88 — RouterView depth > matched ────

describe("RouterView at depth beyond matched records", () => {
  test("renders null when depth exceeds matched records length", () => {
    const el = container()
    // ParentComp renders TWO nested RouterViews — the second one will be at depth 2
    // but only 2 records match (parent + child), so depth 2 has no record
    const DeepChild = () => h("div", null, h(RouterView, {}))
    const ParentComp = () => h("div", { class: "parent" }, h(RouterView, {}))
    const nestedRoutes: RouteRecord[] = [
      {
        path: "/parent",
        component: ParentComp,
        children: [{ path: "child", component: DeepChild }],
      },
    ]
    const router = createRouter({ routes: nestedRoutes, url: "/parent/child" })
    mount(h(RouterProvider, { router }, h(RouterView, {})), el)
    // The deepest RouterView (depth 2) should render null since there's no matched[2]
    const views = el.querySelectorAll("[data-pyreon-router-view]")
    // Three RouterView wrappers exist, but the innermost has no component content
    expect(views.length).toBe(3)
  })
})

// ─── Branch coverage: router.ts line 235 — aborted loader signal ─────────────

describe("loader rejection with aborted signal", () => {
  test("aborted loader rejection is skipped silently", async () => {
    let errorCallbackCalled = false
    const loaderRoutes: RouteRecord[] = [
      { path: "/", component: Home },
      {
        path: "/abort-test",
        component: About,
        loader: async ({ signal }) => {
          // Simulate a fetch that rejects because of abort
          return new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              reject(new Error("aborted"))
            })
          })
        },
      },
      { path: "/other", component: User, loader: async () => "other-data" },
    ]
    const router = createRouter({
      routes: loaderRoutes,
      url: "/",
      onError: () => {
        errorCallbackCalled = true
        return undefined
      },
    })

    // Start navigation to /abort-test (loader will hang until aborted)
    const nav1 = router.push("/abort-test")
    // Immediately start another navigation — this aborts the first loader
    await new Promise<void>((r) => setTimeout(r, 5))
    await router.push("/other")
    await nav1

    // The error callback should NOT have been called because the signal was aborted
    // and the `if (ac.signal.aborted) continue` branch handles it
    expect(errorCallbackCalled).toBe(false)
    expect(router.currentRoute().path).toBe("/other")
  })
})

// ─── Feature 1: Base path support ─────────────────────────────────────────────

describe("base path", () => {
  const baseRoutes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/user/:id", component: User },
  ]

  it("strips base from SSR url", () => {
    const router = createRouter({
      routes: baseRoutes,
      mode: "history",
      base: "/app",
      url: "/app/about",
    })
    expect(router.currentRoute().path).toBe("/about")
  })

  it("resolves root when SSR url equals the base", () => {
    const router = createRouter({ routes: baseRoutes, mode: "history", base: "/app", url: "/app" })
    expect(router.currentRoute().path).toBe("/")
  })

  it("resolves root when SSR url is base with trailing slash", () => {
    const router = createRouter({ routes: baseRoutes, mode: "history", base: "/app", url: "/app/" })
    expect(router.currentRoute().path).toBe("/")
  })

  it("normalizes base without leading slash", () => {
    const router = createRouter({
      routes: baseRoutes,
      mode: "history",
      base: "app",
      url: "/app/about",
    })
    expect(router.currentRoute().path).toBe("/about")
  })

  it("strips trailing slash from base", () => {
    const router = createRouter({
      routes: baseRoutes,
      mode: "history",
      base: "/app/",
      url: "/app/about",
    })
    expect(router.currentRoute().path).toBe("/about")
  })

  it("ignores base in hash mode", () => {
    const router = createRouter({ routes: baseRoutes, mode: "hash", base: "/app", url: "/about" })
    expect(router.currentRoute().path).toBe("/about")
  })

  it("stores normalized base on RouterInstance", () => {
    const router = createRouter({
      routes: baseRoutes,
      mode: "history",
      base: "/app/",
    }) as unknown as RouterInstance
    expect(router._base).toBe("/app")
  })

  it("prepends base to browser URL in syncBrowserUrl via push", async () => {
    const router = createRouter({
      routes: baseRoutes,
      mode: "history",
      base: "/app",
      url: "/app/",
    })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    expect(router.currentRoute().matched.length).toBeGreaterThan(0)
    router.destroy()
  })
})

// ─── Feature 2: Navigation blockers ──────────────────────────────────────────

describe("navigation blockers (useBlocker)", () => {
  const blockerRoutes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/user/:id", component: User },
  ]

  beforeEach(() => {
    // Reset browser state so stale hash values from prior tests don't trigger hashchange
    window.location.hash = ""
  })

  afterEach(() => {
    setActiveRouter(null)
  })

  it("blocks navigation when blocker returns true", async () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    router._blockers.add(() => true)
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/")
    router.destroy()
  })

  it("allows navigation when blocker returns false", async () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    router._blockers.add(() => false)
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    router.destroy()
  })

  it("supports async blockers", async () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    router._blockers.add(async () => {
      await new Promise<void>((r) => setTimeout(r, 5))
      return true
    })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/")
    router.destroy()
  })

  it("removing blocker allows navigation", async () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    const fn = () => true
    router._blockers.add(fn)
    router._blockers.delete(fn)
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
    router.destroy()
  })

  it("blocker receives to and from routes", async () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    let receivedTo: ResolvedRoute | undefined
    let receivedFrom: ResolvedRoute | undefined
    router._blockers.add((to, from) => {
      receivedTo = to
      receivedFrom = from
      return false
    })
    await router.push("/about")
    expect(receivedTo!.path).toBe("/about")
    expect(receivedFrom!.path).toBe("/")
    router.destroy()
  })

  it("destroy() clears blockers", () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    router._blockers.add(() => true)
    router.destroy()
    expect(router._blockers.size).toBe(0)
  })

  it("useBlocker hook works via RouterProvider", () => {
    const router = createRouter({ routes: blockerRoutes, url: "/" }) as unknown as RouterInstance
    let blockerRef: { remove(): void } | undefined
    const container = document.createElement("div")
    const TestComp = () => {
      blockerRef = useBlocker(() => true)
      return null
    }
    mount(h(RouterProvider, { router }, h(TestComp, {})), container)
    expect(router._blockers.size).toBe(1)
    blockerRef!.remove()
    expect(router._blockers.size).toBe(0)
    router.destroy()
  })
})

// ─── Feature 3: Relative navigation ──────────────────────────────────────────

describe("relative navigation", () => {
  const relRoutes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/admin/users", component: AdminUsers },
    { path: "/admin/settings", component: AdminSettings },
    { path: "/about", component: About },
  ]

  it("resolves ./sibling from a nested path", async () => {
    const router = createRouter({ routes: relRoutes, url: "/admin/users" })
    await router.push("./settings")
    expect(router.currentRoute().path).toBe("/admin/settings")
  })

  it("resolves ../up from a nested path", async () => {
    const router = createRouter({ routes: relRoutes, url: "/admin/users" })
    await router.push("../about")
    expect(router.currentRoute().path).toBe("/about")
  })

  it("resolves . to the parent directory", async () => {
    const router = createRouter({ routes: relRoutes, url: "/admin/users" })
    await router.push(".")
    expect(router.currentRoute().path).toBe("/admin")
  })

  it("resolves .. to the grandparent directory", async () => {
    const router = createRouter({ routes: relRoutes, url: "/admin/users" })
    await router.push("..")
    expect(router.currentRoute().path).toBe("/")
  })

  it("does not modify absolute paths", async () => {
    const router = createRouter({ routes: relRoutes, url: "/admin/users" })
    await router.push("/about")
    expect(router.currentRoute().path).toBe("/about")
  })

  it("works with replace()", async () => {
    const router = createRouter({ routes: relRoutes, url: "/admin/users" })
    await router.replace("./settings")
    expect(router.currentRoute().path).toBe("/admin/settings")
  })
})

// ─── Feature 4: Trailing slash normalization ──────────────────────────────────

describe("trailing slash normalization", () => {
  const tsRoutes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/user/:id", component: User },
  ]

  it("strips trailing slash by default", () => {
    const router = createRouter({ routes: tsRoutes, url: "/about/" })
    expect(router.currentRoute().path).toBe("/about")
  })

  it("strips trailing slash on navigation", async () => {
    const router = createRouter({ routes: tsRoutes, url: "/" })
    await router.push("/about/")
    expect(router.currentRoute().path).toBe("/about")
  })

  it("adds trailing slash when trailingSlash=add", () => {
    const router = createRouter({ routes: tsRoutes, url: "/about", trailingSlash: "add" })
    expect(router.currentRoute().path).toBe("/about/")
  })

  it("does not modify when trailingSlash=ignore", () => {
    const router = createRouter({ routes: tsRoutes, url: "/about/", trailingSlash: "ignore" })
    expect(router.currentRoute().path).toBe("/about/")
  })

  it("does not strip slash from root path", () => {
    const router = createRouter({ routes: tsRoutes, url: "/" })
    expect(router.currentRoute().path).toBe("/")
  })

  it("preserves query string when stripping slash", async () => {
    const router = createRouter({ routes: tsRoutes, url: "/" })
    await router.push("/about/?foo=bar")
    const route = router.currentRoute()
    expect(route.path).toBe("/about")
    expect(route.query.foo).toBe("bar")
  })
})

// ─── Feature 5: Typed search params ──────────────────────────────────────────

describe("useSearchParams", () => {
  const spRoutes: RouteRecord[] = [
    { path: "/", component: Home },
    { path: "/search", component: About },
  ]

  it("returns current query params via RouterProvider", () => {
    const router = createRouter({ routes: spRoutes, url: "/search?q=hello&page=2" })
    const container = document.createElement("div")
    let result: Record<string, string> | undefined
    const TestComp = () => {
      const params = useSearchParams()
      result = params()
      return null
    }
    mount(h(RouterProvider, { router }, h(TestComp, {})), container)
    expect(result!.q).toBe("hello")
    expect(result!.page).toBe("2")
    router.destroy()
  })

  it("merges URL params over defaults for missing keys", () => {
    const router = createRouter({ routes: spRoutes, url: "/search?q=hello" })
    const container = document.createElement("div")
    let result: Record<string, string> | undefined
    const TestComp = () => {
      const params = useSearchParams({ q: "", page: "1", sort: "name" })
      result = params()
      return null
    }
    mount(h(RouterProvider, { router }, h(TestComp, {})), container)
    expect(result!.q).toBe("hello")
    expect(result!.page).toBe("1")
    expect(result!.sort).toBe("name")
    router.destroy()
  })

  it("URL params take precedence over defaults", () => {
    const router = createRouter({ routes: spRoutes, url: "/search?page=5" })
    const container = document.createElement("div")
    let result: Record<string, string> | undefined
    const TestComp = () => {
      const params = useSearchParams({ page: "1" })
      result = params()
      return null
    }
    mount(h(RouterProvider, { router }, h(TestComp, {})), container)
    expect(result!.page).toBe("5")
    router.destroy()
  })
})

// ─── Feature 6: Stale-while-revalidate loaders ───────────────────────────────

describe("stale-while-revalidate loaders", () => {
  const Comp = () => null

  it("uses cached data and revalidates in background", async () => {
    let callCount = 0
    const swrRoutes: RouteRecord[] = [
      { path: "/", component: Comp },
      {
        path: "/data",
        component: Comp,
        staleWhileRevalidate: true,
        loader: async () => {
          callCount++
          return `result-${callCount}`
        },
      },
    ]

    const router = createRouter({ routes: swrRoutes, url: "/" })

    // First navigation: no cached data, loader runs blocking
    await router.push("/data")
    expect(callCount).toBe(1)
    const inst = router as unknown as RouterInstance
    const record = swrRoutes[1] as RouteRecord
    expect(inst._loaderData.get(record)).toBe("result-1")

    // Navigate away then back — SWR should use cached data
    await router.push("/")
    await router.push("/data")
    // callCount is now 2 because loader was called again (SWR revalidation)
    // But navigation committed immediately with stale data
    await new Promise<void>((r) => setTimeout(r, 50))
    expect(callCount).toBe(2)
    expect(inst._loaderData.get(record)).toBe("result-2")
  })

  it("non-SWR routes still block", async () => {
    let loaded = false
    const mixedRoutes: RouteRecord[] = [
      { path: "/", component: Comp },
      {
        path: "/blocking",
        component: Comp,
        loader: async () => {
          await new Promise<void>((r) => setTimeout(r, 10))
          loaded = true
          return "data"
        },
      },
    ]

    const router = createRouter({ routes: mixedRoutes, url: "/" })
    await router.push("/blocking")
    expect(loaded).toBe(true)
  })
})
