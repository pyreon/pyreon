import { For, ForSymbol } from "../for"
import { h } from "../h"
import type { VNode } from "../types"

describe("For", () => {
  test("returns VNode with ForSymbol type", () => {
    const node = For({
      each: () => [1, 2, 3],
      by: (item) => item,
      children: (item) => h("li", null, String(item)),
    })
    expect(node.type).toBe(ForSymbol)
  })

  test("VNode has empty children array", () => {
    const node = For({
      each: () => [],
      by: (item: number) => item,
      children: (item) => h("span", null, String(item)),
    })
    expect(node.children).toEqual([])
  })

  test("VNode has null key", () => {
    const node = For({
      each: () => [1],
      by: (item) => item,
      children: (item) => h("li", null, String(item)),
    })
    expect(node.key).toBeNull()
  })

  test("props contain each, by, children functions", () => {
    const eachFn = () => ["a", "b"]
    const byFn = (item: string) => item
    const childFn = (item: string) => h("span", null, item)
    const node = For({ each: eachFn, by: byFn, children: childFn })

    const props = node.props as unknown as {
      each: typeof eachFn
      by: typeof byFn
      children: typeof childFn
    }
    expect(props.each).toBe(eachFn)
    expect(props.by).toBe(byFn)
    expect(props.children).toBe(childFn)
  })

  test("ForSymbol is a unique symbol", () => {
    expect(typeof ForSymbol).toBe("symbol")
    expect(ForSymbol.toString()).toContain("pyreon.For")
  })

  test("works with object items", () => {
    interface Item {
      id: number
      name: string
    }
    const items: Item[] = [
      { id: 1, name: "one" },
      { id: 2, name: "two" },
    ]
    const node = For<Item>({
      each: () => items,
      by: (item) => item.id,
      children: (item) => h("li", null, item.name),
    })
    expect(node.type).toBe(ForSymbol)
    const props = node.props as unknown as { each: () => Item[] }
    expect(props.each()).toBe(items)
  })

  test("works with string keys", () => {
    const node = For({
      each: () => [{ slug: "hello" }, { slug: "world" }],
      by: (item) => item.slug,
      children: (item) => h("div", null, item.slug),
    })
    expect(node.type).toBe(ForSymbol)
  })

  test("children function produces VNodes", () => {
    const childFn = (n: number) => h("li", { key: n }, String(n))
    const node = For({
      each: () => [1, 2, 3],
      by: (n) => n,
      children: childFn,
    })
    const props = node.props as unknown as { children: typeof childFn }
    const result = props.children(1)
    expect((result as VNode).type).toBe("li")
    expect((result as VNode).key).toBe(1)
  })
})
