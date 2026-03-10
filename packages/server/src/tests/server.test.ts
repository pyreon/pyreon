import { describe, expect, test } from "bun:test"
import { h } from "@pyreon/core"
import type { ComponentFn, VNode } from "@pyreon/core"
import { createHandler } from "../handler"
import { DEFAULT_TEMPLATE, buildScripts, processTemplate } from "../html"
import { island } from "../island"
import type { Middleware } from "../middleware"
import { prerender } from "../ssg"

// ─── HTML template ───────────────────────────────────────────────────────────

describe("HTML template", () => {
  test("processTemplate replaces all placeholders", () => {
    const result = processTemplate(DEFAULT_TEMPLATE, {
      head: "<title>Test</title>",
      app: "<div>Hello</div>",
      scripts: '<script type="module" src="/app.js"></script>',
    })
    expect(result).toContain("<title>Test</title>")
    expect(result).toContain("<div>Hello</div>")
    expect(result).toContain('src="/app.js"')
    expect(result).not.toContain("<!--pyreon-head-->")
    expect(result).not.toContain("<!--pyreon-app-->")
    expect(result).not.toContain("<!--pyreon-scripts-->")
  })

  test("buildScripts emits loader data + client entry", () => {
    const scripts = buildScripts("/entry.js", { users: [{ id: 1 }] })
    expect(scripts).toContain("window.__PYREON_LOADER_DATA__=")
    expect(scripts).toContain('"users"')
    expect(scripts).toContain('src="/entry.js"')
  })

  test("buildScripts escapes </script> in JSON", () => {
    const scripts = buildScripts("/entry.js", { html: "</script><script>alert(1)" })
    expect(scripts).not.toContain("</script><script>")
    expect(scripts).toContain("<\\/script>")
  })

  test("buildScripts omits inline data when no loaders", () => {
    const scripts = buildScripts("/entry.js", {})
    expect(scripts).not.toContain("__PYREON_LOADER_DATA__")
    expect(scripts).toContain('src="/entry.js"')
  })
})

// ─── SSR Handler ─────────────────────────────────────────────────────────────

describe("createHandler", () => {
  const Home: ComponentFn = () => h("h1", null, "Home")
  const About: ComponentFn = () => h("h1", null, "About")
  const routes = [
    { path: "/", component: Home },
    { path: "/about", component: About },
  ]

  test("renders home page", async () => {
    const handler = createHandler({ App: Home, routes })
    const res = await handler(new Request("http://localhost/"))
    const html = await res.text()
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toContain("text/html")
    expect(html).toContain("<h1>Home</h1>")
    expect(html).toContain("<!DOCTYPE html>")
  })

  test("renders about page with correct route", async () => {
    const App: ComponentFn = () => h("main", null, "app")
    const handler = createHandler({ App, routes })
    const res = await handler(new Request("http://localhost/about"))
    expect(res.status).toBe(200)
  })

  test("uses custom template", async () => {
    const template =
      "<html><!--pyreon-head--><body><!--pyreon-app--><!--pyreon-scripts--></body></html>"
    const handler = createHandler({ App: Home, routes, template })
    const res = await handler(new Request("http://localhost/"))
    const html = await res.text()
    expect(html).toContain("<html>")
    expect(html).toContain("<h1>Home</h1>")
    expect(html).not.toContain("<!--pyreon-app-->")
  })

  test("includes client entry script", async () => {
    const handler = createHandler({ App: Home, routes, clientEntry: "/dist/client.js" })
    const res = await handler(new Request("http://localhost/"))
    const html = await res.text()
    expect(html).toContain('src="/dist/client.js"')
  })

  test("serializes loader data into HTML", async () => {
    const WithLoader: ComponentFn = () => h("div", null, "loaded")
    const loaderRoutes = [
      {
        path: "/",
        component: WithLoader,
        loader: async () => ({ items: [1, 2, 3] }),
      },
    ]
    const handler = createHandler({ App: WithLoader, routes: loaderRoutes })
    const res = await handler(new Request("http://localhost/"))
    const html = await res.text()
    expect(html).toContain("__PYREON_LOADER_DATA__")
    expect(html).toContain('"items"')
  })

  test("returns 500 on render error", async () => {
    const BrokenApp: ComponentFn = () => {
      throw new Error("boom")
    }
    const handler = createHandler({ App: BrokenApp, routes })
    const res = await handler(new Request("http://localhost/"))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe("Internal Server Error")
  })
})

// ─── Middleware ───────────────────────────────────────────────────────────────

describe("middleware", () => {
  const App: ComponentFn = () => h("div", null, "app")
  const routes = [{ path: "/", component: App }]

  test("middleware can short-circuit with a Response", async () => {
    const authMiddleware: Middleware = (ctx) => {
      if (!ctx.req.headers.get("Authorization")) {
        return new Response("Unauthorized", { status: 401 })
      }
    }
    const handler = createHandler({ App, routes, middleware: [authMiddleware] })

    const noAuth = await handler(new Request("http://localhost/"))
    expect(noAuth.status).toBe(401)

    const withAuth = await handler(
      new Request("http://localhost/", { headers: { Authorization: "Bearer token" } }),
    )
    expect(withAuth.status).toBe(200)
  })

  test("middleware can set custom headers", async () => {
    const cacheMiddleware: Middleware = (ctx) => {
      ctx.headers.set("Cache-Control", "max-age=3600")
    }
    const handler = createHandler({ App, routes, middleware: [cacheMiddleware] })
    const res = await handler(new Request("http://localhost/"))
    expect(res.headers.get("Cache-Control")).toBe("max-age=3600")
  })

  test("middleware chain runs in order", async () => {
    const order: number[] = []
    const mw1: Middleware = () => {
      order.push(1)
    }
    const mw2: Middleware = () => {
      order.push(2)
    }
    const mw3: Middleware = () => {
      order.push(3)
    }
    const handler = createHandler({ App, routes, middleware: [mw1, mw2, mw3] })
    await handler(new Request("http://localhost/"))
    expect(order).toEqual([1, 2, 3])
  })
})

// ─── Islands ─────────────────────────────────────────────────────────────────

describe("island", () => {
  test("island() returns a function with island metadata", () => {
    const Counter = island(() => Promise.resolve({ default: () => h("div", null, "0") }), {
      name: "Counter",
    })
    expect(typeof Counter).toBe("function")
    expect((Counter as unknown as { __island: boolean }).__island).toBe(true)
    expect(Counter.name).toBe("Counter")
  })

  test("island() renders with <pyreon-island> wrapper during SSR", async () => {
    const Inner: ComponentFn = (props) =>
      h("button", null, `Count: ${(props as Record<string, unknown>).initial}`)
    const Counter = island<{ initial: number }>(() => Promise.resolve({ default: Inner }), {
      name: "Counter",
      hydrate: "idle",
    })

    // Simulate SSR by calling the async component
    const vnode = await (Counter as unknown as (props: { initial: number }) => Promise<VNode>)({
      initial: 5,
    })
    expect(vnode).not.toBeNull()
    // The wrapper should be a pyreon-island element
    expect(vnode.type).toBe("pyreon-island")
    expect(vnode.props["data-component"]).toBe("Counter")
    expect(vnode.props["data-hydrate"]).toBe("idle")
    const parsedProps = JSON.parse(vnode.props["data-props"] as string)
    expect(parsedProps.initial).toBe(5)
  })

  test("island() strips non-serializable props", async () => {
    const Inner: ComponentFn = () => h("div", null)
    const Widget = island(() => Promise.resolve({ default: Inner }), { name: "Widget" })

    const vnode = await (Widget as unknown as (props: Record<string, unknown>) => Promise<VNode>)({
      label: "hello",
      onClick: () => {},
      sym: Symbol("test"),
      nested: { a: 1 },
    })
    const parsedProps = JSON.parse(vnode.props["data-props"] as string)
    expect(parsedProps.label).toBe("hello")
    expect(parsedProps.onClick).toBeUndefined()
    expect(parsedProps.sym).toBeUndefined()
    expect(parsedProps.nested).toEqual({ a: 1 })
  })
})

// ─── SSG ─────────────────────────────────────────────────────────────────────

describe("prerender", () => {
  test("generates HTML files for given paths", async () => {
    const Home: ComponentFn = () => h("h1", null, "Home")
    const About: ComponentFn = () => h("h1", null, "About")
    const routes = [
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]
    const handler = createHandler({ App: Home, routes })

    const written: Record<string, string> = {}
    const tmpDir = `/tmp/pyreon-ssg-test-${Date.now()}`

    const result = await prerender({
      handler,
      paths: ["/", "/about"],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.elapsed).toBeGreaterThanOrEqual(0)

    // Verify files exist
    const indexFile = Bun.file(`${tmpDir}/index.html`)
    expect(await indexFile.exists()).toBe(true)
    const indexHtml = await indexFile.text()
    expect(indexHtml).toContain("<h1>Home</h1>")

    const aboutFile = Bun.file(`${tmpDir}/about/index.html`)
    expect(await aboutFile.exists()).toBe(true)

    // Cleanup
    const { rm } = await import("node:fs/promises")
    await rm(tmpDir, { recursive: true, force: true })
  })

  test("onPage callback can skip pages", async () => {
    const App: ComponentFn = () => h("div", null)
    const handler = createHandler({ App, routes: [{ path: "/", component: App }] })

    const tmpDir = `/tmp/pyreon-ssg-skip-${Date.now()}`
    const result = await prerender({
      handler,
      paths: ["/"],
      outDir: tmpDir,
      onPage: () => false, // skip all pages
    })

    expect(result.pages).toBe(0)

    const { rm } = await import("node:fs/promises")
    await rm(tmpDir, { recursive: true, force: true })
  })

  test("paths can be an async function", async () => {
    const App: ComponentFn = () => h("div", null)
    const handler = createHandler({ App, routes: [{ path: "/", component: App }] })

    const tmpDir = `/tmp/pyreon-ssg-async-${Date.now()}`
    const result = await prerender({
      handler,
      paths: async () => ["/"],
      outDir: tmpDir,
    })

    expect(result.pages).toBe(1)

    const { rm } = await import("node:fs/promises")
    await rm(tmpDir, { recursive: true, force: true })
  })
})
