import type { VNode } from "@pyreon/core"
import { afterEach, describe, expect, it } from "vitest"
import { sheet } from "../sheet"
import { styled } from "../styled"

describe("styled", () => {
  afterEach(() => {
    sheet.reset()
  })

  describe("basic creation", () => {
    it("returns a tagged template function", () => {
      const tagFn = styled("div")
      expect(typeof tagFn).toBe("function")
    })

    it("tagged template returns a ComponentFn", () => {
      const Comp = styled("div")`display: flex;`
      expect(typeof Comp).toBe("function")
    })
  })

  describe("static CSS (no function interpolations)", () => {
    it("produces a VNode with the correct tag", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({}) as VNode
      expect(vnode.type).toBe("div")
    })

    it("produces a VNode with the correct tag for span", () => {
      const Comp = styled("span")`color: red;`
      const vnode = Comp({}) as VNode
      expect(vnode.type).toBe("span")
    })

    it("applies a generated className", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-[0-9a-z]+$/)
    })

    it("same component produces same className across calls", () => {
      const Comp = styled("div")`display: flex; color: red;`
      const vnode1 = Comp({}) as VNode
      const vnode2 = Comp({}) as VNode
      expect(vnode1.props.class).toBe(vnode2.props.class)
    })

    it("different CSS produces different classNames", () => {
      const Comp1 = styled("div")`color: red;`
      const Comp2 = styled("div")`color: blue;`
      const vnode1 = Comp1({}) as VNode
      const vnode2 = Comp2({}) as VNode
      expect(vnode1.props.class).not.toBe(vnode2.props.class)
    })
  })

  describe("empty CSS", () => {
    it("renders element without className for empty template", () => {
      const Comp = styled("div")``
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toBeFalsy()
    })

    it("renders element without className for whitespace-only template", () => {
      const Comp = styled("div")`   `
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toBeFalsy()
    })
  })

  describe("static interpolations (non-function)", () => {
    it("treats string interpolations as static", () => {
      const color = "red"
      const Comp = styled("div")`color: ${color};`
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })

    it("treats number interpolations as static", () => {
      const size = 16
      const Comp = styled("div")`font-size: ${size}px;`
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })
  })

  describe("dynamic CSS (function interpolations)", () => {
    it("resolves function interpolations with props", () => {
      const Comp = styled("div")`
        color: ${(props: any) => props.color};
      `
      const vnode = Comp({ color: "red" }) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })

    it("different prop values produce different classNames", () => {
      const Comp = styled("div")`
        color: ${(props: any) => props.color};
      `
      const vnode1 = Comp({ color: "red" }) as VNode
      const vnode2 = Comp({ color: "blue" }) as VNode
      expect(vnode1.props.class).not.toBe(vnode2.props.class)
    })

    it("same prop values produce same className (dedup)", () => {
      const Comp = styled("div")`
        color: ${(props: any) => props.color};
      `
      const vnode1 = Comp({ color: "red" }) as VNode
      const vnode2 = Comp({ color: "red" }) as VNode
      expect(vnode1.props.class).toBe(vnode2.props.class)
    })

    it("handles functions returning empty string", () => {
      const Comp = styled("div")`${() => ""}`
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toBeFalsy()
    })

    it("handles functions returning false", () => {
      const Comp = styled("div")`${(props: any) => (props.active ? "color: red;" : false)}`
      const vnode = Comp({ active: false }) as VNode
      expect(vnode.props.class).toBeFalsy()
    })
  })

  describe("className merging", () => {
    it("merges user class with generated className", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ class: "custom" }) as VNode
      expect(vnode.props.class).toContain("pyr-")
      expect(vnode.props.class).toContain("custom")
    })

    it("merges user className with generated className", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ className: "custom" }) as VNode
      expect(vnode.props.class).toContain("pyr-")
      expect(vnode.props.class).toContain("custom")
    })

    it("handles class without generated className (empty CSS)", () => {
      const Comp = styled("div")``
      const vnode = Comp({ class: "custom" }) as VNode
      expect(vnode.props.class).toBe("custom")
    })
  })

  describe("as prop (polymorphic rendering)", () => {
    it("changes the rendered element type", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ as: "section" }) as VNode
      expect(vnode.type).toBe("section")
    })

    it("renders as button", () => {
      const Comp = styled("div")`cursor: pointer;`
      const vnode = Comp({ as: "button" }) as VNode
      expect(vnode.type).toBe("button")
    })

    it("defaults to original tag when as is not provided", () => {
      const Comp = styled("span")`color: red;`
      const vnode = Comp({}) as VNode
      expect(vnode.type).toBe("span")
    })
  })

  describe("prop filtering (HTML elements)", () => {
    it("forwards valid HTML attributes", () => {
      const Comp = styled("input")`display: block;`
      const vnode = Comp({ type: "text", placeholder: "test" }) as VNode
      expect(vnode.props.type).toBe("text")
      expect(vnode.props.placeholder).toBe("test")
    })

    it("forwards data-* attributes", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ "data-testid": "hello" }) as VNode
      expect(vnode.props["data-testid"]).toBe("hello")
    })

    it("forwards aria-* attributes", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ "aria-label": "world" }) as VNode
      expect(vnode.props["aria-label"]).toBe("world")
    })

    it("forwards event handlers (on* props)", () => {
      const handler = () => {
        /* no-op */
      }
      const Comp = styled("button")`cursor: pointer;`
      const vnode = Comp({ onClick: handler }) as VNode
      expect(vnode.props.onClick).toBe(handler)
    })

    it("filters unknown props for HTML elements", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ unknownProp: "test" }) as VNode
      expect(vnode.props.unknownProp).toBeUndefined()
    })

    it("filters $-prefixed transient props", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ $variant: "primary" }) as VNode
      expect(vnode.props.$variant).toBeUndefined()
    })

    it("does not forward class/className as separate props", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ class: "extra", className: "another" }) as VNode
      expect(vnode.props.className).toBeUndefined()
    })
  })

  describe("shouldForwardProp option", () => {
    it("uses custom filter when provided", () => {
      const Comp = styled("div", {
        shouldForwardProp: (prop) => prop !== "color",
      })`display: flex;`
      const vnode = Comp({ color: "red", "data-testid": "test" }) as VNode
      expect(vnode.props.color).toBeUndefined()
      expect(vnode.props["data-testid"]).toBe("test")
    })

    it("custom filter controls all prop forwarding", () => {
      const Comp = styled("div", {
        shouldForwardProp: () => false,
      })`display: flex;`
      const vnode = Comp({ id: "test", role: "button" }) as VNode
      expect(vnode.props.id).toBeUndefined()
      expect(vnode.props.role).toBeUndefined()
    })
  })

  describe("boost option", () => {
    it("accepts boost option without error", () => {
      const Comp = styled("div", { boost: true })`color: red;`
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })
  })

  describe("children forwarding", () => {
    it("passes single child through", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ children: "hello" }) as VNode
      expect(vnode.children).toEqual(["hello"])
    })

    it("passes array children through", () => {
      const Comp = styled("div")`display: flex;`
      const children = ["a", "b", "c"]
      const vnode = Comp({ children }) as VNode
      expect(vnode.children).toEqual(["a", "b", "c"])
    })

    it("handles null children", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({ children: null }) as VNode
      expect(vnode.children).toEqual([])
    })

    it("handles undefined children", () => {
      const Comp = styled("div")`display: flex;`
      const vnode = Comp({}) as VNode
      expect(vnode.children).toEqual([])
    })
  })
})

describe("styled.tag (Proxy)", () => {
  afterEach(() => {
    sheet.reset()
  })

  it("styled.div creates a div component", () => {
    const Comp = styled.div`color: red;`
    const vnode = Comp({}) as VNode
    expect(vnode.type).toBe("div")
    expect(vnode.props.class).toMatch(/^pyr-/)
  })

  it("styled.span creates a span component", () => {
    const Comp = styled.span`font-size: 16px;`
    const vnode = Comp({}) as VNode
    expect(vnode.type).toBe("span")
  })

  it("styled.button creates a button component", () => {
    const Comp = styled.button`cursor: pointer;`
    const vnode = Comp({}) as VNode
    expect(vnode.type).toBe("button")
  })

  it("styled.section creates a section component", () => {
    const Comp = styled.section`padding: 20px;`
    const vnode = Comp({}) as VNode
    expect(vnode.type).toBe("section")
  })
})
