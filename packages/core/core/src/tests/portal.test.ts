import { h } from "../h"
import { Portal, PortalSymbol } from "../portal"
import type { VNode } from "../types"

describe("Portal", () => {
  test("returns VNode with PortalSymbol type", () => {
    const fakeTarget = {} as Element
    const node = Portal({ target: fakeTarget, children: h("div", null) })
    expect(node.type).toBe(PortalSymbol)
  })

  test("VNode has null key", () => {
    const node = Portal({ target: {} as Element, children: "content" })
    expect(node.key).toBeNull()
  })

  test("VNode has empty children array", () => {
    const node = Portal({ target: {} as Element, children: "content" })
    expect(node.children).toEqual([])
  })

  test("props contain target and children", () => {
    const fakeTarget = {} as Element
    const child = h("span", null, "content")
    const node = Portal({ target: fakeTarget, children: child })
    const props = node.props as unknown as { target: Element; children: VNode }
    expect(props.target).toBe(fakeTarget)
    expect(props.children).toBe(child)
  })

  test("PortalSymbol is a unique symbol", () => {
    expect(typeof PortalSymbol).toBe("symbol")
    expect(PortalSymbol.toString()).toContain("pyreon.Portal")
  })

  test("string children are stored in props", () => {
    const node = Portal({ target: {} as Element, children: "text content" })
    const props = node.props as unknown as { children: string }
    expect(props.children).toBe("text content")
  })

  test("multiple VNode children via fragment", () => {
    const children = h("div", null, h("span", null, "a"), h("span", null, "b"))
    const node = Portal({ target: {} as Element, children })
    const props = node.props as unknown as { children: VNode }
    expect((props.children as VNode).type).toBe("div")
  })
})
