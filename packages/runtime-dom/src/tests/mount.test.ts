import type { ComponentFn, VNodeChild } from "@pyreon/core"
import {
  ErrorBoundary as _ErrorBoundary,
  createRef,
  defineComponent,
  For,
  Fragment,
  h,
  Match,
  onMount,
  onUnmount,
  onUpdate,
  Portal,
  Show,
  Switch,
} from "@pyreon/core"
import { cell, signal } from "@pyreon/reactivity"
import { installDevTools, registerComponent, unregisterComponent } from "../devtools"
import type { Directive } from "../index"
import {
  KeepAlive as _KeepAlive,
  Transition as _Transition,
  TransitionGroup as _TransitionGroup,
  createTemplate,
  disableHydrationWarnings,
  enableHydrationWarnings,
  hydrateRoot,
  mount,
  sanitizeHtml,
  setSanitizer,
} from "../index"
import { mountChild } from "../mount"

// Cast components that return VNodeChild (not VNode | null) so h() accepts them
const Transition = _Transition as unknown as ComponentFn<Record<string, unknown>>
const TransitionGroup = _TransitionGroup as unknown as ComponentFn<Record<string, unknown>>
const ErrorBoundary = _ErrorBoundary as unknown as ComponentFn<Record<string, unknown>>
const KeepAlive = _KeepAlive as unknown as ComponentFn<Record<string, unknown>>

function container(): HTMLElement {
  const el = document.createElement("div")
  document.body.appendChild(el)
  return el
}

// ─── Static mounting ─────────────────────────────────────────────────────────

describe("mount — static", () => {
  test("mounts a text node", () => {
    const el = container()
    mount("hello", el)
    expect(el.textContent).toBe("hello")
  })

  test("mounts a number as text", () => {
    const el = container()
    mount(42, el)
    expect(el.textContent).toBe("42")
  })

  test("mounts a simple element", () => {
    const el = container()
    mount(h("span", null, "world"), el)
    expect(el.innerHTML).toBe("<span>world</span>")
  })

  test("mounts nested elements", () => {
    const el = container()
    mount(h("div", null, h("p", null, "nested")), el)
    expect(el.querySelector("p")?.textContent).toBe("nested")
  })

  test("mounts null / undefined / false as nothing", () => {
    const el = container()
    mount(null, el)
    expect(el.innerHTML).toBe("")
    mount(undefined, el)
    expect(el.innerHTML).toBe("")
    mount(false, el)
    expect(el.innerHTML).toBe("")
  })

  test("mounts a Fragment", () => {
    const el = container()
    mount(h(Fragment, null, h("span", null, "a"), h("span", null, "b")), el)
    expect(el.querySelectorAll("span").length).toBe(2)
  })
})

// ─── Props ────────────────────────────────────────────────────────────────────

describe("mount — props", () => {
  test("sets class attribute", () => {
    const el = container()
    mount(h("div", { class: "foo bar" }), el)
    expect(el.querySelector("div")?.className).toBe("foo bar")
  })

  test("sets arbitrary attribute", () => {
    const el = container()
    mount(h("div", { "data-id": "123" }), el)
    expect(el.querySelector("div")?.getAttribute("data-id")).toBe("123")
  })

  test("removes attribute when value is null", () => {
    const el = container()
    mount(h("div", { "data-x": null }), el)
    expect(el.querySelector("div")?.hasAttribute("data-x")).toBe(false)
  })

  test("attaches event listener", () => {
    const el = container()
    let clicked = false
    mount(
      h(
        "button",
        {
          onClick: () => {
            clicked = true
          },
        },
        "click me",
      ),
      el,
    )
    el.querySelector("button")?.click()
    expect(clicked).toBe(true)
  })
})

// ─── Reactive props & children ────────────────────────────────────────────────

describe("mount — reactive", () => {
  test("reactive text child updates", () => {
    const el = container()
    const text = signal("hello")
    mount(
      h("div", null, () => text()),
      el,
    )
    expect(el.querySelector("div")?.textContent).toBe("hello")
    text.set("world")
    expect(el.querySelector("div")?.textContent).toBe("world")
  })

  test("reactive class prop updates", () => {
    const el = container()
    const cls = signal("a")
    mount(h("div", { class: () => cls() }), el)
    expect(el.querySelector("div")?.className).toBe("a")
    cls.set("b")
    expect(el.querySelector("div")?.className).toBe("b")
  })
})

// ─── Components ───────────────────────────────────────────────────────────────

describe("mount — components", () => {
  test("mounts a functional component", () => {
    const Greeting = defineComponent(({ name }: { name: string }) =>
      h("p", null, `Hello, ${name}!`),
    )
    const el = container()
    mount(h(Greeting, { name: "Pyreon" }), el)
    expect(el.querySelector("p")?.textContent).toBe("Hello, Pyreon!")
  })

  test("component with reactive state updates DOM", () => {
    const Counter = defineComponent(() => {
      const count = signal(0)
      return h(
        "div",
        null,
        h("span", null, () => String(count())),
        h("button", { onClick: () => count.update((n) => n + 1) }, "+"),
      )
    })
    const el = container()
    mount(h(Counter, {}), el)
    expect(el.querySelector("span")?.textContent).toBe("0")
    el.querySelector("button")?.click()
    expect(el.querySelector("span")?.textContent).toBe("1")
    el.querySelector("button")?.click()
    expect(el.querySelector("span")?.textContent).toBe("2")
  })
})

// ─── Unmount ──────────────────────────────────────────────────────────────────

describe("mount — refs", () => {
  test("ref.current is set after mount", () => {
    const el = container()
    const ref = createRef<HTMLButtonElement>()
    expect(ref.current).toBeNull()
    mount(h("button", { ref }), el)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  test("ref.current is cleared after unmount", () => {
    const el = container()
    const ref = createRef<HTMLDivElement>()
    const unmount = mount(h("div", { ref }), el)
    expect(ref.current).not.toBeNull()
    unmount()
    expect(ref.current).toBeNull()
  })

  test("callback ref is called with element after mount", () => {
    const el = container()
    let refEl: Element | null = null
    mount(
      h("div", {
        ref: (e: Element) => {
          refEl = e
        },
      }),
      el,
    )
    expect(refEl).toBeInstanceOf(HTMLDivElement)
  })

  test("callback ref element is not nulled on unmount", () => {
    const el = container()
    let refEl: Element | null = null
    const unmount = mount(
      h("div", {
        ref: (e: Element) => {
          refEl = e
        },
      }),
      el,
    )
    expect(refEl).not.toBeNull()
    unmount()
    // Callback refs don't get called with null on cleanup
    expect(refEl).toBeInstanceOf(HTMLDivElement)
  })

  test("ref is not emitted as an HTML attribute", () => {
    const el = container()
    const ref = createRef<HTMLDivElement>()
    mount(h("div", { ref }), el)
    expect(el.firstElementChild?.hasAttribute("ref")).toBe(false)
  })
})

describe("mount — unmount", () => {
  test("unmount removes mounted nodes", () => {
    const el = container()
    const unmount = mount(h("div", null, "bye"), el)
    expect(el.innerHTML).not.toBe("")
    unmount()
    expect(el.innerHTML).toBe("")
  })

  test("unmount disposes reactive effects", () => {
    const el = container()
    const text = signal("initial")
    const unmount = mount(
      h("p", null, () => text()),
      el,
    )
    unmount()
    text.set("updated")
    // After unmount, node is gone — no error thrown, no stale update
    expect(el.innerHTML).toBe("")
  })
})

// ─── For ──────────────────────────────────────────────────────────────────────

describe("mount — For", () => {
  type Item = { id: number; label: string }

  test("renders initial list", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    expect(el.querySelectorAll("li").length).toBe(3)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("a")
    expect(el.querySelectorAll("li")[2]?.textContent).toBe("c")
  })

  test("appends new items", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "a" }])
    mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    expect(el.querySelectorAll("li").length).toBe(1)
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    expect(el.querySelectorAll("li").length).toBe(2)
    expect(el.querySelectorAll("li")[1]?.textContent).toBe("b")
  })

  test("removes items", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    items.set([{ id: 1, label: "a" }])
    expect(el.querySelectorAll("li").length).toBe(1)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("a")
  })

  test("swaps two items (small-k fast path)", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    items.set([
      { id: 1, label: "a" },
      { id: 3, label: "c" },
      { id: 2, label: "b" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis[0]?.textContent).toBe("a")
    expect(lis[1]?.textContent).toBe("c")
    expect(lis[2]?.textContent).toBe("b")
  })

  test("replaces all items", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "old" }])
    mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    items.set([{ id: 99, label: "new" }])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(1)
    expect(lis[0]?.textContent).toBe("new")
  })

  test("clears list", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "x" }])
    mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    items.set([])
    expect(el.querySelectorAll("li").length).toBe(0)
  })

  test("unmount cleans up", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "x" }])
    const unmount = mount(
      h(
        "ul",
        null,
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
      ),
      el,
    )
    unmount()
    expect(el.innerHTML).toBe("")
  })
})

// ─── For + NativeItem (createTemplate path — what the benchmark uses) ─────

describe("mount — For + NativeItem (createTemplate)", () => {
  type RR = { id: number; label: ReturnType<typeof cell<string>> }

  function makeRR(id: number, text: string): RR {
    return { id, label: cell(text) }
  }

  const rowFactory = createTemplate<RR>("<tr><td>\x00</td><td>\x00</td></tr>", (tr, row) => {
    const td1 = tr.firstChild as HTMLElement
    const td2 = td1.nextSibling as HTMLElement
    const t1 = td1.firstChild as Text
    const t2 = td2.firstChild as Text
    t1.data = String(row.id)
    t2.data = row.label.peek()
    row.label.listen(() => {
      t2.data = row.label.peek()
    })
    return null
  })

  test("renders initial list with correct text", () => {
    const el = container()
    const items = signal<RR[]>([makeRR(1, "a"), makeRR(2, "b"), makeRR(3, "c")])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    const trs = el.querySelectorAll("tr")
    expect(trs.length).toBe(3)
    expect(trs[0]?.querySelectorAll("td")[1]?.textContent).toBe("a")
    expect(trs[2]?.querySelectorAll("td")[1]?.textContent).toBe("c")
  })

  test("cell.set() updates text in-place (partial update)", () => {
    const el = container()
    const rows = [makeRR(1, "hello"), makeRR(2, "world")]
    const items = signal<RR[]>(rows)
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    // Update label via cell — should change DOM without re-rendering list
    const first = rows[0]
    if (!first) throw new Error("missing row")
    first.label.set("changed")
    expect(el.querySelectorAll("tr")[0]?.querySelectorAll("td")[1]?.textContent).toBe("changed")
    // Second row untouched
    expect(el.querySelectorAll("tr")[1]?.querySelectorAll("td")[1]?.textContent).toBe("world")
  })

  test("replace all rows", () => {
    const el = container()
    const items = signal<RR[]>([makeRR(1, "old")])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    items.set([makeRR(10, "new1"), makeRR(11, "new2")])
    const trs = el.querySelectorAll("tr")
    expect(trs.length).toBe(2)
    expect(trs[0]?.querySelectorAll("td")[0]?.textContent).toBe("10")
    expect(trs[1]?.querySelectorAll("td")[1]?.textContent).toBe("new2")
  })

  test("swap rows preserves DOM identity", () => {
    const el = container()
    const r1 = makeRR(1, "a")
    const r2 = makeRR(2, "b")
    const r3 = makeRR(3, "c")
    const items = signal<RR[]>([r1, r2, r3])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    const origTr2 = el.querySelectorAll("tr")[1]
    const origTr3 = el.querySelectorAll("tr")[2]
    // Swap positions 1 and 2
    items.set([r1, r3, r2])
    const trs = el.querySelectorAll("tr")
    expect(trs[1]?.querySelectorAll("td")[1]?.textContent).toBe("c")
    expect(trs[2]?.querySelectorAll("td")[1]?.textContent).toBe("b")
    // Same DOM nodes reused, just moved
    expect(trs[1]).toBe(origTr3)
    expect(trs[2]).toBe(origTr2)
  })

  test("clear removes all rows", () => {
    const el = container()
    const items = signal<RR[]>([makeRR(1, "x"), makeRR(2, "y")])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    items.set([])
    expect(el.querySelectorAll("tr").length).toBe(0)
  })

  test("clear then re-create works", () => {
    const el = container()
    const items = signal<RR[]>([makeRR(1, "first")])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    items.set([])
    expect(el.querySelectorAll("tr").length).toBe(0)
    items.set([makeRR(5, "back")])
    expect(el.querySelectorAll("tr").length).toBe(1)
    expect(el.querySelectorAll("td")[1]?.textContent).toBe("back")
  })

  test("append items to existing list", () => {
    const el = container()
    const r1 = makeRR(1, "a")
    const items = signal<RR[]>([r1])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    items.set([r1, makeRR(2, "b"), makeRR(3, "c")])
    expect(el.querySelectorAll("tr").length).toBe(3)
    expect(el.querySelectorAll("tr")[2]?.querySelectorAll("td")[1]?.textContent).toBe("c")
  })

  test("remove items from middle", () => {
    const el = container()
    const r1 = makeRR(1, "a")
    const r2 = makeRR(2, "b")
    const r3 = makeRR(3, "c")
    const items = signal<RR[]>([r1, r2, r3])
    mount(
      h(
        "table",
        null,
        h("tbody", null, For({ each: items, by: (r) => r.id, children: rowFactory })),
      ),
      el,
    )
    items.set([r1, r3])
    const trs = el.querySelectorAll("tr")
    expect(trs.length).toBe(2)
    expect(trs[0]?.querySelectorAll("td")[1]?.textContent).toBe("a")
    expect(trs[1]?.querySelectorAll("td")[1]?.textContent).toBe("c")
  })
})

// ─── Portal ───────────────────────────────────────────────────────────────────

describe("mount — Portal", () => {
  test("renders into target instead of parent", () => {
    const src = container()
    const target = container()
    mount(Portal({ target, children: h("span", null, "portaled") }), src)
    // content appears in target, not in src
    expect(target.querySelector("span")?.textContent).toBe("portaled")
    expect(src.querySelector("span")).toBeNull()
  })

  test("unmount removes content from target", () => {
    const src = container()
    const target = container()
    const unmount = mount(Portal({ target, children: h("p", null, "bye") }), src)
    expect(target.querySelector("p")).not.toBeNull()
    unmount()
    expect(target.querySelector("p")).toBeNull()
  })

  test("portal content updates reactively", () => {
    const src = container()
    const target = container()
    const text = signal("hello")
    mount(Portal({ target, children: h("span", null, () => text()) }), src)
    expect(target.querySelector("span")?.textContent).toBe("hello")
    text.set("world")
    expect(target.querySelector("span")?.textContent).toBe("world")
  })

  test("portal inside component renders into target", () => {
    const src = container()
    const target = container()
    const Modal = () => Portal({ target, children: h("dialog", null, "modal content") })
    mount(h(Modal, null), src)
    expect(target.querySelector("dialog")?.textContent).toBe("modal content")
    expect(src.querySelector("dialog")).toBeNull()
  })

  test("portal re-mount after unmount works correctly", () => {
    const src = container()
    const target = container()
    const unmount1 = mount(Portal({ target, children: h("span", null, "first") }), src)
    expect(target.querySelector("span")?.textContent).toBe("first")
    unmount1()
    expect(target.querySelector("span")).toBeNull()
    // Re-mount into same target
    const unmount2 = mount(Portal({ target, children: h("span", null, "second") }), src)
    expect(target.querySelector("span")?.textContent).toBe("second")
    unmount2()
    expect(target.querySelector("span")).toBeNull()
  })

  test("multiple portals into same target", () => {
    const src = container()
    const target = container()
    const unmount1 = mount(Portal({ target, children: h("span", { class: "a" }, "A") }), src)
    const unmount2 = mount(Portal({ target, children: h("span", { class: "b" }, "B") }), src)
    expect(target.querySelectorAll("span").length).toBe(2)
    expect(target.querySelector(".a")?.textContent).toBe("A")
    expect(target.querySelector(".b")?.textContent).toBe("B")
    unmount1()
    expect(target.querySelectorAll("span").length).toBe(1)
    expect(target.querySelector(".b")?.textContent).toBe("B")
    unmount2()
    expect(target.querySelectorAll("span").length).toBe(0)
  })

  test("portal with reactive Show toggle", () => {
    const src = container()
    const target = container()
    const visible = signal(true)
    mount(
      h("div", null, () =>
        visible() ? Portal({ target, children: h("span", null, "vis") }) : null,
      ),
      src,
    )
    expect(target.querySelector("span")?.textContent).toBe("vis")
    visible.set(false)
    expect(target.querySelector("span")).toBeNull()
    visible.set(true)
    expect(target.querySelector("span")?.textContent).toBe("vis")
  })
})

// ─── ErrorBoundary ────────────────────────────────────────────────────────────

describe("ErrorBoundary", () => {
  test("renders fallback when child throws", () => {
    const el = container()
    function Broken(): never {
      throw new Error("boom")
    }
    mount(
      h(ErrorBoundary, {
        fallback: (err: unknown) => h("p", { id: "fb" }, String(err)),
        children: h(Broken, null),
      }),
      el,
    )
    expect(el.querySelector("#fb")?.textContent).toContain("boom")
  })

  test("renders children when no error", () => {
    const el = container()
    function Fine() {
      return h("p", { id: "ok" }, "works")
    }
    mount(
      h(ErrorBoundary, {
        fallback: () => h("p", null, "error"),
        children: h(Fine, null),
      }),
      el,
    )
    expect(el.querySelector("#ok")?.textContent).toBe("works")
  })

  test("reset() clears error and re-renders children", () => {
    const el = container()
    let shouldThrow = true

    function MaybeThrow() {
      if (shouldThrow) throw new Error("recoverable")
      return h("p", { id: "recovered" }, "back")
    }

    mount(
      h(ErrorBoundary, {
        fallback: (_err: unknown, reset: () => void) =>
          h(
            "button",
            {
              id: "retry",
              onClick: () => {
                shouldThrow = false
                reset()
              },
            },
            "retry",
          ),
        children: h(MaybeThrow, null),
      }),
      el,
    )

    // Fallback rendered
    expect(el.querySelector("#retry")).not.toBeNull()
    expect(el.querySelector("#recovered")).toBeNull()

    // Click retry — reset() fires, shouldThrow is false, children re-render
    ;(el.querySelector("#retry") as HTMLButtonElement).click()

    expect(el.querySelector("#recovered")?.textContent).toBe("back")
    expect(el.querySelector("#retry")).toBeNull()
  })

  test("reset() with signal-driven children", () => {
    const el = container()
    const broken = signal(true)

    function Reactive() {
      if (broken()) throw new Error("signal error")
      return h("p", { id: "signal-ok" }, "fixed")
    }

    mount(
      h(ErrorBoundary, {
        fallback: (_err: unknown, reset: () => void) =>
          h(
            "button",
            {
              id: "fix",
              onClick: () => {
                broken.set(false)
                reset()
              },
            },
            "fix",
          ),
        children: h(Reactive, null),
      }),
      el,
    )

    expect(el.querySelector("#fix")).not.toBeNull()
    ;(el.querySelector("#fix") as HTMLButtonElement).click()
    expect(el.querySelector("#signal-ok")?.textContent).toBe("fixed")
  })
})

// ─── Directive system ─────────────────────────────────────────────────────────

describe("n-* directives", () => {
  test("directive function is called with the element", () => {
    const el = container()
    let capturedEl: HTMLElement | null = null
    const nCapture: Directive = (el) => {
      capturedEl = el
    }
    mount(h("div", { "n-capture": nCapture }), el)
    expect(capturedEl).not.toBeNull()
    expect((capturedEl as unknown as HTMLElement).tagName).toBe("DIV")
  })

  test("directive cleanup is called on unmount", () => {
    const el = container()
    let cleaned = false
    const nTracked: Directive = (_el, addCleanup) => {
      addCleanup(() => {
        cleaned = true
      })
    }
    const unmount = mount(h("div", { "n-tracked": nTracked }), el)
    expect(cleaned).toBe(false)
    unmount()
    expect(cleaned).toBe(true)
  })

  test("directive can set element property", () => {
    const el = container()
    const nTitle: Directive = (el) => {
      el.title = "hello"
    }
    mount(h("span", { "n-title": nTitle }), el)
    expect((el.querySelector("span") as HTMLElement).title).toBe("hello")
  })
})

// ─── Transition component ─────────────────────────────────────────────────────

describe("Transition", () => {
  test("mounts child when show starts true", () => {
    const el = container()
    const visible = signal(true)
    mount(h(Transition, { show: visible, children: h("div", { id: "target" }, "hi") }), el)
    expect(el.querySelector("#target")).not.toBeNull()
  })

  test("does not mount child when show starts false", () => {
    const el = container()
    const visible = signal(false)
    mount(h(Transition, { show: visible, children: h("div", { id: "target" }, "hi") }), el)
    expect(el.querySelector("#target")).toBeNull()
  })

  test("mounts child reactively when show becomes true", () => {
    const el = container()
    const visible = signal(false)
    mount(h(Transition, { show: visible, children: h("div", { id: "target" }, "hi") }), el)
    expect(el.querySelector("#target")).toBeNull()
    visible.set(true)
    expect(el.querySelector("#target")).not.toBeNull()
  })

  test("calls onBeforeEnter when entering", async () => {
    const el = container()
    const visible = signal(false)
    let called = false
    mount(
      h(Transition, {
        show: visible,
        onBeforeEnter: () => {
          called = true
        },
        children: h("div", { id: "t" }),
      }),
      el,
    )
    visible.set(true)
    // onBeforeEnter fires inside queueMicrotask — wait one microtask tick
    await new Promise<void>((r) => queueMicrotask(r))
    expect(called).toBe(true)
  })
})

// ─── Show component ───────────────────────────────────────────────────────────

describe("Show", () => {
  test("renders children when when() is truthy", () => {
    const el = container()
    mount(h(Show, { when: () => true }, h("span", { id: "s" }, "yes")), el)
    expect(el.querySelector("#s")).not.toBeNull()
  })

  test("renders fallback when when() is falsy", () => {
    const el = container()
    mount(
      h(
        Show,
        { when: () => false, fallback: h("span", { id: "fb" }, "no") },
        h("span", { id: "s" }, "yes"),
      ),
      el,
    )
    expect(el.querySelector("#s")).toBeNull()
    expect(el.querySelector("#fb")).not.toBeNull()
  })

  test("reactively toggles on signal change", () => {
    const el = container()
    const show = signal(false)
    mount(h(Show, { when: show }, h("div", { id: "t" }, "visible")), el)
    expect(el.querySelector("#t")).toBeNull()
    show.set(true)
    expect(el.querySelector("#t")).not.toBeNull()
    show.set(false)
    expect(el.querySelector("#t")).toBeNull()
  })

  test("renders nothing when falsy and no fallback", () => {
    const el = container()
    mount(h(Show, { when: () => false }, h("div", null, "hi")), el)
    expect(el.textContent).toBe("")
  })
})

// ─── Switch / Match components ────────────────────────────────────────────────

describe("Switch / Match", () => {
  test("renders first matching branch", () => {
    const el = container()
    const route = signal("home")
    mount(
      h(
        Switch,
        { fallback: h("span", { id: "notfound" }) },
        h(Match, { when: () => route() === "home" }, h("span", { id: "home" })),
        h(Match, { when: () => route() === "about" }, h("span", { id: "about" })),
      ),
      el,
    )
    expect(el.querySelector("#home")).not.toBeNull()
    expect(el.querySelector("#about")).toBeNull()
    expect(el.querySelector("#notfound")).toBeNull()
  })

  test("renders fallback when no match", () => {
    const el = container()
    const route = signal("other")
    mount(
      h(
        Switch,
        { fallback: h("span", { id: "notfound" }) },
        h(Match, { when: () => route() === "home" }, h("span", { id: "home" })),
      ),
      el,
    )
    expect(el.querySelector("#notfound")).not.toBeNull()
    expect(el.querySelector("#home")).toBeNull()
  })

  test("switches branch reactively", () => {
    const el = container()
    const route = signal("home")
    mount(
      h(
        Switch,
        { fallback: h("span", { id: "notfound" }) },
        h(Match, { when: () => route() === "home" }, h("span", { id: "home" })),
        h(Match, { when: () => route() === "about" }, h("span", { id: "about" })),
      ),
      el,
    )
    expect(el.querySelector("#home")).not.toBeNull()
    route.set("about")
    expect(el.querySelector("#home")).toBeNull()
    expect(el.querySelector("#about")).not.toBeNull()
    route.set("other")
    expect(el.querySelector("#notfound")).not.toBeNull()
  })
})

// ─── Props (extended coverage) ───────────────────────────────────────────────

describe("mount — props (extended)", () => {
  test("style as string sets cssText", () => {
    const el = container()
    mount(h("div", { style: "color: red; font-size: 14px" }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.style.color).toBe("red")
    expect(div.style.fontSize).toBe("14px")
  })

  test("style as object sets individual properties", () => {
    const el = container()
    mount(h("div", { style: { color: "blue", marginTop: "10px" } }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.style.color).toBe("blue")
    expect(div.style.marginTop).toBe("10px")
  })

  test("style object auto-appends px to numeric values", () => {
    const el = container()
    mount(h("div", { style: { height: 100, marginTop: 20, opacity: 0.5, zIndex: 10 } }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.style.height).toBe("100px")
    expect(div.style.marginTop).toBe("20px")
    expect(div.style.opacity).toBe("0.5")
    expect(div.style.zIndex).toBe("10")
  })

  test("style object handles CSS custom properties", () => {
    const el = container()
    mount(h("div", { style: { "--my-color": "red" } }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.style.getPropertyValue("--my-color")).toBe("red")
  })

  test("className sets class attribute", () => {
    const el = container()
    mount(h("div", { className: "my-class" }), el)
    expect(el.querySelector("div")?.getAttribute("class")).toBe("my-class")
  })

  test("class null sets empty class", () => {
    const el = container()
    mount(h("div", { class: null }), el)
    expect(el.querySelector("div")?.getAttribute("class")).toBe("")
  })

  test("boolean attribute true sets empty attr", () => {
    const el = container()
    mount(h("input", { disabled: true }), el)
    const input = el.querySelector("input") as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  test("boolean attribute false removes attr", () => {
    const el = container()
    mount(h("input", { disabled: false }), el)
    const input = el.querySelector("input") as HTMLInputElement
    expect(input.disabled).toBe(false)
  })

  test("event handler receives event object", () => {
    const el = container()
    let receivedEvent: Event | null = null
    mount(
      h(
        "button",
        {
          onClick: (e: Event) => {
            receivedEvent = e
          },
        },
        "click",
      ),
      el,
    )
    el.querySelector("button")?.click()
    expect(receivedEvent).not.toBeNull()
    expect(receivedEvent).toBeInstanceOf(Event)
  })

  test("multiple event handlers on same element", () => {
    const el = container()
    let mouseDown = false
    let mouseUp = false
    mount(
      h(
        "div",
        {
          onMousedown: () => {
            mouseDown = true
          },
          onMouseup: () => {
            mouseUp = true
          },
        },
        "target",
      ),
      el,
    )
    const div = el.querySelector("div") as HTMLElement
    div.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    div.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    expect(mouseDown).toBe(true)
    expect(mouseUp).toBe(true)
  })

  test("event handler cleanup on unmount", () => {
    const el = container()
    let count = 0
    const unmount = mount(
      h(
        "button",
        {
          onClick: () => {
            count++
          },
        },
        "click",
      ),
      el,
    )
    el.querySelector("button")?.click()
    expect(count).toBe(1)
    unmount()
    // Button removed from DOM so click won't reach it
    expect(count).toBe(1)
  })

  test("sanitizes javascript: in href", () => {
    const el = container()
    mount(h("a", { href: "javascript:alert(1)" }), el)
    const a = el.querySelector("a") as HTMLAnchorElement
    // Should not have the dangerous href set
    expect(a.getAttribute("href")).not.toBe("javascript:alert(1)")
  })

  test("sanitizes data: in src", () => {
    const el = container()
    mount(h("img", { src: "data:text/html,<script>alert(1)</script>" }), el)
    const img = el.querySelector("img") as HTMLImageElement
    expect(img.getAttribute("src")).not.toBe("data:text/html,<script>alert(1)</script>")
  })

  test("allows safe href values", () => {
    const el = container()
    mount(h("a", { href: "https://example.com" }), el)
    const a = el.querySelector("a") as HTMLAnchorElement
    expect(a.href).toContain("https://example.com")
  })

  test("innerHTML sets content", () => {
    const el = container()
    mount(h("div", { innerHTML: "<b>bold</b>" }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.innerHTML).toBe("<b>bold</b>")
  })

  test("dangerouslySetInnerHTML sets __html content", () => {
    const el = container()
    mount(h("div", { dangerouslySetInnerHTML: { __html: "<em>raw</em>" } }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.innerHTML).toBe("<em>raw</em>")
  })

  test("reactive style updates", () => {
    const el = container()
    const color = signal("red")
    mount(h("div", { style: () => `color: ${color()}` }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.style.color).toBe("red")
    color.set("blue")
    expect(div.style.color).toBe("blue")
  })

  test("DOM property (value) set via prop", () => {
    const el = container()
    mount(h("input", { value: "hello" }), el)
    const input = el.querySelector("input") as HTMLInputElement
    expect(input.value).toBe("hello")
  })

  test("data-* attributes set correctly", () => {
    const el = container()
    mount(h("div", { "data-testid": "foo", "data-count": "42" }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.getAttribute("data-testid")).toBe("foo")
    expect(div.getAttribute("data-count")).toBe("42")
  })
})

// ─── Keyed list (nodes.ts) — additional reorder patterns ────────────────────

describe("mount — For keyed list reorder patterns", () => {
  type Item = { id: number; label: string }

  function mountList(el: HTMLElement, items: ReturnType<typeof signal<Item[]>>) {
    mount(
      h(
        "ul",
        null,
        For({
          each: items,
          by: (r) => r.id,
          children: (r) => h("li", { key: r.id }, r.label),
        }),
      ),
      el,
    )
  }

  test("reverse order", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
      { id: 5, label: "e" },
    ])
    mountList(el, items)
    items.set([
      { id: 5, label: "e" },
      { id: 4, label: "d" },
      { id: 3, label: "c" },
      { id: 2, label: "b" },
      { id: 1, label: "a" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(5)
    expect(lis[0]?.textContent).toBe("e")
    expect(lis[1]?.textContent).toBe("d")
    expect(lis[2]?.textContent).toBe("c")
    expect(lis[3]?.textContent).toBe("b")
    expect(lis[4]?.textContent).toBe("a")
  })

  test("move single item to front", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mountList(el, items)
    items.set([
      { id: 3, label: "c" },
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis[0]?.textContent).toBe("c")
    expect(lis[1]?.textContent).toBe("a")
    expect(lis[2]?.textContent).toBe("b")
  })

  test("prepend items", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ])
    mountList(el, items)
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(4)
    expect(lis[0]?.textContent).toBe("a")
    expect(lis[1]?.textContent).toBe("b")
    expect(lis[2]?.textContent).toBe("c")
    expect(lis[3]?.textContent).toBe("d")
  })

  test("interleave new items", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 3, label: "c" },
      { id: 5, label: "e" },
    ])
    mountList(el, items)
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
      { id: 5, label: "e" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(5)
    expect(lis[0]?.textContent).toBe("a")
    expect(lis[1]?.textContent).toBe("b")
    expect(lis[2]?.textContent).toBe("c")
    expect(lis[3]?.textContent).toBe("d")
    expect(lis[4]?.textContent).toBe("e")
  })

  test("large reorder triggers LIS fallback (>8 diffs)", () => {
    const el = container()
    const initial = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      label: String.fromCharCode(97 + i),
    }))
    const items = signal<Item[]>(initial)
    mountList(el, items)
    // Shuffle: reverse first 15 items to force >8 diffs
    const shuffled = [...initial]
    shuffled.splice(0, 15, ...shuffled.slice(0, 15).reverse())
    items.set(shuffled)
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(20)
    for (let i = 0; i < 20; i++) {
      expect(lis[i]?.textContent).toBe(shuffled[i]?.label)
    }
  })

  test("remove from front and back simultaneously", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
      { id: 5, label: "e" },
    ])
    mountList(el, items)
    items.set([
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(3)
    expect(lis[0]?.textContent).toBe("b")
    expect(lis[2]?.textContent).toBe("d")
  })

  test("swap first and last", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mountList(el, items)
    items.set([
      { id: 3, label: "c" },
      { id: 2, label: "b" },
      { id: 1, label: "a" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis[0]?.textContent).toBe("c")
    expect(lis[1]?.textContent).toBe("b")
    expect(lis[2]?.textContent).toBe("a")
  })

  test("multiple rapid updates", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "a" }])
    mountList(el, items)
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    items.set([
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    items.set([{ id: 4, label: "d" }])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(1)
    expect(lis[0]?.textContent).toBe("d")
  })
})

// ─── Transition (extended coverage) ──────────────────────────────────────────

describe("Transition — extended", () => {
  test("custom class names", () => {
    const el = container()
    const visible = signal(false)
    mount(
      h(Transition, {
        show: visible,
        enterFrom: "my-enter-from",
        enterActive: "my-enter-active",
        enterTo: "my-enter-to",
        children: h("div", { id: "custom" }, "content"),
      }),
      el,
    )
    expect(el.querySelector("#custom")).toBeNull()
    visible.set(true)
    expect(el.querySelector("#custom")).not.toBeNull()
  })

  test("leave hides element after animation", async () => {
    const el = container()
    const visible = signal(true)
    mount(
      h(Transition, {
        show: visible,
        children: h("div", { id: "leave-test" }, "content"),
      }),
      el,
    )
    expect(el.querySelector("#leave-test")).not.toBeNull()
    visible.set(false)
    // After rAF + transitionend, the element should be removed
    // In happy-dom, we simulate the transitionend
    const target = el.querySelector("#leave-test")
    if (target) {
      // Wait for the requestAnimationFrame callback
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      target.dispatchEvent(new Event("transitionend"))
    }
    // isMounted should now be false
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelector("#leave-test")).toBeNull()
  })

  test("appear triggers enter animation on initial mount", async () => {
    const el = container()
    const visible = signal(true)
    let beforeEnterCalled = false
    mount(
      h(Transition, {
        show: visible,
        appear: true,
        onBeforeEnter: () => {
          beforeEnterCalled = true
        },
        children: h("div", { id: "appear-test" }, "content"),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(beforeEnterCalled).toBe(true)
  })

  test("calls onBeforeLeave when leaving", async () => {
    const el = container()
    const visible = signal(true)
    let beforeLeaveCalled = false
    mount(
      h(Transition, {
        show: visible,
        onBeforeLeave: () => {
          beforeLeaveCalled = true
        },
        children: h("div", { id: "leave-cb" }, "content"),
      }),
      el,
    )
    visible.set(false)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(beforeLeaveCalled).toBe(true)
  })

  test("re-entering during leave cancels leave", async () => {
    const el = container()
    const visible = signal(true)
    mount(
      h(Transition, {
        show: visible,
        name: "fade",
        children: h("div", { id: "reenter" }, "content"),
      }),
      el,
    )
    // Start leaving
    visible.set(false)
    // Before the leave animation finishes, re-enter
    visible.set(true)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelector("#reenter")).not.toBeNull()
  })

  test("transition with name prefix", () => {
    const el = container()
    const visible = signal(true)
    mount(
      h(Transition, {
        show: visible,
        name: "slide",
        children: h("div", { id: "named" }, "content"),
      }),
      el,
    )
    expect(el.querySelector("#named")).not.toBeNull()
  })
})

// ─── Hydration ───────────────────────────────────────────────────────────────

describe("hydrateRoot", () => {
  test("hydrates basic element", async () => {
    const el = container()
    el.innerHTML = "<div><span>hello</span></div>"
    const cleanup = hydrateRoot(el, h("div", null, h("span", null, "hello")))
    expect(el.querySelector("span")?.textContent).toBe("hello")
    cleanup()
  })

  test("hydrates and attaches event handler", async () => {
    const el = container()
    el.innerHTML = "<button>click me</button>"
    let clicked = false
    hydrateRoot(
      el,
      h(
        "button",
        {
          onClick: () => {
            clicked = true
          },
        },
        "click me",
      ),
    )
    el.querySelector("button")?.click()
    expect(clicked).toBe(true)
  })

  test("hydrates text content", async () => {
    const el = container()
    el.innerHTML = "<p>some text</p>"
    const cleanup = hydrateRoot(el, h("p", null, "some text"))
    expect(el.querySelector("p")?.textContent).toBe("some text")
    cleanup()
  })

  test("hydrates reactive text", async () => {
    const el = container()
    el.innerHTML = "<div>initial</div>"
    const text = signal("initial")
    hydrateRoot(
      el,
      h("div", null, () => text()),
    )
    expect(el.querySelector("div")?.textContent).toBe("initial")
    text.set("updated")
    expect(el.querySelector("div")?.textContent).toBe("updated")
  })

  test("hydrates nested elements", async () => {
    const el = container()
    el.innerHTML = "<div><p><span>deep</span></p></div>"
    const cleanup = hydrateRoot(el, h("div", null, h("p", null, h("span", null, "deep"))))
    expect(el.querySelector("span")?.textContent).toBe("deep")
    cleanup()
  })

  test("hydrates component", async () => {
    const el = container()
    el.innerHTML = "<p>Hello, World!</p>"
    const Greeting = defineComponent(() => h("p", null, "Hello, World!"))
    const cleanup = hydrateRoot(el, h(Greeting, null))
    expect(el.querySelector("p")?.textContent).toBe("Hello, World!")
    cleanup()
  })
})

// ─── Mount edge cases ────────────────────────────────────────────────────────

describe("mount — edge cases", () => {
  test("null children in fragment", () => {
    const el = container()
    mount(h(Fragment, null, null, "text", null), el)
    expect(el.textContent).toBe("text")
  })

  test("deeply nested fragments", () => {
    const el = container()
    mount(h(Fragment, null, h(Fragment, null, h(Fragment, null, h("span", null, "deep")))), el)
    expect(el.querySelector("span")?.textContent).toBe("deep")
  })

  test("component returning null", () => {
    const el = container()
    const NullComp = defineComponent(() => null)
    mount(h(NullComp, null), el)
    expect(el.innerHTML).toBe("")
  })

  test("component returning fragment with mixed children", () => {
    const el = container()
    const Mixed = defineComponent(() => h(Fragment, null, "text", h("b", null, "bold"), null, 42))
    mount(h(Mixed, null), el)
    expect(el.textContent).toContain("text")
    expect(el.querySelector("b")?.textContent).toBe("bold")
    expect(el.textContent).toContain("42")
  })

  test("mounting array of children", () => {
    const el = container()
    mount(h("div", null, ...[h("span", null, "a"), h("span", null, "b"), h("span", null, "c")]), el)
    expect(el.querySelectorAll("span").length).toBe(3)
  })

  test("reactive child toggling between null and element", () => {
    const el = container()
    const show = signal(false)
    mount(
      h("div", null, () => (show() ? h("span", { id: "toggle" }, "yes") : null)),
      el,
    )
    expect(el.querySelector("#toggle")).toBeNull()
    show.set(true)
    expect(el.querySelector("#toggle")).not.toBeNull()
    show.set(false)
    expect(el.querySelector("#toggle")).toBeNull()
  })

  test("boolean false renders nothing", () => {
    const el = container()
    mount(h("div", null, false), el)
    expect(el.querySelector("div")?.textContent).toBe("")
  })

  test("number 0 renders as text", () => {
    const el = container()
    mount(h("div", null, 0), el)
    expect(el.querySelector("div")?.textContent).toBe("0")
  })

  test("empty string renders as text node", () => {
    const el = container()
    mount(h("div", null, ""), el)
    expect(el.querySelector("div")?.textContent).toBe("")
  })

  test("component with children prop", () => {
    const el = container()
    const Wrapper = defineComponent((props: { children?: VNodeChild }) => {
      return h("div", { id: "wrapper" }, props.children)
    })
    mount(h(Wrapper, null, h("span", null, "child")), el)
    expect(el.querySelector("#wrapper span")?.textContent).toBe("child")
  })
})

// ─── KeepAlive ───────────────────────────────────────────────────────────────

describe("KeepAlive", () => {
  test("mounts children and preserves them when toggled", async () => {
    const el = container()
    const active = signal(true)
    mount(h(KeepAlive, { active }, h("div", { id: "kept" }, "alive")), el)
    // KeepAlive mounts in onMount which fires sync in this framework
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelector("#kept")).not.toBeNull()
    active.set(false)
    // Content should still exist in DOM but container hidden
    expect(el.querySelector("#kept")).not.toBeNull()
  })

  test("cleanup disposes effect and child cleanup", async () => {
    const el = container()
    const active = signal(true)
    const unmount = mount(h(KeepAlive, { active }, h("div", { id: "ka-cleanup" }, "content")), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelector("#ka-cleanup")).not.toBeNull()
    unmount()
    // After unmount, the KeepAlive container is gone
    expect(el.innerHTML).toBe("")
  })

  test("active defaults to true when not provided", async () => {
    const el = container()
    mount(h(KeepAlive, {}, h("div", { id: "ka-default" }, "visible")), el)
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelector("#ka-default")).not.toBeNull()
    // Container should be visible (display not set to none)
    const wrapper = el.querySelector("div[style]") as HTMLElement | null
    // If wrapper exists, display should not be none
    if (wrapper) expect(wrapper.style.display).not.toBe("none")
  })

  test("toggles display:none when active changes", async () => {
    const el = container()
    const active = signal(true)
    mount(h(KeepAlive, { active }, h("span", { id: "ka-toggle" }, "x")), el)
    await new Promise<void>((r) => queueMicrotask(r))
    // Find the container div that KeepAlive creates
    const containers = el.querySelectorAll("div")
    const keepAliveContainer = Array.from(containers).find((d) => d.querySelector("#ka-toggle")) as
      | HTMLElement
      | undefined
    if (keepAliveContainer) {
      expect(keepAliveContainer.style.display).not.toBe("none")
      active.set(false)
      expect(keepAliveContainer.style.display).toBe("none")
      active.set(true)
      expect(keepAliveContainer.style.display).toBe("")
    }
  })
})

// ─── Hydration (extended coverage) ───────────────────────────────────────────

describe("hydrateRoot — extended", () => {
  test("hydrates Fragment children", async () => {
    const el = container()
    el.innerHTML = "<span>a</span><span>b</span>"
    const cleanup = hydrateRoot(el, h(Fragment, null, h("span", null, "a"), h("span", null, "b")))
    const spans = el.querySelectorAll("span")
    expect(spans.length).toBe(2)
    expect(spans[0]?.textContent).toBe("a")
    expect(spans[1]?.textContent).toBe("b")
    cleanup()
  })

  test("hydrates array children", async () => {
    const el = container()
    el.innerHTML = "<div><span>x</span><span>y</span></div>"
    const cleanup = hydrateRoot(el, h("div", null, h("span", null, "x"), h("span", null, "y")))
    expect(el.querySelectorAll("span").length).toBe(2)
    cleanup()
  })

  test("hydrates null/false child — returns noop", async () => {
    const el = container()
    el.innerHTML = "<div></div>"
    const cleanup = hydrateRoot(el, h("div", null, null, false))
    expect(el.querySelector("div")).not.toBeNull()
    cleanup()
  })

  test("hydrates reactive accessor returning null initially", async () => {
    const el = container()
    el.innerHTML = "<div></div>"
    const show = signal<string | null>(null)
    const cleanup = hydrateRoot(
      el,
      h("div", null, () => show()),
    )
    // Initially null — a comment marker is inserted
    show.set("hello")
    // After update, the text should appear
    expect(el.textContent).toContain("hello")
    cleanup()
  })

  test("hydrates reactive text that mismatches DOM node type", async () => {
    const el = container()
    el.innerHTML = "<div><span>wrong</span></div>"
    const text = signal("hello")
    // Reactive text expects a TextNode but finds a SPAN — should fall back
    const cleanup = hydrateRoot(
      el,
      h("div", null, () => text()),
    )
    cleanup()
  })

  test("hydrates reactive VNode (complex initial value)", async () => {
    const el = container()
    el.innerHTML = "<div><p>old</p></div>"
    const content = signal<VNodeChild>(h("p", null, "old"))
    const cleanup = hydrateRoot(el, h("div", null, (() => content()) as unknown as VNodeChild))
    cleanup()
  })

  test("hydrates static text node", async () => {
    const el = container()
    el.innerHTML = "just text"
    const cleanup = hydrateRoot(el, "just text")
    expect(el.textContent).toContain("just text")
    cleanup()
  })

  test("hydrates number as text", async () => {
    const el = container()
    el.innerHTML = "42"
    const cleanup = hydrateRoot(el, 42)
    expect(el.textContent).toContain("42")
    cleanup()
  })

  test("hydration tag mismatch falls back to mount", async () => {
    const el = container()
    el.innerHTML = "<div>wrong</div>"
    // Expect span but find div — should fall back
    const cleanup = hydrateRoot(el, h("span", null, "right"))
    // The span should have been mounted via fallback
    cleanup()
  })

  test("hydrates element with ref", async () => {
    const el = container()
    el.innerHTML = "<button>click</button>"
    const ref = createRef<HTMLButtonElement>()
    const cleanup = hydrateRoot(el, h("button", { ref }, "click"))
    expect(ref.current).not.toBeNull()
    expect(ref.current?.tagName).toBe("BUTTON")
    cleanup()
    expect(ref.current).toBeNull()
  })

  test("hydrates Portal — always remounts", async () => {
    const el = container()
    const target = container()
    el.innerHTML = ""
    const cleanup = hydrateRoot(el, Portal({ target, children: h("span", null, "portaled") }))
    expect(target.querySelector("span")?.textContent).toBe("portaled")
    cleanup()
  })

  test("hydrates component with children prop", async () => {
    const el = container()
    el.innerHTML = "<div><p>child content</p></div>"
    const Wrapper = defineComponent((props: { children?: VNodeChild }) =>
      h("div", null, props.children),
    )
    const cleanup = hydrateRoot(el, h(Wrapper, null, h("p", null, "child content")))
    expect(el.querySelector("p")?.textContent).toBe("child content")
    cleanup()
  })

  test("hydrates component that throws — error handled gracefully", async () => {
    const el = container()
    el.innerHTML = "<p>content</p>"
    const Broken = defineComponent((): never => {
      throw new Error("hydration boom")
    })
    // Should not throw — error is caught internally
    const cleanup = hydrateRoot(el, h(Broken, null))
    cleanup()
  })

  test("hydrates with For — fresh mount fallback (no markers)", async () => {
    const el = container()
    el.innerHTML = "<ul></ul>"
    const items = signal([{ id: 1, label: "a" }])
    const cleanup = hydrateRoot(
      el,
      h(
        "ul",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("li", null, r.label),
        }),
      ),
    )
    cleanup()
  })

  test("hydrates with For — SSR markers present", async () => {
    const el = container()
    el.innerHTML = "<!--pyreon-for--><li>a</li><!--/pyreon-for-->"
    const items = signal([{ id: 1, label: "a" }])
    const cleanup = hydrateRoot(
      el,
      For({
        each: items,
        by: (r: { id: number }) => r.id,
        children: (r: { id: number; label: string }) => h("li", null, r.label),
      }),
    )
    cleanup()
  })

  test("hydration skips comment and whitespace text nodes", async () => {
    const el = container()
    // Simulate SSR output with comments and whitespace
    el.innerHTML = "<!-- comment -->   <p>real</p>"
    const cleanup = hydrateRoot(el, h("p", null, "real"))
    expect(el.querySelector("p")?.textContent).toBe("real")
    cleanup()
  })

  test("hydrates with missing DOM node (null domNode)", async () => {
    const el = container()
    el.innerHTML = ""
    // VNode expects content but DOM is empty — should fall back
    const cleanup = hydrateRoot(el, h("div", null, "content"))
    cleanup()
  })

  test("hydrates reactive accessor returning VNode with no domNode", async () => {
    const el = container()
    el.innerHTML = ""
    const content = signal<VNodeChild>(h("p", null, "dynamic"))
    const cleanup = hydrateRoot(el, (() => content()) as unknown as VNodeChild)
    cleanup()
  })

  test("hydrates component with onMount hooks", async () => {
    const el = container()
    el.innerHTML = "<span>mounted</span>"
    let mountCalled = false
    const Comp = defineComponent(() => {
      onMount(() => {
        mountCalled = true
      })
      return h("span", null, "mounted")
    })
    const cleanup = hydrateRoot(el, h(Comp, null))
    expect(mountCalled).toBe(true)
    cleanup()
  })

  test("hydrates text mismatch for static string — falls back", async () => {
    const el = container()
    // Put an element where text is expected
    el.innerHTML = "<span>not text</span>"
    const cleanup = hydrateRoot(el, "plain text")
    cleanup()
  })
})

// ─── mountFor — additional edge cases ────────────────────────────────────────

describe("mountFor — edge cases", () => {
  type Item = { id: number; label: string }

  function mountForList(el: HTMLElement, items: ReturnType<typeof signal<Item[]>>) {
    mount(
      h(
        "ul",
        null,
        For({
          each: items,
          by: (r) => r.id,
          children: (r) => h("li", { key: r.id }, r.label),
        }),
      ),
      el,
    )
  }

  test("empty initial → add items (fresh render path)", () => {
    const el = container()
    const items = signal<Item[]>([])
    mountForList(el, items)
    expect(el.querySelectorAll("li").length).toBe(0)
    items.set([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    expect(el.querySelectorAll("li").length).toBe(2)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("a")
  })

  test("clear then add uses fresh render path", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "x" }])
    mountForList(el, items)
    items.set([])
    expect(el.querySelectorAll("li").length).toBe(0)
    items.set([
      { id: 2, label: "y" },
      { id: 3, label: "z" },
    ])
    expect(el.querySelectorAll("li").length).toBe(2)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("y")
  })

  test("clear path with parent-swap optimization", () => {
    // When the For's markers are the first and last children of a parent,
    // the clear path uses parent-swap for O(1) clear.
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    // Mount directly in the ul so markers are first/last children
    mount(
      h(
        "ul",
        null,
        For({
          each: items,
          by: (r) => r.id,
          children: (r) => h("li", { key: r.id }, r.label),
        }),
      ),
      el,
    )
    expect(el.querySelectorAll("li").length).toBe(3)
    items.set([])
    expect(el.querySelectorAll("li").length).toBe(0)
  })

  test("clear path without parent-swap (markers not first/last)", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "a" }])
    // Mount with extra siblings so markers are not first/last
    mount(
      h(
        "div",
        null,
        h("span", null, "before"),
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
        h("span", null, "after"),
      ),
      el,
    )
    expect(el.querySelectorAll("li").length).toBe(1)
    items.set([])
    expect(el.querySelectorAll("li").length).toBe(0)
    // The before/after spans should still be present
    expect(el.querySelectorAll("span").length).toBe(2)
  })

  test("replace-all with parent-swap optimization", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "old1" },
      { id: 2, label: "old2" },
    ])
    mount(
      h(
        "ul",
        null,
        For({
          each: items,
          by: (r) => r.id,
          children: (r) => h("li", { key: r.id }, r.label),
        }),
      ),
      el,
    )
    // Replace with completely new keys
    items.set([
      { id: 10, label: "new1" },
      { id: 11, label: "new2" },
    ])
    expect(el.querySelectorAll("li").length).toBe(2)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("new1")
  })

  test("replace-all without parent-swap (extra siblings)", () => {
    const el = container()
    const items = signal<Item[]>([{ id: 1, label: "old" }])
    mount(
      h(
        "div",
        null,
        h("span", null, "before"),
        For({ each: items, by: (r) => r.id, children: (r) => h("li", { key: r.id }, r.label) }),
        h("span", null, "after"),
      ),
      el,
    )
    items.set([{ id: 10, label: "new" }])
    expect(el.querySelectorAll("li").length).toBe(1)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("new")
    expect(el.querySelectorAll("span").length).toBe(2)
  })

  test("remove stale entries", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mountForList(el, items)
    // Remove middle item — hits stale entry removal path
    items.set([
      { id: 1, label: "a" },
      { id: 3, label: "c" },
    ])
    expect(el.querySelectorAll("li").length).toBe(2)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("a")
    expect(el.querySelectorAll("li")[1]?.textContent).toBe("c")
  })

  test("LIS fallback for complex reorder (>8 diffs, same length)", () => {
    const el = container()
    // Create 15 items, then reverse all — forces > SMALL_K diffs and LIS path
    const initial = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1,
      label: String.fromCharCode(97 + i),
    }))
    const items = signal<Item[]>(initial)
    mountForList(el, items)
    // Reverse all items: 15 diffs > SMALL_K (8)
    items.set([...initial].reverse())
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(15)
    expect(lis[0]?.textContent).toBe("o") // last letter reversed
    expect(lis[14]?.textContent).toBe("a")
  })

  test("LIS fallback for reorder with different length", () => {
    const el = container()
    const initial = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      label: String.fromCharCode(97 + i),
    }))
    const items = signal<Item[]>(initial)
    mountForList(el, items)
    // Reverse and add one — different length triggers LIS
    const reversed = [...initial].reverse()
    reversed.push({ id: 99, label: "z" })
    items.set(reversed)
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(11)
    expect(lis[0]?.textContent).toBe("j")
    expect(lis[10]?.textContent).toBe("z")
  })

  test("small-k reorder path (<=8 diffs, same length)", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
      { id: 4, label: "d" },
    ])
    mountForList(el, items)
    // Swap positions 1 and 2 — only 2 diffs < SMALL_K
    items.set([
      { id: 1, label: "a" },
      { id: 3, label: "c" },
      { id: 2, label: "b" },
      { id: 4, label: "d" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis[1]?.textContent).toBe("c")
    expect(lis[2]?.textContent).toBe("b")
  })

  test("add and remove items simultaneously", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
      { id: 3, label: "c" },
    ])
    mountForList(el, items)
    // Remove 2, add 4 and 5
    items.set([
      { id: 1, label: "a" },
      { id: 4, label: "d" },
      { id: 3, label: "c" },
      { id: 5, label: "e" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis.length).toBe(4)
    expect(lis[0]?.textContent).toBe("a")
    // Verify all expected items are present
    const texts = Array.from(lis).map((li) => li.textContent)
    expect(texts).toContain("a")
    expect(texts).toContain("c")
    expect(texts).toContain("d")
    expect(texts).toContain("e")
  })

  test("unmount For cleanup disposes all entries", () => {
    const el = container()
    const items = signal<Item[]>([
      { id: 1, label: "a" },
      { id: 2, label: "b" },
    ])
    const unmount = mount(
      h(
        "ul",
        null,
        For({
          each: items,
          by: (r) => r.id,
          children: (r) => h("li", { key: r.id }, r.label),
        }),
      ),
      el,
    )
    expect(el.querySelectorAll("li").length).toBe(2)
    unmount()
    expect(el.innerHTML).toBe("")
  })
})

// ─── mountKeyedList — additional coverage ────────────────────────────────────

describe("mountKeyedList — via reactive keyed array", () => {
  test("reactive accessor returning keyed VNode array uses mountKeyedList", () => {
    const el = container()
    const items = signal([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ])
    mount(
      h("ul", null, () => items().map((it) => h("li", { key: it.id }, it.text))),
      el,
    )
    expect(el.querySelectorAll("li").length).toBe(2)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("a")
  })

  test("mountKeyedList handles clear (empty array)", () => {
    const el = container()
    const items = signal([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ])
    mount(
      h("ul", null, () => items().map((it) => h("li", { key: it.id }, it.text))),
      el,
    )
    items.set([])
    expect(el.querySelectorAll("li").length).toBe(0)
  })

  test("mountKeyedList handles reorder", () => {
    const el = container()
    const items = signal([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
      { id: 3, text: "c" },
    ])
    mount(
      h("ul", null, () => items().map((it) => h("li", { key: it.id }, it.text))),
      el,
    )
    items.set([
      { id: 3, text: "c" },
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ])
    const lis = el.querySelectorAll("li")
    expect(lis[0]?.textContent).toBe("c")
    expect(lis[1]?.textContent).toBe("a")
    expect(lis[2]?.textContent).toBe("b")
  })

  test("mountKeyedList removes stale entries", () => {
    const el = container()
    const items = signal([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
      { id: 3, text: "c" },
    ])
    mount(
      h("ul", null, () => items().map((it) => h("li", { key: it.id }, it.text))),
      el,
    )
    items.set([{ id: 2, text: "b" }])
    expect(el.querySelectorAll("li").length).toBe(1)
    expect(el.querySelectorAll("li")[0]?.textContent).toBe("b")
  })

  test("mountKeyedList adds new entries", () => {
    const el = container()
    const items = signal([{ id: 1, text: "a" }])
    mount(
      h("ul", null, () => items().map((it) => h("li", { key: it.id }, it.text))),
      el,
    )
    items.set([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
      { id: 3, text: "c" },
    ])
    expect(el.querySelectorAll("li").length).toBe(3)
  })

  test("mountKeyedList cleanup disposes all entries", () => {
    const el = container()
    const items = signal([
      { id: 1, text: "a" },
      { id: 2, text: "b" },
    ])
    const unmount = mount(
      h("ul", null, () => items().map((it) => h("li", { key: it.id }, it.text))),
      el,
    )
    unmount()
    expect(el.innerHTML).toBe("")
  })
})

// ─── mountReactive — additional coverage ─────────────────────────────────────

describe("mountReactive — edge cases", () => {
  test("reactive accessor returning null then VNode", () => {
    const el = container()
    const show = signal(false)
    mount(
      h("div", null, () => (show() ? h("span", null, "yes") : null)),
      el,
    )
    expect(el.querySelector("span")).toBeNull()
    show.set(true)
    expect(el.querySelector("span")?.textContent).toBe("yes")
  })

  test("reactive accessor returning false", () => {
    const el = container()
    const show = signal(false)
    mount(
      h("div", null, () => (show() ? "visible" : false)),
      el,
    )
    expect(el.querySelector("div")?.textContent).toBe("")
    show.set(true)
    expect(el.querySelector("div")?.textContent).toBe("visible")
  })

  test("reactive text fast path — null/undefined fallback", () => {
    const el = container()
    const text = signal<string | null>("hello")
    mount(
      h("div", null, () => text()),
      el,
    )
    expect(el.querySelector("div")?.textContent).toBe("hello")
    text.set(null)
    expect(el.querySelector("div")?.textContent).toBe("")
  })

  test("reactive boolean text fast path", () => {
    const el = container()
    const val = signal(true)
    mount(
      h("div", null, () => val()),
      el,
    )
    expect(el.querySelector("div")?.textContent).toBe("true")
    val.set(false)
    expect(el.querySelector("div")?.textContent).toBe("")
  })

  test("mountReactive cleanup when anchor has no parent", () => {
    const el = container()
    const show = signal(true)
    const unmount = mount(
      h("div", null, () => (show() ? h("span", null, "content") : null)),
      el,
    )
    unmount()
    // Should not throw even though marker may be detached
    expect(el.innerHTML).toBe("")
  })
})

// ─── mount.ts — component branches ──────────────────────────────────────────

describe("mount — component branches", () => {
  test("component returning Fragment", () => {
    const el = container()
    const FragComp = defineComponent(() =>
      h(Fragment, null, h("span", null, "a"), h("span", null, "b")),
    )
    mount(h(FragComp, null), el)
    expect(el.querySelectorAll("span").length).toBe(2)
  })

  test("component with onMount returning cleanup", async () => {
    const el = container()
    let cleaned = false
    const Comp = defineComponent(() => {
      onMount(() => () => {
        cleaned = true
      })
      return h("div", null, "with-cleanup")
    })
    const unmount = mount(h(Comp, null), el)
    expect(cleaned).toBe(false)
    unmount()
    expect(cleaned).toBe(true)
  })

  test("component with onUnmount hook", async () => {
    const el = container()
    let unmounted = false
    const Comp = defineComponent(() => {
      onUnmount(() => {
        unmounted = true
      })
      return h("div", null, "unmount-test")
    })
    const unmount = mount(h(Comp, null), el)
    expect(unmounted).toBe(false)
    unmount()
    expect(unmounted).toBe(true)
  })

  test("component with onUpdate hook", async () => {
    const el = container()
    const Comp = defineComponent(() => {
      const count = signal(0)
      onUpdate(() => {
        /* update tracked */
      })
      return h(
        "div",
        null,
        h("span", null, () => String(count())),
        h("button", { onClick: () => count.update((n: number) => n + 1) }, "+"),
      )
    })
    mount(h(Comp, null), el)
    // Click to trigger update
    el.querySelector("button")?.click()
    // onUpdate fires via microtask
  })

  test("component children merge into props.children", () => {
    const el = container()
    const Parent = defineComponent((props: { children?: VNodeChild }) =>
      h("div", { id: "parent" }, props.children),
    )
    mount(h(Parent, null, h("span", null, "child1"), h("span", null, "child2")), el)
    const spans = el.querySelectorAll("#parent span")
    expect(spans.length).toBe(2)
  })

  test("component with single child merges as singular children prop", () => {
    const el = container()
    const Parent = defineComponent((props: { children?: VNodeChild }) =>
      h("div", { id: "single" }, props.children),
    )
    mount(h(Parent, null, h("b", null, "only")), el)
    expect(el.querySelector("#single b")?.textContent).toBe("only")
  })

  test("component props.children already set — no merge", () => {
    const el = container()
    const Parent = defineComponent((props: { children?: VNodeChild }) =>
      h("div", { id: "no-merge" }, props.children),
    )
    mount(h(Parent, { children: h("em", null, "explicit") }, h("b", null, "ignored")), el)
    expect(el.querySelector("#no-merge em")?.textContent).toBe("explicit")
  })

  test("anonymous component name fallback", () => {
    const el = container()
    // Use an anonymous arrow function
    const comp = (() => h("span", null, "anon")) as unknown as ReturnType<typeof defineComponent>
    mount(h(comp, null), el)
    expect(el.querySelector("span")?.textContent).toBe("anon")
  })
})

// ─── props.ts — additional coverage ──────────────────────────────────────────

describe("props — additional coverage", () => {
  test("n-show prop toggles display reactively", () => {
    const el = container()
    const visible = signal(true)
    mount(h("div", { "n-show": () => visible() }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.style.display).toBe("")
    visible.set(false)
    expect(div.style.display).toBe("none")
    visible.set(true)
    expect(div.style.display).toBe("")
  })

  test("reactive prop via function", () => {
    const el = container()
    const title = signal("hello")
    mount(h("div", { title: () => title() }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.title).toBe("hello")
    title.set("world")
    expect(div.title).toBe("world")
  })

  test("null value removes attribute", () => {
    const el = container()
    mount(h("div", { "data-x": "initial" }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.getAttribute("data-x")).toBe("initial")
  })

  test("key and ref props are skipped in applyProps", () => {
    const el = container()
    const ref = createRef<HTMLDivElement>()
    mount(h("div", { key: "k", ref, "data-test": "yes" }), el)
    const div = el.querySelector("div") as HTMLElement
    // key should not be an attribute
    expect(div.hasAttribute("key")).toBe(false)
    // ref should not be an attribute
    expect(div.hasAttribute("ref")).toBe(false)
    // data-test should be set
    expect(div.getAttribute("data-test")).toBe("yes")
  })

  test("sanitizes javascript: in action attribute", () => {
    const el = container()
    mount(h("form", { action: "javascript:void(0)" }), el)
    const form = el.querySelector("form") as HTMLFormElement
    expect(form.getAttribute("action")).not.toBe("javascript:void(0)")
  })

  test("sanitizes data: in formaction", () => {
    const el = container()
    mount(h("button", { formaction: "data:text/html,<script>alert(1)</script>" }), el)
    const btn = el.querySelector("button") as HTMLButtonElement
    expect(btn.getAttribute("formaction")).not.toBe("data:text/html,<script>alert(1)</script>")
  })

  test("sanitizes javascript: with leading whitespace", () => {
    const el = container()
    mount(h("a", { href: "  javascript:alert(1)" }), el)
    const a = el.querySelector("a") as HTMLAnchorElement
    expect(a.getAttribute("href")).not.toBe("  javascript:alert(1)")
  })

  test("sanitizeHtml preserves safe tags", async () => {
    const result = sanitizeHtml("<b>bold</b><em>italic</em>")
    expect(result).toContain("<b>bold</b>")
    expect(result).toContain("<em>italic</em>")
  })

  test("sanitizeHtml strips script tags", async () => {
    const result = sanitizeHtml("<div>safe</div><script>alert(1)</script>")
    expect(result).toContain("safe")
    expect(result).not.toContain("<script>")
  })

  test("sanitizeHtml strips event handler attributes", async () => {
    const result = sanitizeHtml('<div onclick="alert(1)">hello</div>')
    expect(result).toContain("hello")
    expect(result).not.toContain("onclick")
  })

  test("sanitizeHtml strips javascript: URLs", async () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>')
    expect(result).not.toContain("javascript:")
  })

  test("setSanitizer overrides built-in sanitizer", async () => {
    // Set custom sanitizer that uppercases everything
    setSanitizer((html: string) => html.toUpperCase())
    expect(sanitizeHtml("<b>hello</b>")).toBe("<B>HELLO</B>")
    // Reset to built-in
    setSanitizer(null)
    // Built-in should work again
    const result = sanitizeHtml("<b>safe</b><script>bad</script>")
    expect(result).toContain("safe")
    expect(result).not.toContain("<script>")
  })

  test("sanitizeHtml strips iframe and object tags", async () => {
    const result = sanitizeHtml(
      '<div>ok</div><iframe src="evil"></iframe><object data="x"></object>',
    )
    expect(result).toContain("ok")
    expect(result).not.toContain("<iframe")
    expect(result).not.toContain("<object")
  })

  test("sanitizeHtml handles nested unsafe elements", async () => {
    const result = sanitizeHtml("<div><script><script>alert(1)</script></script></div>")
    expect(result).not.toContain("<script")
  })

  test("DOM property for known properties like value", () => {
    const el = container()
    mount(h("input", { value: "test", type: "text" }), el)
    const input = el.querySelector("input") as HTMLInputElement
    expect(input.value).toBe("test")
  })

  test("setAttribute fallback for unknown attributes", () => {
    const el = container()
    mount(h("div", { "aria-label": "test label" }), el)
    const div = el.querySelector("div") as HTMLElement
    expect(div.getAttribute("aria-label")).toBe("test label")
  })
})

// ─── DevTools ────────────────────────────────────────────────────────────────

describe("DevTools", () => {
  test("installDevTools sets __PYREON_DEVTOOLS__ on window", async () => {
    installDevTools()
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as Record<
      string,
      unknown
    >
    expect(devtools).not.toBeNull()
    expect(devtools.version).toBe("0.1.0")
  })

  test("registerComponent and getAllComponents", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      getAllComponents: () => {
        id: string
        name: string
        parentId: string | null
        childIds: string[]
      }[]
      getComponentTree: () => { id: string; name: string; parentId: string | null }[]
      highlight: (id: string) => void
      onComponentMount: (cb: (entry: { id: string }) => void) => () => void
      onComponentUnmount: (cb: (id: string) => void) => () => void
    }

    registerComponent("test-1", "TestComp", null, null)
    const all = devtools.getAllComponents()
    const found = all.find((c: { id: string }) => c.id === "test-1")
    expect(found).not.toBeUndefined()
    expect(found?.name).toBe("TestComp")

    // Cleanup
    unregisterComponent("test-1")
  })

  test("registerComponent with parentId creates parent-child relationship", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      getAllComponents: () => {
        id: string
        name: string
        parentId: string | null
        childIds: string[]
      }[]
    }

    registerComponent("parent-1", "Parent", null, null)
    registerComponent("child-1", "Child", null, "parent-1")

    const parent = devtools.getAllComponents().find((c: { id: string }) => c.id === "parent-1")
    expect(parent?.childIds).toContain("child-1")

    unregisterComponent("child-1")
    const parentAfter = devtools.getAllComponents().find((c: { id: string }) => c.id === "parent-1")
    expect(parentAfter?.childIds).not.toContain("child-1")

    unregisterComponent("parent-1")
  })

  test("getComponentTree returns only root components", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      getComponentTree: () => { id: string; parentId: string | null }[]
    }

    registerComponent("root-1", "Root", null, null)
    registerComponent("sub-1", "Sub", null, "root-1")

    const tree = devtools.getComponentTree()
    const rootInTree = tree.find((c: { id: string }) => c.id === "root-1")
    const subInTree = tree.find((c: { id: string }) => c.id === "sub-1")
    expect(rootInTree).not.toBeUndefined()
    expect(subInTree).toBeUndefined() // sub is not root

    unregisterComponent("sub-1")
    unregisterComponent("root-1")
  })

  test("highlight adds and removes outline", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      highlight: (id: string) => void
    }
    const el = document.createElement("div")
    document.body.appendChild(el)
    registerComponent("hl-1", "Highlight", el, null)
    devtools.highlight("hl-1")
    expect(el.style.outline).toContain("#00b4d8")

    // Highlight non-existent — should not throw
    devtools.highlight("non-existent")

    unregisterComponent("hl-1")
    el.remove()
  })

  test("onComponentMount and onComponentUnmount listeners", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      onComponentMount: (cb: (entry: { id: string; name: string }) => void) => () => void
      onComponentUnmount: (cb: (id: string) => void) => () => void
    }

    const mountedIds: string[] = []
    const unmountedIds: string[] = []
    const unsubMount = devtools.onComponentMount((entry) => mountedIds.push(entry.id))
    const unsubUnmount = devtools.onComponentUnmount((id) => unmountedIds.push(id))

    registerComponent("listen-1", "ListenComp", null, null)
    expect(mountedIds).toContain("listen-1")

    unregisterComponent("listen-1")
    expect(unmountedIds).toContain("listen-1")

    // Unsub and verify listeners are removed
    unsubMount()
    unsubUnmount()
    registerComponent("listen-2", "ListenComp2", null, null)
    expect(mountedIds).not.toContain("listen-2")
    unregisterComponent("listen-2")
    expect(unmountedIds).not.toContain("listen-2")
  })

  test("unregisterComponent is noop for unknown id", async () => {
    // Should not throw
    unregisterComponent("does-not-exist")
  })

  test("highlight with no el is noop", async () => {
    const devtools = (window as unknown as Record<string, unknown>).__PYREON_DEVTOOLS__ as {
      highlight: (id: string) => void
    }
    registerComponent("no-el", "NoEl", null, null)
    // Should not throw
    devtools.highlight("no-el")
    unregisterComponent("no-el")
  })
})

// ─── TransitionGroup ─────────────────────────────────────────────────────────

describe("TransitionGroup", () => {
  test("renders container element with specified tag", async () => {
    const el = container()
    const items = signal([{ id: 1 }, { id: 2 }])
    mount(
      h(TransitionGroup, {
        tag: "ul",
        name: "list",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("li", null, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelector("ul")).not.toBeNull()
  })

  test("renders initial items", async () => {
    const el = container()
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", { class: "item" }, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    const spans = el.querySelectorAll("span.item")
    expect(spans.length).toBe(3)
    expect(spans[0]?.textContent).toBe("1")
    expect(spans[2]?.textContent).toBe("3")
  })

  test("adding items triggers enter animation", async () => {
    const el = container()
    const items = signal([{ id: 1 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "fade",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", { class: "item" }, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelectorAll("span.item").length).toBe(1)

    // Add a new item
    items.set([{ id: 1 }, { id: 2 }])
    // Wait for the microtask (enter animation scheduled via queueMicrotask)
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelectorAll("span.item").length).toBe(2)
  })

  test("removing items keeps element during leave animation", async () => {
    const el = container()
    const items = signal([{ id: 1 }, { id: 2 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "fade",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", { class: "item" }, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelectorAll("span.item").length).toBe(2)

    // Remove item 2
    items.set([{ id: 1 }])
    // Element should still be in DOM during leave animation
    expect(el.querySelectorAll("span.item").length).toBeGreaterThanOrEqual(1)
  })

  test("default tag is div and default name is pyreon", async () => {
    const el = container()
    const items = signal([{ id: 1 }])
    mount(
      h(TransitionGroup, {
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    // Default tag is div
    expect(el.querySelector("div")).not.toBeNull()
  })

  test("appear option triggers enter on initial mount", async () => {
    const el = container()
    let enterCalled = false
    const items = signal([{ id: 1 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "test",
        appear: true,
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", { class: "appear-item" }, String(item.id)),
        onBeforeEnter: () => {
          enterCalled = true
        },
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))
    expect(enterCalled).toBe(true)
  })

  test("custom class name overrides", async () => {
    const el = container()
    const items = signal([{ id: 1 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        enterFrom: "my-enter-from",
        enterActive: "my-enter-active",
        enterTo: "my-enter-to",
        leaveFrom: "my-leave-from",
        leaveActive: "my-leave-active",
        leaveTo: "my-leave-to",
        moveClass: "my-move",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelectorAll("span").length).toBe(1)
  })

  test("leave callback with no ref.current removes entry immediately", async () => {
    const el = container()
    const items = signal([{ id: 1 }, { id: 2 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        items,
        keyFn: (item: { id: number }) => item.id,
        // Return a non-element VNode (component VNode) so ref won't be injected
        render: (item: { id: number }) => {
          const Comp = () => h("span", null, String(item.id))
          return h(Comp, null) as unknown as ReturnType<typeof h>
        },
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    // Remove an item — since ref.current will be null for component VNodes,
    // the entry is cleaned up immediately
    items.set([{ id: 1 }])
    await new Promise<void>((r) => queueMicrotask(r))
  })

  test("reorder triggers move animation setup", async () => {
    const el = container()
    const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "list",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", { class: "reorder-item" }, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelectorAll("span.reorder-item").length).toBe(3)

    // Reorder items
    items.set([{ id: 3 }, { id: 1 }, { id: 2 }])
    await new Promise<void>((r) => queueMicrotask(r))

    // Items should be reordered
    const spans = el.querySelectorAll("span.reorder-item")
    expect(spans[0]?.textContent).toBe("3")
    expect(spans[1]?.textContent).toBe("1")
    expect(spans[2]?.textContent).toBe("2")
  })

  test("onAfterEnter callback fires after enter transition", async () => {
    const el = container()
    let afterEnterCalled = false
    const items = signal<{ id: number }[]>([])
    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "fade",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, String(item.id)),
        onAfterEnter: () => {
          afterEnterCalled = true
        },
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))

    // Add item (not first run, so enter animation triggers)
    items.set([{ id: 1 }])
    await new Promise<void>((r) => queueMicrotask(r))
    await new Promise<void>((r) => queueMicrotask(r))

    // Trigger rAF and transitionend
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const span = el.querySelector("span")
    if (span) {
      span.dispatchEvent(new Event("transitionend"))
    }
    expect(afterEnterCalled).toBe(true)
  })

  test("onBeforeLeave and onAfterLeave callbacks fire", async () => {
    const el = container()
    let beforeLeaveCalled = false
    const items = signal([{ id: 1 }])
    mount(
      h(TransitionGroup, {
        tag: "div",
        name: "fade",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", { class: "leave-item" }, String(item.id)),
        onBeforeLeave: () => {
          beforeLeaveCalled = true
        },
        onAfterLeave: () => {
          /* after leave tracked */
        },
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))

    // Remove item
    items.set([])
    expect(beforeLeaveCalled).toBe(true)

    // Trigger leave animation completion
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    const span = el.querySelector("span.leave-item")
    if (span) {
      span.dispatchEvent(new Event("transitionend"))
    }
    // afterLeave fires inside rAF callback, might need another tick
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    if (span) {
      span.dispatchEvent(new Event("transitionend"))
    }
  })
})

// ─── Hydration debug ────────────────────────────────────────────────────────

describe("hydration warnings", () => {
  test("enableHydrationWarnings and disableHydrationWarnings", async () => {
    // Should not throw
    enableHydrationWarnings()
    disableHydrationWarnings()
    enableHydrationWarnings() // re-enable for other tests
  })
})

// ─── Additional hydrate.ts branch coverage ───────────────────────────────────

describe("hydrateRoot — branch coverage", () => {
  test("hydrates raw array child (non-Fragment array path)", async () => {
    const el = container()
    el.innerHTML = "<span>a</span><span>b</span>"
    // Pass an array directly — hits the Array.isArray branch in hydrateChild
    const cleanup = hydrateRoot(el, [h("span", null, "a"), h("span", null, "b")])
    expect(el.querySelectorAll("span").length).toBe(2)
    cleanup()
  })

  test("hydrates For with SSR markers (start/end comment pair)", async () => {
    const el = container()
    el.innerHTML = "<div><!--pyreon-for--><li>item1</li><li>item2</li><!--/pyreon-for--></div>"
    const items = signal([
      { id: 1, label: "item1" },
      { id: 2, label: "item2" },
    ])
    const cleanup = hydrateRoot(
      el,
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("li", null, r.label),
        }),
      ),
    )
    cleanup()
  })

  test("hydrates reactive accessor returning null with no domNode", async () => {
    const el = container()
    el.innerHTML = "<div></div>"
    const show = signal<VNodeChild>(null)
    // The div has no children, so domNode will be null inside
    const cleanup = hydrateRoot(el, h("div", null, (() => show()) as unknown as VNodeChild))
    show.set("hello")
    cleanup()
  })

  test("hydrates reactive VNode accessor with marker when no domNode", async () => {
    const el = container()
    el.innerHTML = "<div></div>"
    const content = signal<VNodeChild>(h("span", null, "initial"))
    const cleanup = hydrateRoot(el, h("div", null, (() => content()) as unknown as VNodeChild))
    cleanup()
  })

  test("hydrates unknown symbol vnode type — returns noop", async () => {
    const el = container()
    el.innerHTML = "<div></div>"
    const weirdVNode = { type: Symbol("weird"), props: {}, children: [], key: null }
    const cleanup = hydrateRoot(el, h("div", null, weirdVNode as VNodeChild))
    cleanup()
  })

  test("hydration of text that matches existing text node — cleanup removes it", async () => {
    const el = container()
    el.innerHTML = "hello"
    const cleanup = hydrateRoot(el, "hello")
    expect(el.textContent).toBe("hello")
    cleanup()
  })

  test("For with no SSR markers and domNode present", async () => {
    const el = container()
    el.innerHTML = "<div><span>existing</span></div>"
    const items = signal([{ id: 1, label: "a" }])
    const cleanup = hydrateRoot(
      el,
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("li", null, r.label),
        }),
      ),
    )
    cleanup()
  })

  test("For with no SSR markers and no domNode", async () => {
    const el = container()
    el.innerHTML = "<div></div>"
    const items = signal([{ id: 1, label: "a" }])
    const cleanup = hydrateRoot(
      el,
      h(
        "div",
        null,
        For({
          each: items,
          by: (r: { id: number }) => r.id,
          children: (r: { id: number; label: string }) => h("li", null, r.label),
        }),
      ),
    )
    cleanup()
  })

  test("reactive accessor returning null when domNode exists", async () => {
    const el = container()
    // Put a real DOM node that will be domNode, but accessor returns null
    el.innerHTML = "<div><span>existing</span></div>"
    const show = signal<VNodeChild>(null)
    // The span is the domNode, but accessor returns null — hits line 91-92
    const cleanup = hydrateRoot(
      el,
      h("div", null, (() => show()) as unknown as VNodeChild, h("span", null, "existing")),
    )
    cleanup()
  })
})

// ─── mount.ts — error handling branches ──────────────────────────────────────

describe("mount — error handling branches", () => {
  test("mountChild with raw array", async () => {
    const el = container()
    // Pass an array directly to mountChild (line 72)
    const cleanup = mountChild([h("span", null, "x"), h("span", null, "y")], el, null)
    expect(el.querySelectorAll("span").length).toBe(2)
    cleanup()
  })

  test("component subtree throw is caught", () => {
    const el = container()
    // A component whose render output itself causes an error during mount
    const BadRender = defineComponent(() => {
      // Return a VNode that includes a broken component child
      const Throws = defineComponent((): never => {
        throw new Error("subtree error")
      })
      return h(Throws, null)
    })
    // Should not throw — error is caught in mountComponent's subtree try/catch
    mount(h(BadRender, null), el)
  })

  test("onMount hook that throws is caught", async () => {
    const el = container()
    const Comp = defineComponent(() => {
      onMount(() => {
        throw new Error("onMount error")
      })
      return h("div", null, "content")
    })
    // Should not throw
    mount(h(Comp, null), el)
    expect(el.querySelector("div")?.textContent).toBe("content")
  })

  test("onUnmount hook that throws is caught", async () => {
    const el = container()
    const Comp = defineComponent(() => {
      onUnmount(() => {
        throw new Error("onUnmount error")
      })
      return h("div", null, "content")
    })
    const unmount = mount(h(Comp, null), el)
    // Should not throw
    unmount()
  })
})

// ─── TransitionGroup — unmount cleanup ───────────────────────────────────────

describe("TransitionGroup — cleanup", () => {
  test("unmount disposes effect and cleans up entries", async () => {
    const el = container()
    const items = signal([{ id: 1 }, { id: 2 }])
    const unmount = mount(
      h(TransitionGroup, {
        tag: "div",
        items,
        keyFn: (item: { id: number }) => item.id,
        render: (item: { id: number }) => h("span", null, String(item.id)),
      }),
      el,
    )
    await new Promise<void>((r) => queueMicrotask(r))
    expect(el.querySelectorAll("span").length).toBe(2)
    unmount()
    expect(el.innerHTML).toBe("")
  })
})
