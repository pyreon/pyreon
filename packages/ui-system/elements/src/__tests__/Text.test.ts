import type { VNode } from "@pyreon/core"
import { h } from "@pyreon/core"
import { describe, expect, it } from "vitest"
import { Text } from "../Text"

const asVNode = (v: unknown) => v as VNode

describe("Text", () => {
  describe("static properties", () => {
    it("has isText set to true", () => {
      expect(Text.isText).toBe(true)
    })

    it("has correct displayName", () => {
      expect(Text.displayName).toBe("@pyreon/elements/Text")
    })

    it("has correct pkgName", () => {
      expect(Text.pkgName).toBe("@pyreon/elements")
    })

    it("has correct PYREON__COMPONENT", () => {
      expect(Text.PYREON__COMPONENT).toBe("@pyreon/elements/Text")
    })
  })

  describe("default rendering", () => {
    it("returns a VNode whose type is the Styled component (a function)", () => {
      const result = asVNode(Text({ children: "Hello" }))
      expect(typeof result.type).toBe("function")
    })

    it("does not set as prop when no tag or paragraph provided", () => {
      const result = asVNode(Text({ children: "Hello" }))
      expect(result.props.as).toBeUndefined()
    })

    it("renders children in output", () => {
      const result = asVNode(Text({ children: "Hello" }))
      expect(result.props.children).toBe("Hello")
    })

    it("passes $text prop with extraStyles", () => {
      const result = asVNode(Text({ children: "Hello" }))
      expect(result.props.$text).toEqual({ extraStyles: undefined })
    })

    it("renders null content when no children or label", () => {
      const result = asVNode(Text({}))
      expect(result.props.children).toBeUndefined()
    })
  })

  describe("content fallback chain", () => {
    it("renders children as content", () => {
      const result = asVNode(Text({ children: "child content" }))
      expect(result.props.children).toBe("child content")
    })

    it("renders label when children not provided", () => {
      const result = asVNode(Text({ label: "label text" }))
      expect(result.props.children).toBe("label text")
    })

    it("prefers children over label", () => {
      const result = asVNode(Text({ children: "child", label: "label" }))
      expect(result.props.children).toBe("child")
    })

    it("renders VNode children", () => {
      const child = h("strong", null, "bold")
      const result = asVNode(Text({ children: child }))
      expect(result.props.children).toBe(child)
    })

    it("renders number label", () => {
      const result = asVNode(Text({ label: 42 }))
      expect(result.props.children).toBe(42)
    })
  })

  describe("tag prop", () => {
    it("sets as prop to h1", () => {
      const result = asVNode(Text({ tag: "h1", children: "Heading" }))
      expect(result.props.as).toBe("h1")
    })

    it("sets as prop to h2", () => {
      const result = asVNode(Text({ tag: "h2", children: "Sub heading" }))
      expect(result.props.as).toBe("h2")
    })

    it("sets as prop to strong", () => {
      const result = asVNode(Text({ tag: "strong", children: "Bold" }))
      expect(result.props.as).toBe("strong")
    })

    it("sets as prop to em", () => {
      const result = asVNode(Text({ tag: "em", children: "Italic" }))
      expect(result.props.as).toBe("em")
    })

    it("does not forward tag as a prop", () => {
      const result = asVNode(Text({ tag: "h1", children: "Heading" }))
      expect(result.props.tag).toBeUndefined()
    })
  })

  describe("paragraph prop", () => {
    it("sets as prop to p when paragraph is true", () => {
      const result = asVNode(Text({ paragraph: true, children: "Paragraph text" }))
      expect(result.props.as).toBe("p")
    })

    it("does not set as prop when paragraph is false", () => {
      const result = asVNode(Text({ paragraph: false, children: "Inline text" }))
      expect(result.props.as).toBeUndefined()
    })

    it("paragraph is overridden when tag is also set (tag wins because paragraph branch is skipped)", () => {
      // When paragraph is true, finalTag = 'p'
      // When tag is also set, the else branch is not reached, so paragraph wins
      const result = asVNode(Text({ tag: "h1", paragraph: true, children: "Heading" }))
      expect(result.props.as).toBe("p")
    })

    it("uses tag when paragraph is false", () => {
      const result = asVNode(Text({ tag: "h1", paragraph: false, children: "Heading" }))
      expect(result.props.as).toBe("h1")
    })

    it("does not forward paragraph as a prop", () => {
      const result = asVNode(Text({ paragraph: true, children: "text" }))
      expect(result.props.paragraph).toBeUndefined()
    })
  })

  describe("css prop", () => {
    it("passes css value through $text.extraStyles", () => {
      const customCss = "color: red;"
      const result = asVNode(Text({ css: customCss, children: "styled" }))
      expect(result.props.$text).toEqual({ extraStyles: customCss })
    })

    it("passes undefined extraStyles when no css prop", () => {
      const result = asVNode(Text({ children: "plain" }))
      expect(result.props.$text).toEqual({ extraStyles: undefined })
    })

    it("does not forward css as a direct prop", () => {
      const result = asVNode(Text({ css: "color: blue;", children: "text" }))
      expect(result.props.css).toBeUndefined()
    })
  })

  describe("HTML attribute forwarding", () => {
    it("passes through id", () => {
      const result = asVNode(Text({ id: "text-id", children: "text" }))
      expect(result.props.id).toBe("text-id")
    })

    it("passes through role", () => {
      const result = asVNode(Text({ role: "heading", children: "text" }))
      expect(result.props.role).toBe("heading")
    })

    it("passes through title", () => {
      const result = asVNode(Text({ title: "tooltip", children: "text" }))
      expect(result.props.title).toBe("tooltip")
    })

    it("passes through data- attributes", () => {
      const result = asVNode(Text({ "data-testid": "txt", children: "text" }))
      expect(result.props["data-testid"]).toBe("txt")
    })

    it("passes through aria- attributes", () => {
      const result = asVNode(Text({ "aria-label": "label", children: "text" }))
      expect(result.props["aria-label"]).toBe("label")
    })

    it("passes through on-prefixed event handlers", () => {
      const handler = () => undefined
      const result = asVNode(Text({ onClick: handler, children: "text" }))
      expect(result.props.onClick).toBe(handler)
    })

    it("passes through ref", () => {
      const ref = { current: null }
      const result = asVNode(Text({ ref, children: "text" }))
      expect(result.props.ref).toBe(ref)
    })

    it("passes through class", () => {
      const result = asVNode(Text({ class: "title", children: "text" }))
      expect(result.props.class).toBe("title")
    })

    it("passes through style", () => {
      const result = asVNode(Text({ style: "color: red;", children: "text" }))
      expect(result.props.style).toBe("color: red;")
    })

    it("does not set class when not provided", () => {
      const result = asVNode(Text({ children: "text" }))
      expect(result.props.class).toBeUndefined()
    })

    it("does not set style when not provided", () => {
      const result = asVNode(Text({ children: "text" }))
      expect(result.props.style).toBeUndefined()
    })
  })

  describe("reserved props are consumed and not forwarded", () => {
    it("does not forward paragraph, label, tag, or css", () => {
      const result = asVNode(
        Text({
          paragraph: true,
          label: "lbl",
          children: "text",
          tag: "h1",
          css: "font-size: 2rem;",
        }),
      )
      expect(result.props.paragraph).toBeUndefined()
      expect(result.props.label).toBeUndefined()
      expect(result.props.tag).toBeUndefined()
      expect(result.props.css).toBeUndefined()
    })
  })

  describe("combined props", () => {
    it("renders with paragraph, css, class, and data attribute together", () => {
      const result = asVNode(
        Text({
          paragraph: true,
          css: "margin: 0;",
          class: "intro",
          "data-testid": "intro-text",
          children: "Hello world",
        }),
      )

      expect(typeof result.type).toBe("function")
      expect(result.props.as).toBe("p")
      expect(result.props.$text).toEqual({ extraStyles: "margin: 0;" })
      expect(result.props.class).toBe("intro")
      expect(result.props["data-testid"]).toBe("intro-text")
      expect(result.props.children).toBe("Hello world")
      // Reserved props not forwarded
      expect(result.props.paragraph).toBeUndefined()
      expect(result.props.css).toBeUndefined()
    })

    it("renders with tag, ref, and event handler together", () => {
      const ref = { current: null }
      const handler = () => undefined
      const result = asVNode(
        Text({
          tag: "h2",
          ref,
          onClick: handler,
          children: "Subtitle",
        }),
      )

      expect(result.props.as).toBe("h2")
      expect(result.props.ref).toBe(ref)
      expect(result.props.onClick).toBe(handler)
      expect(result.props.children).toBe("Subtitle")
    })
  })
})
