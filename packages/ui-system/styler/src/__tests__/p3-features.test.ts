import type { VNode } from "@pyreon/core"
import { h } from "@pyreon/core"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { css } from "../css"
import { createSheet, StyleSheet } from "../sheet"
import { styled } from "../styled"

describe("P3 features", () => {
  describe("shouldForwardProp", () => {
    it("allows custom prop filtering", () => {
      const Comp = styled("div", {
        shouldForwardProp: (prop) => prop !== "color",
      })`display: flex;`

      const vnode = Comp({ color: "red", title: "hello" }) as VNode
      expect(vnode.props.color).toBeUndefined()
      expect(vnode.props.title).toBe("hello")
    })

    it("custom filter receives all non-system props", () => {
      const forwarded: string[] = []
      const Comp = styled("div", {
        shouldForwardProp: (prop) => {
          forwarded.push(prop)
          return true
        },
      })`display: flex;`

      Comp({ "data-x": "1", title: "hi" })
      expect(forwarded).toContain("data-x")
      expect(forwarded).toContain("title")
    })

    it("works with dynamic interpolations", () => {
      const Comp = styled("div", {
        shouldForwardProp: (prop) => prop === "title",
      })`color: ${(p: any) => p.$color};`

      const vnode = Comp({ $color: "red", title: "yes", custom: "no" }) as VNode
      expect(vnode.props.title).toBe("yes")
      expect(vnode.props.custom).toBeUndefined()
    })

    it("does not affect component wrapping (components receive all props)", () => {
      const Inner = (props: { class?: string; myProp?: string }) =>
        h("div", { class: props.class, "data-my": props.myProp })

      // shouldForwardProp is only for HTML elements
      const Comp = styled(Inner, {
        shouldForwardProp: () => false,
      })`color: red;`

      const vnode = Comp({ myProp: "hello" }) as VNode
      // Components always receive all props (no filtering)
      // The VNode wraps Inner and should pass myProp through
      expect(vnode.props.myProp).toBe("hello")
    })
  })

  describe("styled(StyledComponent) — extending", () => {
    it("extends a styled component", () => {
      const Base = styled("div")`color: red;`
      const Extended = styled(Base)`font-size: 20px;`

      const vnode = Extended({}) as VNode
      // Extended wraps Base, so Base applies its own className
      // and Extended passes its className to Base as a prop
      expect(vnode.props.class).toContain("pyr-")
    })

    it("extended component receives className from outer", () => {
      const Base = styled("div")`color: red;`
      const Extended = styled(Base)`font-size: 20px;`

      const vnode = Extended({ className: "user-cls" }) as VNode
      expect(vnode.props.class).toContain("user-cls")
    })

    it("multi-level extension works", () => {
      const L1 = styled("div")`display: flex;`
      const L2 = styled(L1)`color: red;`
      const L3 = styled(L2)`font-size: 14px;`

      const vnode = L3({}) as VNode
      expect(vnode.props.class).toContain("pyr-")
      // L3 wraps L2 which wraps L1 which wraps 'div'.
      // The outermost VNode's type is the next component in the chain.
      expect(typeof vnode.type).toBe("function")
    })
  })

  describe("HMR cleanup API", () => {
    beforeEach(() => {
      document.querySelectorAll("style[data-pyreon-styler]").forEach((el) => {
        el.remove()
      })
    })

    it("clearCache removes all cached entries", () => {
      const s = createSheet()
      s.insert("color: red;")
      s.insert("color: blue;")
      expect(s.cacheSize).toBe(2)

      s.clearCache()
      expect(s.cacheSize).toBe(0)
    })

    it("clearAll removes cache, SSR buffer, and DOM rules", () => {
      const s = new StyleSheet()
      s.insert("color: red;")
      s.insert("color: blue;")
      expect(s.cacheSize).toBe(2)

      s.clearAll()
      expect(s.cacheSize).toBe(0)
    })

    it("after clearCache, same CSS gets re-inserted", () => {
      const s = createSheet()
      s.insert("color: red;")
      expect(s.cacheSize).toBe(1)

      s.clearCache()
      expect(s.cacheSize).toBe(0)

      // Re-insert — should work since cache was cleared
      s.insert("color: red;")
      expect(s.cacheSize).toBe(1)
    })
  })

  describe("HMR cleanup API (SSR mode)", () => {
    let originalDocument: typeof document

    beforeEach(() => {
      originalDocument = globalThis.document
      // @ts-expect-error - intentionally deleting for SSR simulation
      delete globalThis.document
    })

    afterEach(() => {
      globalThis.document = originalDocument
    })

    it("clearAll in SSR mode clears buffer and cache", () => {
      const s = createSheet()
      s.insert("color: red;")
      expect(s.getStyles()).toContain("color: red;")
      expect(s.cacheSize).toBe(1)

      s.clearAll()
      expect(s.getStyles()).toBe("")
      expect(s.cacheSize).toBe(0)
    })
  })

  describe("CSS nesting (& selectors)", () => {
    it("& selectors pass through to the CSS rule", () => {
      // Native CSS nesting is supported by modern browsers
      // The resolver passes CSS through without transformation
      const Comp = styled("div")`
        color: red;
        &:hover { color: blue; }
      `
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })

    it("nested & with pseudo-elements", () => {
      const Comp = styled("div")`
        position: relative;
        &::before { content: ""; display: block; }
        &::after { content: ""; display: block; }
      `
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })
  })

  describe("edge cases", () => {
    it("empty template with dynamic interpolation returning nothing", () => {
      const Comp = styled("div")`${(p: any) => p.$show && css`color: red;`}`
      const vnode = Comp({ $show: false }) as VNode
      // When resolved CSS is empty/whitespace, no className
      expect(vnode.props.class).toBeFalsy()
    })

    it("empty template with dynamic interpolation returning value", () => {
      const Comp = styled("div")`${(p: any) => p.$show && css`color: red;`}`
      const vnode = Comp({ $show: true }) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })

    it("deeply nested CSSResult chains resolve correctly", () => {
      const l1 = css`color: red;`
      const l2 = css`${l1} font-size: 14px;`
      const l3 = css`${l2} display: flex;`
      const l4 = css`${l3} padding: 8px;`
      const l5 = css`${l4} margin: 4px;`

      const resolved = l5.toString()
      expect(resolved).toContain("color: red;")
      expect(resolved).toContain("font-size: 14px;")
      expect(resolved).toContain("display: flex;")
      expect(resolved).toContain("padding: 8px;")
      expect(resolved).toContain("margin: 4px;")
    })

    it("anonymous component gets fallback displayName", () => {
      const Anon = (() => {
        const fn = () => null
        Object.defineProperty(fn, "name", { value: "" })
        return fn
      })()

      const Comp = styled(Anon)`color: red;`
      expect((Comp as any).displayName).toBe("styled(Component)")
    })

    it("handles very large CSS strings", () => {
      const bigCSS = Array.from({ length: 100 }, (_, i) => `prop${i}: val${i};`).join(" ")
      const Comp = styled("div")`${bigCSS}`
      const vnode = Comp({}) as VNode
      expect(vnode.props.class).toMatch(/^pyr-/)
    })

    it("different dynamic values cause different classNames", () => {
      const Comp = styled("div")`
        color: ${(p: any) => p.$color};
        font-size: ${(p: any) => p.$size};
      `

      const vnode1 = Comp({ $color: "red", $size: "14px" }) as VNode
      const cls1 = vnode1.props.class as string

      const vnode2 = Comp({ $color: "blue", $size: "16px" }) as VNode
      const cls2 = vnode2.props.class as string

      expect(cls1).not.toBe(cls2)
      expect(cls1).toMatch(/^pyr-/)
      expect(cls2).toMatch(/^pyr-/)
    })

    it("same dynamic values produce same className (dedup cache)", () => {
      const Comp = styled("div")`color: ${(p: any) => p.$color};`

      const vnode1 = Comp({ $color: "red" }) as VNode
      const cls1 = vnode1.props.class as string

      // Re-render with same value
      const vnode2 = Comp({ $color: "red" }) as VNode
      const cls2 = vnode2.props.class as string

      expect(cls1).toBe(cls2)
    })
  })
})
