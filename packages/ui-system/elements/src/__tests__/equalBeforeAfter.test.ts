import type { VNode } from "@pyreon/core"
import { h } from "@pyreon/core"
import { describe, expect, it } from "vitest"
import { Element } from "../Element"
import Content from "../helpers/Content/component"
import Wrapper from "../helpers/Wrapper/component"

const asVNode = (v: unknown) => v as VNode

const getContentSlots = (result: VNode): VNode[] => {
  const children = result.props.children
  if (!Array.isArray(children)) return []
  return children.filter(
    (c: unknown) =>
      c != null && typeof c === "object" && "type" in (c as VNode) && (c as VNode).type === Content,
  ) as VNode[]
}

describe("Element equalBeforeAfter", () => {
  it("always passes a ref function to Wrapper", () => {
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        direction: "inline",
        beforeContent: h("span", null, "Before"),
        afterContent: h("span", null, "After"),
        children: "Main",
      }),
    )
    expect(result.type).toBe(Wrapper)
    expect(typeof result.props.ref).toBe("function")
  })

  it("does not crash without before/after content", () => {
    const result = asVNode(Element({ equalBeforeAfter: true, children: "Main only" }))
    expect(result.type).toBe(Wrapper)
  })

  it("does not crash with only beforeContent", () => {
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        beforeContent: h("span", null, "Before"),
        children: "Main",
      }),
    )
    expect(result.type).toBe(Wrapper)
  })

  it("does not crash with only afterContent", () => {
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        afterContent: h("span", null, "After"),
        children: "Main",
      }),
    )
    expect(result.type).toBe(Wrapper)
  })

  it("renders three slot children when both before and after exist", () => {
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        direction: "inline",
        beforeContent: h("span", null, "Short"),
        afterContent: h("span", null, "Longer content"),
        children: "Center",
      }),
    )
    const slots = getContentSlots(result)
    expect(slots).toHaveLength(3)
  })

  it("merged ref calls external function ref", () => {
    let captured: HTMLElement | null = null
    const ref = (node: HTMLElement | null) => {
      captured = node
    }
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        ref,
        beforeContent: h("span", null, "Before"),
        afterContent: h("span", null, "After"),
        children: "Main",
      }),
    )
    const fakeNode = {} as HTMLElement
    ;(result.props.ref as (node: HTMLElement | null) => void)(fakeNode)
    expect(captured).toBe(fakeNode)
  })

  it("merged ref sets object ref current", () => {
    const ref = { current: null as HTMLElement | null }
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        ref,
        beforeContent: h("span", null, "Before"),
        afterContent: h("span", null, "After"),
        children: "Main",
      }),
    )
    const fakeNode = {} as HTMLElement
    ;(result.props.ref as (node: HTMLElement | null) => void)(fakeNode)
    expect(ref.current).toBe(fakeNode)
  })

  it("uses inline direction for equalBeforeAfter", () => {
    const result = asVNode(
      Element({
        equalBeforeAfter: true,
        direction: "inline",
        beforeContent: h("span", null, "B"),
        afterContent: h("span", null, "A"),
        children: "Main",
      }),
    )
    expect(result.props.direction).toBe("inline")
  })
})
