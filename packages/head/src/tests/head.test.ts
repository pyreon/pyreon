import { describe, test, expect, beforeEach } from "bun:test"
import { h } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import {
  createHeadContext,
  HeadProvider,
  useHead,
  renderWithHead,
} from "../index"
import type { HeadContextValue } from "../index"

// ─── SSR tests ────────────────────────────────────────────────────────────────

describe("renderWithHead — SSR", () => {
  test("extracts <title> from useHead", async () => {
    function Page() {
      useHead({ title: "Hello Nova" })
      return h("main", null, "content")
    }
    const { html, head } = await renderWithHead(h(Page, null))
    expect(html).toContain("<main>")
    expect(head).toContain("<title>Hello Nova</title>")
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
      useHead({ title: 'A & B <script>' })
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
})

// ─── CSR tests ────────────────────────────────────────────────────────────────

describe("useHead — CSR", () => {
  let container: HTMLElement
  let ctx: HeadContextValue

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    ctx = createHeadContext()
    // Clean up any nova-injected head tags from prior tests
    document.head.querySelectorAll("[data-nova-head]").forEach((el) => el.remove())
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
      useHead({ meta: [{ name: "keywords", content: "nova" }] })
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
})
