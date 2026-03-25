import { describe, expect, it } from "vitest"
import type { DocumentMarker } from "../extractDocumentTree"
import { extractDocumentTree } from "../extractDocumentTree"

// Helper: create a mock VNode
const vnode = (
  type: string | ((...args: any[]) => any),
  props: Record<string, any> = {},
  children: unknown[] = [],
) => ({ type, props, children })

// Helper: create a document-marked component function
const docComponent = (docType: string, render?: (...args: any[]) => any) => {
  const fn = render ?? ((props: any) => vnode("div", props, props.children ? [props.children] : []))
  ;(fn as any)._documentType = docType
  return fn as ((...args: any[]) => any) & DocumentMarker
}

describe("extractDocumentTree", () => {
  it("extracts a simple document node", () => {
    const Heading = docComponent("heading")
    const tree = vnode(
      Heading,
      { $rocketstyle: { fontSize: 24, fontWeight: "bold" }, _documentProps: { level: 1 } },
      ["Hello World"],
    )

    const result = extractDocumentTree(tree)

    expect(result.type).toBe("heading")
    expect(result.props).toEqual({ level: 1 })
    expect(result.children).toEqual(["Hello World"])
    expect(result.styles).toEqual({ fontSize: 24, fontWeight: "bold" })
  })

  it("extracts nested document nodes", () => {
    const Section = docComponent("section")
    const Text = docComponent("text")

    const tree = vnode(Section, { $rocketstyle: { padding: 16 } }, [
      vnode(Text, { $rocketstyle: { fontSize: 14, color: "#333" } }, ["Paragraph one"]),
      vnode(Text, { $rocketstyle: { fontSize: 14, color: "#333" } }, ["Paragraph two"]),
    ])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe("section")
    expect(result.styles).toEqual({ padding: 16 })
    expect(result.children).toHaveLength(2)
    expect((result.children[0] as any).type).toBe("text")
    expect((result.children[1] as any).type).toBe("text")
  })

  it("flattens transparent wrappers", () => {
    const Section = docComponent("section")
    const Text = docComponent("text")

    // A plain div wrapper (no _documentType) should be transparent
    const tree = vnode(Section, {}, [
      vnode("div", {}, [vnode(Text, { $rocketstyle: { fontSize: 14 } }, ["Hello"])]),
    ])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe("section")
    expect(result.children).toHaveLength(1)
    expect((result.children[0] as any).type).toBe("text")
  })

  it("handles string children", () => {
    const Text = docComponent("text")
    const tree = vnode(Text, {}, ["Hello", " ", "World"])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(["Hello", " ", "World"])
  })

  it("handles number children", () => {
    const Text = docComponent("text")
    const tree = vnode(Text, {}, [42])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(["42"])
  })

  it("skips null and boolean children", () => {
    const Section = docComponent("section")
    const tree = vnode(Section, {}, [null, false, true, "visible"])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(["visible"])
  })

  it("resolves reactive getter children", () => {
    const Text = docComponent("text")
    const tree = vnode(Text, {}, [() => "dynamic text"])

    const result = extractDocumentTree(tree)

    expect(result.children).toEqual(["dynamic text"])
  })

  it("omits styles when includeStyles is false", () => {
    const Heading = docComponent("heading")
    const tree = vnode(Heading, { $rocketstyle: { fontSize: 24 } }, ["Hello"])

    const result = extractDocumentTree(tree, { includeStyles: false })

    expect(result.styles).toBeUndefined()
  })

  it("wraps in document node when root has no _documentType", () => {
    const tree = vnode("div", {}, ["raw text"])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe("document")
    expect(result.children).toEqual(["raw text"])
  })

  it("handles component functions without _documentType by calling them", () => {
    const Text = docComponent("text")
    const Wrapper = (props: any) =>
      vnode(Text, { $rocketstyle: { fontSize: 14 } }, [props.children])

    const tree = vnode(Wrapper, {}, ["wrapped text"])

    const result = extractDocumentTree(tree)

    expect(result.type).toBe("text")
    expect(result.children).toEqual(["wrapped text"])
  })

  it("handles function passed directly", () => {
    const Text = docComponent("text")
    const template = () => vnode(Text, { $rocketstyle: { fontSize: 14 } }, ["Hello"])

    const result = extractDocumentTree(template)

    expect(result.type).toBe("text")
    expect(result.children).toEqual(["Hello"])
  })

  it("creates empty document for null input", () => {
    const result = extractDocumentTree(null)

    expect(result.type).toBe("document")
    expect(result.children).toEqual([])
  })
})
