import { h } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import type { HeadContextValue } from "../index"
import { createHeadContext, HeadProvider, renderWithHead, useHead } from "../index"

// ─── SSR tests ────────────────────────────────────────────────────────────────

describe("renderWithHead — SSR", () => {
  test("extracts <title> from useHead", async () => {
    function Page() {
      useHead({ title: "Hello Pyreon" })
      return h("main", null, "content")
    }
    const { html, head } = await renderWithHead(h(Page, null))
    expect(html).toContain("<main>")
    expect(head).toContain("<title>Hello Pyreon</title>")
  })

  test("extracts <meta> tags from useHead", async () => {
    function Page() {
      useHead({
        meta: [
          { name: "description", content: "A great page" },
          { property: "og:title", content: "Hello" },
        ],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('name="description"')
    expect(head).toContain('content="A great page"')
    expect(head).toContain('property="og:title"')
  })

  test("extracts <link> tags from useHead", async () => {
    function Page() {
      useHead({ link: [{ rel: "canonical", href: "https://example.com/page" }] })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('rel="canonical"')
    expect(head).toContain('href="https://example.com/page"')
  })

  test("deduplication: innermost title wins", async () => {
    function Inner() {
      useHead({ title: "Inner Title" })
      return h("span", null)
    }
    function Outer() {
      useHead({ title: "Outer Title" })
      return h("div", null, h(Inner, null))
    }
    const { head } = await renderWithHead(h(Outer, null))
    // Only one <title> — Inner wins (last-added wins per key)
    const titleMatches = head.match(/<title>/g)
    expect(titleMatches).toHaveLength(1)
    expect(head).toContain("<title>Inner Title</title>")
  })

  test("escapes HTML entities in title", async () => {
    function Page() {
      useHead({ title: "A & B <script>" })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("A &amp; B &lt;script&gt;")
    expect(head).not.toContain("<script>")
  })

  test("works with async component", async () => {
    async function AsyncPage() {
      await new Promise((r) => setTimeout(r, 1))
      useHead({ title: "Async Page" })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(AsyncPage as never, null))
    expect(head).toContain("<title>Async Page</title>")
  })

  test("renders <style> tags", async () => {
    function Page() {
      useHead({ style: [{ children: "body { color: red }" }] })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("<style>body { color: red }</style>")
  })

  test("renders <noscript> tags", async () => {
    function Page() {
      useHead({ noscript: [{ children: "<p>Please enable JavaScript</p>" }] })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("<noscript><p>Please enable JavaScript</p></noscript>")
  })

  test("renders JSON-LD script tag", async () => {
    function Page() {
      useHead({ jsonLd: { "@type": "WebPage", name: "Test" } })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('type="application/ld+json"')
    expect(head).toContain('"@type":"WebPage"')
    expect(head).toContain('"name":"Test"')
  })

  test("script content is not HTML-escaped", async () => {
    function Page() {
      useHead({ script: [{ children: "var x = 1 < 2 && 3 > 1" }] })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("var x = 1 < 2 && 3 > 1")
    expect(head).not.toContain("&lt;")
  })

  test("titleTemplate with %s placeholder", async () => {
    function Layout() {
      useHead({ titleTemplate: "%s | My App" })
      return h("div", null, h(Page, null))
    }
    function Page() {
      useHead({ title: "About" })
      return h("span", null)
    }
    const { head } = await renderWithHead(h(Layout, null))
    expect(head).toContain("<title>About | My App</title>")
  })

  test("titleTemplate with function", async () => {
    function Layout() {
      useHead({ titleTemplate: (t: string) => (t ? `${t} — Site` : "Site") })
      return h("div", null, h(Page, null))
    }
    function Page() {
      useHead({ title: "Home" })
      return h("span", null)
    }
    const { head } = await renderWithHead(h(Layout, null))
    expect(head).toContain("<title>Home — Site</title>")
  })

  test("returns htmlAttrs and bodyAttrs", async () => {
    function Page() {
      useHead({ htmlAttrs: { lang: "en", dir: "ltr" }, bodyAttrs: { class: "dark" } })
      return h("div", null)
    }
    const result = await renderWithHead(h(Page, null))
    expect(result.htmlAttrs).toEqual({ lang: "en", dir: "ltr" })
    expect(result.bodyAttrs).toEqual({ class: "dark" })
  })

  test("multiple link tags with same rel but different href are kept", async () => {
    function Page() {
      useHead({
        link: [
          { rel: "stylesheet", href: "/a.css" },
          { rel: "stylesheet", href: "/b.css" },
        ],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('href="/a.css"')
    expect(head).toContain('href="/b.css"')
  })
})

// ─── CSR tests ────────────────────────────────────────────────────────────────

describe("useHead — CSR", () => {
  let container: HTMLElement
  let ctx: HeadContextValue

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    ctx = createHeadContext()
    // Clean up any pyreon-injected head tags from prior tests
    for (const el of document.head.querySelectorAll("[data-pyreon-head]")) el.remove()
    document.title = ""
  })

  test("syncs document.title on mount", () => {
    function Page() {
      useHead({ title: "CSR Title" })
      return h("div", null)
    }
    // When using h() directly (not JSX), component children must be in props.children
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.title).toBe("CSR Title")
  })

  test("syncs <meta> tags on mount", () => {
    function Page() {
      useHead({ meta: [{ name: "description", content: "CSR desc" }] })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const meta = document.head.querySelector('meta[name="description"]')
    expect(meta?.getAttribute("content")).toBe("CSR desc")
  })

  test("removes meta tags on unmount", () => {
    function Page() {
      useHead({ meta: [{ name: "keywords", content: "pyreon" }] })
      return h("div", null)
    }
    const cleanup = mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.head.querySelector('meta[name="keywords"]')).not.toBeNull()
    cleanup()
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull()
  })

  test("reactive useHead updates title when signal changes", () => {
    const title = signal("Initial")
    function Page() {
      useHead(() => ({ title: title() }))
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.title).toBe("Initial")
    title.set("Updated")
    expect(document.title).toBe("Updated")
  })

  test("syncs <style> tags on mount", () => {
    function Page() {
      useHead({ style: [{ children: "body { margin: 0 }" }] })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const style = document.head.querySelector("style[data-pyreon-head]")
    expect(style).not.toBeNull()
    expect(style?.textContent).toBe("body { margin: 0 }")
  })

  test("syncs JSON-LD script on mount", () => {
    function Page() {
      useHead({ jsonLd: { "@type": "WebPage", name: "Test" } })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const script = document.head.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    expect(script?.textContent).toContain('"@type":"WebPage"')
  })

  test("titleTemplate applies to document.title", () => {
    function Layout() {
      useHead({ titleTemplate: "%s | My App" })
      return h("div", null, h(Page, null))
    }
    function Page() {
      useHead({ title: "Dashboard" })
      return h("span", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Layout, null) }), container)
    expect(document.title).toBe("Dashboard | My App")
  })

  test("htmlAttrs sets attributes on <html>", () => {
    function Page() {
      useHead({ htmlAttrs: { lang: "fr" } })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.documentElement.getAttribute("lang")).toBe("fr")
  })

  test("bodyAttrs sets attributes on <body>", () => {
    function Page() {
      useHead({ bodyAttrs: { class: "dark-mode" } })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.body.getAttribute("class")).toBe("dark-mode")
  })

  test("incremental sync updates attributes in place", () => {
    const desc = signal("initial")
    function Page() {
      useHead(() => ({ meta: [{ name: "description", content: desc() }] }))
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const meta1 = document.head.querySelector('meta[name="description"]')
    expect(meta1?.getAttribute("content")).toBe("initial")
    desc.set("updated")
    const meta2 = document.head.querySelector('meta[name="description"]')
    // Same element should be reused (incremental sync)
    expect(meta2).toBe(meta1)
    expect(meta2?.getAttribute("content")).toBe("updated")
  })

  test("titleTemplate function applies to document.title in CSR", () => {
    function Layout() {
      useHead({ titleTemplate: (t: string) => (t ? `${t} - App` : "App") })
      return h("div", null, h(Page, null))
    }
    function Page() {
      useHead({ title: "CSR Page" })
      return h("span", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Layout, null) }), container)
    expect(document.title).toBe("CSR Page - App")
  })

  test("removes stale elements when tags change", () => {
    const show = signal(true)
    function Page() {
      useHead(() => {
        const tags: { name: string; content: string }[] = []
        if (show()) tags.push({ name: "keywords", content: "pyreon" })
        return { meta: tags }
      })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.head.querySelector('meta[name="keywords"]')).not.toBeNull()
    show.set(false)
    expect(document.head.querySelector('meta[name="keywords"]')).toBeNull()
  })

  test("patchAttrs removes old attributes no longer in props", () => {
    const attrs = signal<Record<string, string>>({ name: "test", content: "value" })
    function Page() {
      useHead(() => ({ meta: [attrs()] }))
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const el = document.head.querySelector('meta[name="test"]')
    expect(el?.getAttribute("content")).toBe("value")
    // Change attrs to remove 'content'
    attrs.set({ name: "test" })
    const el2 = document.head.querySelector('meta[name="test"]')
    expect(el2?.getAttribute("content")).toBeNull()
  })

  test("syncElementAttrs removes previously managed attrs", () => {
    const show = signal(true)
    function Page() {
      useHead(() => (show() ? { htmlAttrs: { lang: "en", dir: "ltr" } } : { htmlAttrs: {} }))
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    expect(document.documentElement.getAttribute("lang")).toBe("en")
    expect(document.documentElement.getAttribute("dir")).toBe("ltr")
    show.set(false)
    // Previously managed attrs should be removed
    expect(document.documentElement.getAttribute("lang")).toBeNull()
    expect(document.documentElement.getAttribute("dir")).toBeNull()
  })

  test("link tag key deduplication by rel when no href", async () => {
    function Page() {
      useHead({
        link: [{ rel: "icon" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("rel=")
  })

  test("link tag key uses index when no href or rel", async () => {
    function Page() {
      useHead({
        link: [{ crossorigin: "anonymous" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("<link")
  })

  test("meta tag key uses property when name is absent", async () => {
    function Page() {
      useHead({
        meta: [{ property: "og:title", content: "OG" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('property="og:title"')
  })

  test("meta tag key falls back to index when no name or property", async () => {
    function Page() {
      useHead({
        meta: [{ charset: "utf-8" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('charset="utf-8"')
  })

  test("script tag with src uses src as key", async () => {
    function Page() {
      useHead({
        script: [{ src: "/app.js" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain('src="/app.js"')
  })

  test("script tag without src uses index as key", async () => {
    function Page() {
      useHead({
        script: [{ children: "console.log('hi')" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("console.log('hi')")
  })

  test("base tag renders in SSR", async () => {
    function Page() {
      useHead({ base: { href: "/" } })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("<base")
    expect(head).toContain('href="/"')
  })

  test("noscript raw content escaping in SSR", async () => {
    function Page() {
      useHead({
        noscript: [{ children: "<p>Enable JS</p>" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    // noscript is a raw tag, content preserved
    expect(head).toContain("<p>Enable JS</p>")
  })

  test("style content escaping in SSR prevents tag injection", async () => {
    function Page() {
      useHead({
        style: [{ children: "body { color: red } </style><script>" }],
      })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    // Closing tag should be escaped
    expect(head).toContain("<\\/style>")
  })

  test("unkeyed tags are all preserved in resolve", () => {
    const id1 = Symbol()
    const id2 = Symbol()
    ctx.add(id1, { tags: [{ tag: "meta", props: { name: "a", content: "1" } }] })
    ctx.add(id2, { tags: [{ tag: "meta", props: { name: "b", content: "2" } }] })
    const tags = ctx.resolve()
    expect(tags).toHaveLength(2)
    ctx.remove(id1)
    ctx.remove(id2)
  })

  test("title tag without children renders empty", async () => {
    function Page() {
      useHead({ title: "" })
      return h("div", null)
    }
    const { head } = await renderWithHead(h(Page, null))
    expect(head).toContain("<title></title>")
  })

  test("useHead with no context is a no-op", () => {
    // Calling useHead outside of any HeadProvider should not throw
    expect(() => {
      useHead({ title: "No Provider" })
    }).not.toThrow()
  })

  test("CSR sync creates new elements for unkeyed tags", () => {
    function Page() {
      useHead({ meta: [{ name: "viewport", content: "width=device-width" }] })
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const meta = document.head.querySelector('meta[name="viewport"]')
    expect(meta).not.toBeNull()
  })

  test("CSR patchAttrs sets new attribute values", () => {
    const val = signal("initial")
    function Page() {
      useHead(() => ({
        meta: [{ name: "test-patch", content: val() }],
      }))
      return h("div", null)
    }
    mount(h(HeadProvider, { context: ctx, children: h(Page, null) }), container)
    const el = document.head.querySelector('meta[name="test-patch"]')
    expect(el?.getAttribute("content")).toBe("initial")
    val.set("changed")
    expect(el?.getAttribute("content")).toBe("changed")
  })
})
