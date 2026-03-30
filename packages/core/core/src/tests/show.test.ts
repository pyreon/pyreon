import { h } from "../h"
import { Match, MatchSymbol, Show, Switch } from "../show"
import type { VNodeChild } from "../types"

describe("Show", () => {
  test("returns a reactive getter (function)", () => {
    const result = Show({ when: () => true, children: "visible" })
    expect(typeof result).toBe("function")
  })

  test("getter returns children when condition is truthy", () => {
    const getter = Show({ when: () => true, children: "visible" }) as unknown as () => VNodeChild
    expect(getter()).toBe("visible")
  })

  test("getter returns null when condition is falsy and no fallback", () => {
    const getter = Show({ when: () => false, children: "hidden" }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("getter returns fallback when condition is falsy", () => {
    const fb = h("span", null, "fallback")
    const getter = Show({
      when: () => false,
      fallback: fb,
      children: "main",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe(fb)
  })

  test("reacts to condition changes", () => {
    let flag = true
    const getter = Show({
      when: () => flag,
      children: "yes",
      fallback: "no",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("yes")
    flag = false
    expect(getter()).toBe("no")
    flag = true
    expect(getter()).toBe("yes")
  })

  test("returns null for undefined children when truthy", () => {
    const getter = Show({ when: () => true }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("returns null for undefined fallback when falsy", () => {
    const getter = Show({ when: () => false, children: "x" }) as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("VNode children are preserved as-is", () => {
    const child = h("div", null, "content")
    const getter = Show({ when: () => true, children: child }) as unknown as () => VNodeChild
    expect(getter()).toBe(child)
  })

  test("truthiness: non-empty string", () => {
    const getter = Show({
      when: () => "truthy-string",
      children: "shown",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("shown")
  })

  test("truthiness: 0 is falsy", () => {
    const getter = Show({
      when: () => 0,
      children: "shown",
      fallback: "hidden",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("hidden")
  })

  test("truthiness: empty string is falsy", () => {
    const getter = Show({
      when: () => "",
      children: "shown",
      fallback: "hidden",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("hidden")
  })

  test("truthiness: null is falsy", () => {
    const getter = Show({
      when: () => null,
      children: "shown",
      fallback: "hidden",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("hidden")
  })

  test("truthiness: object is truthy", () => {
    const getter = Show({
      when: () => ({ a: 1 }),
      children: "shown",
    }) as unknown as () => VNodeChild
    expect(getter()).toBe("shown")
  })
})

describe("Match", () => {
  test("returns null (marker-only component)", () => {
    const result = Match({ when: () => true, children: "content" })
    expect(result).toBeNull()
  })

  test("MatchSymbol is a unique symbol", () => {
    expect(typeof MatchSymbol).toBe("symbol")
    expect(MatchSymbol.toString()).toContain("pyreon.Match")
  })
})

describe("Switch", () => {
  test("renders first truthy Match branch", () => {
    const result = Switch({
      children: [
        h(Match, { when: () => false }, "first"),
        h(Match, { when: () => true }, "second"),
        h(Match, { when: () => true }, "third"),
      ],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("second")
  })

  test("renders fallback when no match", () => {
    const fb = h("p", null, "404")
    const result = Switch({
      fallback: fb,
      children: [h(Match, { when: () => false }, "a"), h(Match, { when: () => false }, "b")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe(fb)
  })

  test("returns null when no match and no fallback", () => {
    const result = Switch({
      children: [h(Match, { when: () => false }, "a")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("handles single child (not array)", () => {
    const result = Switch({
      children: h(Match, { when: () => true }, "only"),
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("only")
  })

  test("handles no children", () => {
    const result = Switch({})
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("handles null/undefined children", () => {
    const result = Switch({ children: null as unknown as VNodeChild })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBeNull()
  })

  test("skips non-Match VNode children", () => {
    const result = Switch({
      fallback: "default",
      children: [h("div", null, "not-a-match"), h(Match, { when: () => true }, "found")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("found")
  })

  test("skips non-object children (strings, null)", () => {
    const result = Switch({
      fallback: "default",
      children: [
        null as unknown as VNodeChild,
        "string-child" as unknown as VNodeChild,
        h(Match, { when: () => true }, "found"),
      ],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("found")
  })

  test("reacts to condition changes", () => {
    let a = false
    let b = false
    const result = Switch({
      fallback: "none",
      children: [h(Match, { when: () => a }, "A"), h(Match, { when: () => b }, "B")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("none")
    b = true
    expect(getter()).toBe("B")
    a = true
    expect(getter()).toBe("A") // first match wins
    b = false
    expect(getter()).toBe("A")
    a = false
    expect(getter()).toBe("none")
  })

  test("Match with multiple children returns array", () => {
    const result = Switch({
      children: [h(Match, { when: () => true }, "child1", "child2")],
    })
    const getter = result as unknown as () => VNodeChild
    const value = getter()
    expect(Array.isArray(value)).toBe(true)
    expect(value).toEqual(["child1", "child2"])
  })

  test("Match with zero vnode.children falls back to props.children", () => {
    const matchVNode = {
      type: Match,
      props: { when: () => true, children: "from-props" },
      children: [],
      key: null,
    } as unknown as VNodeChild
    const result = Switch({ children: [matchVNode] })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("from-props")
  })

  test("Match with single vnode.children returns it directly (not array)", () => {
    const result = Switch({
      children: [h(Match, { when: () => true }, "single")],
    })
    const getter = result as unknown as () => VNodeChild
    expect(getter()).toBe("single")
  })
})
