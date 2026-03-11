import type { ComponentFn, VNode } from "@pyreon/core"
import { createContext, For, Fragment, h, pushContext, Suspense, useContext } from "@pyreon/core"
import { signal } from "@pyreon/reactivity"
import {
  configureStoreIsolation,
  renderToStream,
  renderToString,
  runWithRequestContext,
} from "../index"

async function collectStream(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return chunks.join("")
}

// ─── renderToString ───────────────────────────────────────────────────────────

describe("renderToString — elements", () => {
  test("renders a simple element", async () => {
    expect(await renderToString(h("div", null))).toBe("<div></div>")
  })

  test("renders void element self-closing", async () => {
    expect(await renderToString(h("br", null))).toBe("<br />")
  })

  test("renders static text child", async () => {
    expect(await renderToString(h("p", null, "hello"))).toBe("<p>hello</p>")
  })

  test("escapes text content", async () => {
    expect(await renderToString(h("p", null, "<script>"))).toBe("<p>&lt;script&gt;</p>")
  })

  test("renders nested elements", async () => {
    const vnode = h("ul", null, h("li", null, "a"), h("li", null, "b"))
    expect(await renderToString(vnode)).toBe("<ul><li>a</li><li>b</li></ul>")
  })

  test("renders null as empty string", async () => {
    expect(await renderToString(null)).toBe("")
  })
})

describe("renderToString — props", () => {
  test("renders static string prop", async () => {
    expect(await renderToString(h("div", { class: "box" }))).toBe(`<div class="box"></div>`)
  })

  test("renders boolean prop (true → attribute name only)", async () => {
    const html = await renderToString(h("input", { disabled: true }))
    expect(html).toContain("disabled")
  })

  test("omits false prop", async () => {
    const html = await renderToString(h("input", { disabled: false }))
    expect(html).not.toContain("disabled")
  })

  test("omits event handlers", async () => {
    const html = await renderToString(h("button", { onClick: () => {} }))
    expect(html).not.toContain("onClick")
    expect(html).not.toContain("on-click")
  })

  test("omits key and ref", async () => {
    const html = await renderToString(h("div", { key: "k", ref: null }))
    expect(html).not.toContain("key")
    expect(html).not.toContain("ref")
  })

  test("renders style object", async () => {
    const html = await renderToString(h("div", { style: { color: "red", fontSize: "16px" } }))
    expect(html).toContain("color: red")
    expect(html).toContain("font-size: 16px")
  })
})

describe("renderToString — reactive props (signal snapshots)", () => {
  test("snapshots a reactive prop getter", async () => {
    const count = signal(42)
    const html = await renderToString(h("span", { "data-count": () => count() }))
    expect(html).toBe(`<span data-count="42"></span>`)
  })

  test("snapshots a reactive child getter", async () => {
    const name = signal("world")
    const html = await renderToString(h("p", null, () => name()))
    expect(html).toBe("<p>world</p>")
  })
})

describe("renderToString — Fragment", () => {
  test("renders Fragment children without wrapper", async () => {
    const vnode = h(Fragment, null, h("span", null, "a"), h("span", null, "b"))
    expect(await renderToString(vnode)).toBe("<span>a</span><span>b</span>")
  })
})

describe("renderToString — components", () => {
  test("renders a component", async () => {
    const Greeting = (props: { name: string }) => h("p", null, `Hello, ${props.name}!`)
    const html = await renderToString(h(Greeting, { name: "Pyreon" }))
    expect(html).toBe("<p>Hello, Pyreon!</p>")
  })

  test("renders a component returning null", async () => {
    const Empty = () => null
    const html = await renderToString(h(Empty, null))
    expect(html).toBe("")
  })
})

// ─── renderToStream ───────────────────────────────────────────────────────────

describe("renderToStream", () => {
  async function collect(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader()
    let result = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += value
    }
    return result
  }

  test("streams a simple element", async () => {
    const html = await collect(renderToStream(h("div", null, "hi")))
    expect(html).toBe("<div>hi</div>")
  })

  test("streams null as empty", async () => {
    expect(await collect(renderToStream(null))).toBe("")
  })

  test("streams chunks progressively — opening tag before children", async () => {
    // An async child that resolves after a delay.
    // The parent opening tag must be enqueued BEFORE the child resolves.
    const chunks: string[] = []
    async function SlowChild() {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h("span", null, "done")
    }
    const stream = renderToStream(h("div", null, h(SlowChild as unknown as ComponentFn, null)))
    const reader = stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    // First chunk must be the opening tag, not the full string
    expect(chunks[0]).toBe("<div>")
    expect(chunks.join("")).toBe("<div><span>done</span></div>")
  })

  test("streams async component output", async () => {
    async function Async() {
      await new Promise<void>((r) => setTimeout(r, 1))
      return h("p", null, "async")
    }
    const html = await collect(renderToStream(h(Async as unknown as ComponentFn, null)))
    expect(html).toBe("<p>async</p>")
  })
})

// ─── Concurrent SSR isolation ────────────────────────────────────────────────

describe("concurrent SSR — context isolation", () => {
  test("two concurrent renderToString calls do not share context", async () => {
    const Ctx = createContext("default")

    // Each HeadInjector runs inside its own ALS scope.
    // If context were shared, the second render would see the first's value.
    function makeInjector(value: string): ComponentFn {
      return function Injector() {
        pushContext(new Map([[Ctx.id, value]]))
        return h("span", null, () => useContext(Ctx))
      }
    }

    // Stagger start slightly so they interleave
    const [html1, html2] = await Promise.all([
      renderToString(h(makeInjector("request-A"), null)),
      renderToString(h(makeInjector("request-B"), null)),
    ])

    expect(html1).toBe("<span>request-A</span>")
    expect(html2).toBe("<span>request-B</span>")
  })

  test("concurrent renders with async components stay isolated", async () => {
    const Ctx = createContext("none")

    function makeApp(value: string): ComponentFn {
      return async function App() {
        // Inject context, then yield (simulates async data loading)
        pushContext(new Map([[Ctx.id, value]]))
        await new Promise<void>((r) => setTimeout(r, 5))
        return h("div", null, () => useContext(Ctx))
      } as unknown as ComponentFn
    }

    const [html1, html2] = await Promise.all([
      renderToString(h(makeApp("R1"), null)),
      renderToString(h(makeApp("R2"), null)),
    ])

    expect(html1).toBe("<div>R1</div>")
    expect(html2).toBe("<div>R2</div>")
  })
})

// ─── Streaming Suspense SSR ───────────────────────────────────────────────────

describe("renderToStream — Suspense boundaries", () => {
  test("streams fallback immediately, then resolved content with swap", async () => {
    async function Slow(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 10))
      return h("p", { id: "resolved" }, "loaded")
    }

    const vnode = h(Suspense, {
      fallback: h("p", { id: "fallback" }, "loading..."),
      children: h(Slow as unknown as unknown as ComponentFn, null),
    })

    const html = await collectStream(renderToStream(vnode))

    // Fallback placeholder was emitted
    expect(html).toContain('id="pyreon-s-0"')
    expect(html).toContain("loading...")
    // Resolved content emitted in template + swap
    expect(html).toContain('id="pyreon-t-0"')
    expect(html).toContain("loaded")
    expect(html).toContain("__NS")
  })

  test("renderToStream emits chunks progressively (placeholder before resolution)", async () => {
    const chunkOrder: string[] = []

    async function SlowContent(): Promise<ReturnType<typeof h>> {
      await new Promise<void>((r) => setTimeout(r, 10))
      return h("span", null, "done")
    }

    const vnode = h(
      "div",
      null,
      h(Suspense, {
        fallback: h("span", { id: "fb" }, "wait"),
        children: h(SlowContent as unknown as unknown as ComponentFn, null),
      }),
      h("p", null, "after"),
    )

    const reader = renderToStream(vnode).getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunkOrder.push(value)
    }

    const full = chunkOrder.join("")
    // Placeholder chunk must appear before the resolved template chunk
    const placeholderIdx = full.indexOf("pyreon-s-0")
    const templateIdx = full.indexOf("pyreon-t-0")
    expect(placeholderIdx).toBeGreaterThanOrEqual(0)
    expect(templateIdx).toBeGreaterThan(placeholderIdx)
    // "after" sibling is in the HTML (not blocked by Suspense)
    expect(full).toContain("<p>after</p>")
  })

  test("renderToString renders Suspense children synchronously (no streaming)", async () => {
    async function Data(): Promise<ReturnType<typeof h>> {
      return h("span", null, "ssr-data")
    }

    const vnode = h(Suspense, {
      fallback: h("span", null, "fb"),
      children: h(Data as unknown as unknown as ComponentFn, null),
    })

    const html = await renderToString(vnode)
    // renderToString should render fallback via Suspense's sync path
    // (Suspense on server with non-lazy child just shows the fallback or children)
    expect(typeof html).toBe("string")
    expect(html.length).toBeGreaterThan(0)
  })
})

// ─── Concurrent SSR — context isolation ───────────────────────────────────────

describe("concurrent SSR — context isolation", () => {
  test("50 concurrent requests with async components don't bleed context", async () => {
    const ReqIdCtx = createContext("none")

    // Async component that reads context after a variable delay — simulates DB/fetch latency
    async function AsyncReader(props: { delay: number }): Promise<VNode> {
      await new Promise<void>((r) => setTimeout(r, props.delay))
      const id = useContext(ReqIdCtx)
      return h("span", null, id)
    }

    // Wrapper component that injects a per-request context value then renders AsyncReader
    function RequestWrapper(props: { reqId: string; delay: number }): VNode {
      pushContext(new Map([[ReqIdCtx.id, props.reqId]]))
      return h(AsyncReader as unknown as unknown as ComponentFn, { delay: props.delay })
    }

    const N = 50
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        renderToString(
          h(RequestWrapper, { reqId: `req-${i}`, delay: Math.floor(Math.random() * 20) }),
        ),
      ),
    )

    // Every render must see its own context value, never another request's
    results.forEach((html, i) => {
      expect(html).toContain(`req-${i}`)
    })
  })

  test("context is isolated even when all requests resolve in reverse order", async () => {
    const ReqIdCtx = createContext("none")

    async function SlowReader(props: { delay: number }): Promise<VNode> {
      await new Promise<void>((r) => setTimeout(r, props.delay))
      return h("span", null, useContext(ReqIdCtx))
    }

    const N = 10
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => {
        // Higher index = shorter delay → resolves first in reverse order
        const delay = (N - i) * 5
        return renderToString(
          h(
            ((props: { reqId: string; delay: number }): VNode => {
              pushContext(new Map([[ReqIdCtx.id, props.reqId]]))
              return h(SlowReader as unknown as unknown as ComponentFn, { delay: props.delay })
            }) as unknown as ComponentFn,
            { reqId: `id-${i}`, delay },
          ),
        )
      }),
    )

    results.forEach((html, i) => {
      expect(html).toBe(`<span>id-${i}</span>`)
    })
  })
})

// ─── configureStoreIsolation ────────────────────────────────────────────────

describe("configureStoreIsolation", () => {
  test("activates store isolation — withStoreContext wraps in ALS", async () => {
    let providerCalled = false
    const mockSetProvider = (fn: () => Map<string, unknown>) => {
      providerCalled = true
      // The provider should return a Map
      const result = fn()
      expect(result).toBeInstanceOf(Map)
    }
    configureStoreIsolation(mockSetProvider)
    expect(providerCalled).toBe(true)

    // After activation, renderToString should work (it uses withStoreContext internally)
    const html = await renderToString(h("div", null, "store-iso"))
    expect(html).toBe("<div>store-iso</div>")
  })
})

// ─── runWithRequestContext ───────────────────────────────────────────────────

describe("runWithRequestContext", () => {
  test("provides isolated context for async operations", async () => {
    const Ctx = createContext("default")
    const result = await runWithRequestContext(async () => {
      pushContext(new Map([[Ctx.id, "request-val"]]))
      return useContext(Ctx)
    })
    expect(result).toBe("request-val")
  })

  test("two concurrent runWithRequestContext calls are isolated", async () => {
    const Ctx = createContext("none")
    const [r1, r2] = await Promise.all([
      runWithRequestContext(async () => {
        pushContext(new Map([[Ctx.id, "ctx-A"]]))
        await new Promise<void>((r) => setTimeout(r, 5))
        return useContext(Ctx)
      }),
      runWithRequestContext(async () => {
        pushContext(new Map([[Ctx.id, "ctx-B"]]))
        await new Promise<void>((r) => setTimeout(r, 5))
        return useContext(Ctx)
      }),
    ])
    expect(r1).toBe("ctx-A")
    expect(r2).toBe("ctx-B")
  })
})

// ─── renderToString — uncovered branches ─────────────────────────────────────

describe("renderToString — For component", () => {
  test("renders For with hydration markers", async () => {
    const items = signal(["a", "b", "c"])
    const vnode = For({
      each: items,
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    })
    const html = await renderToString(vnode)
    expect(html).toContain("<!--pyreon-for-->")
    expect(html).toContain("<!--/pyreon-for-->")
    expect(html).toContain("<li>a</li>")
    expect(html).toContain("<li>b</li>")
    expect(html).toContain("<li>c</li>")
  })
})

describe("renderToString — array children", () => {
  test("renders array of VNodes", async () => {
    const arr = [h("span", null, "x"), h("span", null, "y")]
    // Components can return arrays
    const Comp: ComponentFn = () => arr as unknown as VNode
    const html = await renderToString(h(Comp, null))
    expect(html).toContain("<span>x</span>")
    expect(html).toContain("<span>y</span>")
  })
})

describe("renderToString — class and style edge cases", () => {
  test("renders class as array", async () => {
    const html = await renderToString(h("div", { class: ["foo", null, "bar", false, "baz"] }))
    expect(html).toContain('class="foo bar baz"')
  })

  test("renders class as object (truthy/falsy)", async () => {
    const html = await renderToString(h("div", { class: { active: true, hidden: false, bold: 1 } }))
    expect(html).toContain("active")
    expect(html).toContain("bold")
    expect(html).not.toContain("hidden")
  })

  test("renders empty class as no attribute", async () => {
    const html = await renderToString(h("div", { class: "" }))
    expect(html).toBe("<div></div>")
  })

  test("renders non-standard class value (number) as no attribute", async () => {
    // normalizeClass falls through to return "" for non-string/array/object
    const html = await renderToString(h("div", { class: 42 }))
    expect(html).toBe("<div></div>")
  })

  test("renders style as string", async () => {
    const html = await renderToString(h("div", { style: "color: red" }))
    expect(html).toContain('style="color: red"')
  })

  test("renders empty style object as no attribute", async () => {
    // normalizeStyle with non-object/non-string falls through to return ""
    const html = await renderToString(h("div", { style: 42 }))
    expect(html).toBe("<div></div>")
  })

  test("renders className → class and htmlFor → for", async () => {
    const html = await renderToString(h("label", { className: "lbl", htmlFor: "inp" }))
    expect(html).toContain('class="lbl"')
    expect(html).toContain('for="inp"')
  })

  test("renders camelCase props as kebab-case attributes", async () => {
    const html = await renderToString(h("div", { dataTestId: "val" }))
    expect(html).toContain('data-test-id="val"')
  })
})

describe("renderToString — URL injection blocking", () => {
  test("blocks javascript: in href", async () => {
    const html = await renderToString(h("a", { href: "javascript:alert(1)" }))
    expect(html).not.toContain("javascript")
    expect(html).toBe("<a></a>")
  })

  test("blocks data: in src", async () => {
    const html = await renderToString(h("img", { src: "data:text/html,<h1>hi</h1>" }))
    expect(html).not.toContain("data:")
  })
})

describe("renderToString — null/undefined/boolean prop values", () => {
  test("omits null and undefined props", async () => {
    const html = await renderToString(h("div", { "data-a": null, "data-b": undefined }))
    expect(html).toBe("<div></div>")
  })

  test("renders number children", async () => {
    const html = await renderToString(h("span", null, 42))
    expect(html).toBe("<span>42</span>")
  })

  test("renders boolean true as text in children", async () => {
    const html = await renderToString(h("span", null, true))
    expect(html).toBe("<span>true</span>")
  })

  test("omits false children", async () => {
    const html = await renderToString(h("span", null, false))
    expect(html).toBe("<span></span>")
  })
})

describe("renderToString — n- directives", () => {
  test("omits n-show and custom n- directives", async () => {
    const html = await renderToString(h("div", { "n-show": true, "n-custom": () => {} }))
    expect(html).not.toContain("n-show")
    expect(html).not.toContain("n-custom")
  })
})

describe("renderToString — component with children via h()", () => {
  test("mergeChildrenIntoProps passes children to component", async () => {
    const Wrapper: ComponentFn = (props: Record<string, unknown>) => {
      return h("div", null, props.children as VNode)
    }
    const html = await renderToString(h(Wrapper, null, h("span", null, "child")))
    expect(html).toBe("<div><span>child</span></div>")
  })

  test("mergeChildrenIntoProps passes multiple children as array", async () => {
    const Wrapper: ComponentFn = (props: Record<string, unknown>) => {
      const kids = props.children as VNode[]
      return h("div", null, ...kids)
    }
    const html = await renderToString(h(Wrapper, null, h("a", null, "1"), h("b", null, "2")))
    expect(html).toBe("<div><a>1</a><b>2</b></div>")
  })

  test("does not override explicit children prop", async () => {
    const Wrapper: ComponentFn = (props: Record<string, unknown>) => {
      return h("div", null, props.children as VNode)
    }
    const html = await renderToString(h(Wrapper, { children: h("em", null, "explicit") }))
    expect(html).toBe("<div><em>explicit</em></div>")
  })
})

// ─── renderToStream — uncovered branches ─────────────────────────────────────

describe("renderToStream — additional coverage", () => {
  async function collect(stream: ReadableStream<string>): Promise<string> {
    const reader = stream.getReader()
    let result = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += value
    }
    return result
  }

  test("streams Fragment children", async () => {
    const html = await collect(
      renderToStream(h(Fragment, null, h("a", null, "1"), h("b", null, "2"))),
    )
    expect(html).toBe("<a>1</a><b>2</b>")
  })

  test("streams For component with markers", async () => {
    const items = signal(["x", "y"])
    const vnode = For({
      each: items,
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    })
    const html = await collect(renderToStream(vnode))
    expect(html).toContain("<!--pyreon-for-->")
    expect(html).toContain("<li>x</li>")
    expect(html).toContain("<li>y</li>")
    expect(html).toContain("<!--/pyreon-for-->")
  })

  test("streams reactive getter children", async () => {
    const name = signal("streamed")
    const html = await collect(renderToStream(h("p", null, () => name())))
    expect(html).toContain("streamed")
  })

  test("streams number and boolean children", async () => {
    const html = await collect(renderToStream(h("span", null, 99)))
    expect(html).toContain("99")
  })

  test("streams array children", async () => {
    const Comp: ComponentFn = () => [h("a", null, "1"), h("b", null, "2")] as unknown as VNode
    const html = await collect(renderToStream(h(Comp, null)))
    expect(html).toContain("<a>1</a>")
    expect(html).toContain("<b>2</b>")
  })

  test("streams void elements", async () => {
    const html = await collect(renderToStream(h("img", { src: "/pic.png" })))
    expect(html).toContain("<img")
    expect(html).toContain("/>")
  })

  test("streams component returning null", async () => {
    const Empty: ComponentFn = () => null
    const html = await collect(renderToStream(h(Empty, null)))
    expect(html).toBe("")
  })

  test("streams false/null children as empty", async () => {
    const html = await collect(renderToStream(h("div", null, false, null)))
    expect(html).toBe("<div></div>")
  })

  test("streams string children directly", async () => {
    const html = await collect(renderToStream(h("p", null, "text & <tag>")))
    expect(html).toContain("text &amp; &lt;tag&gt;")
  })

  test("multiple Suspense boundaries get incrementing IDs", async () => {
    async function Slow1(): Promise<VNode> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h("span", null, "s1")
    }
    async function Slow2(): Promise<VNode> {
      await new Promise<void>((r) => setTimeout(r, 5))
      return h("span", null, "s2")
    }
    const vnode = h(
      "div",
      null,
      h(Suspense, {
        fallback: h("p", null, "fb1"),
        children: h(Slow1 as unknown as unknown as ComponentFn, null),
      }),
      h(Suspense, {
        fallback: h("p", null, "fb2"),
        children: h(Slow2 as unknown as unknown as ComponentFn, null),
      }),
    )
    const html = await collect(renderToStream(vnode))
    expect(html).toContain("pyreon-s-0")
    expect(html).toContain("pyreon-s-1")
    expect(html).toContain("pyreon-t-0")
    expect(html).toContain("pyreon-t-1")
    // The swap script should only be emitted once
    const scriptMatches = html.match(/function __NS/g)
    expect(scriptMatches).toHaveLength(1)
  })
})

// ─── Concurrent SSR isolation ─────────────────────────────────────────────────

describe("concurrent SSR isolation", () => {
  test("50 concurrent renders produce correct isolated output", async () => {
    function Page(props: { id: number }) {
      return h("div", { "data-id": props.id }, `page-${props.id}`)
    }

    const renders = Array.from({ length: 50 }, (_, i) =>
      runWithRequestContext(() =>
        renderToString(h(Page as unknown as unknown as ComponentFn, { id: i })),
      ),
    )
    const results = await Promise.all(renders)

    for (let i = 0; i < 50; i++) {
      const html = results[i]
      expect(html).toContain(`data-id="${i}"`)
      expect(html).toContain(`page-${i}`)
    }
  })

  test("concurrent renders with different props do not leak state", async () => {
    function UserPage(props: { name: string }) {
      return h("div", null, `user:${props.name}`)
    }

    // Launch 40 concurrent renders with alternating data
    const renders = Array.from({ length: 40 }, (_, i) =>
      runWithRequestContext(() => {
        const name = i % 2 === 0 ? `alice-${i}` : `bob-${i}`
        return renderToString(h(UserPage as unknown as unknown as ComponentFn, { name }))
      }),
    )
    const results = await Promise.all(renders)

    for (let i = 0; i < 40; i++) {
      const expected = i % 2 === 0 ? `user:alice-${i}` : `user:bob-${i}`
      expect(results[i]).toContain(expected)
    }
  })

  test("concurrent renders with async components stay isolated", async () => {
    async function SlowPage(props: { label: string }): Promise<VNode> {
      await new Promise<void>((r) => setTimeout(r, Math.random() * 10))
      return h("span", null, props.label)
    }

    const renders = Array.from({ length: 30 }, (_, i) =>
      runWithRequestContext(() =>
        renderToString(h(SlowPage as unknown as unknown as ComponentFn, { label: `item-${i}` })),
      ),
    )
    const results = await Promise.all(renders)

    for (let i = 0; i < 30; i++) {
      expect(results[i]).toContain(`item-${i}`)
    }
  })
})
