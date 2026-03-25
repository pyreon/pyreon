import { describe, expect, it } from "vitest"
import alignContent from "../styles/alignContent"

describe("alignContent", () => {
  it("returns null for empty attrs", () => {
    expect(alignContent({} as any)).toBeNull()
  })

  it("returns null when direction is missing", () => {
    expect(alignContent({ alignX: "left", alignY: "top" } as any)).toBeNull()
  })

  it("returns null when alignX is missing", () => {
    expect(alignContent({ direction: "inline", alignY: "top" } as any)).toBeNull()
  })

  it("returns null when alignY is missing", () => {
    expect(alignContent({ direction: "inline", alignX: "left" } as any)).toBeNull()
  })

  describe("inline direction (reverted)", () => {
    it("returns row with align-items from Y and justify-content from X", () => {
      const result = alignContent({ direction: "inline", alignX: "left", alignY: "top" })
      expect(result).toBe(
        "flex-direction: row; align-items: flex-start; justify-content: flex-start;",
      )
    })

    it("maps right/bottom correctly", () => {
      const result = alignContent({ direction: "inline", alignX: "right", alignY: "bottom" })
      expect(result).toBe("flex-direction: row; align-items: flex-end; justify-content: flex-end;")
    })

    it("maps center/center", () => {
      const result = alignContent({ direction: "inline", alignX: "center", alignY: "center" })
      expect(result).toBe("flex-direction: row; align-items: center; justify-content: center;")
    })

    it("maps spaceBetween/spaceAround", () => {
      const result = alignContent({
        direction: "inline",
        alignX: "spaceBetween",
        alignY: "spaceAround",
      })
      expect(result).toBe(
        "flex-direction: row; align-items: space-around; justify-content: space-between;",
      )
    })

    it("maps block/block", () => {
      const result = alignContent({ direction: "inline", alignX: "block", alignY: "block" })
      expect(result).toBe("flex-direction: row; align-items: stretch; justify-content: stretch;")
    })
  })

  describe("reverseInline direction (reverted)", () => {
    it("returns row-reverse with align-items from Y and justify-content from X", () => {
      const result = alignContent({ direction: "reverseInline", alignX: "left", alignY: "top" })
      expect(result).toBe(
        "flex-direction: row-reverse; align-items: flex-start; justify-content: flex-start;",
      )
    })

    it("maps center/bottom", () => {
      const result = alignContent({
        direction: "reverseInline",
        alignX: "center",
        alignY: "bottom",
      })
      expect(result).toBe(
        "flex-direction: row-reverse; align-items: flex-end; justify-content: center;",
      )
    })
  })

  describe("rows direction (non-reverted)", () => {
    it("returns column with align-items from X and justify-content from Y", () => {
      const result = alignContent({ direction: "rows", alignX: "left", alignY: "top" })
      expect(result).toBe(
        "flex-direction: column; align-items: flex-start; justify-content: flex-start;",
      )
    })

    it("maps right/bottom correctly", () => {
      const result = alignContent({ direction: "rows", alignX: "right", alignY: "bottom" })
      expect(result).toBe(
        "flex-direction: column; align-items: flex-end; justify-content: flex-end;",
      )
    })

    it("maps center/spaceBetween", () => {
      const result = alignContent({ direction: "rows", alignX: "center", alignY: "spaceBetween" })
      expect(result).toBe(
        "flex-direction: column; align-items: center; justify-content: space-between;",
      )
    })

    it("maps spaceAround/block", () => {
      const result = alignContent({ direction: "rows", alignX: "spaceAround", alignY: "block" })
      expect(result).toBe(
        "flex-direction: column; align-items: space-around; justify-content: stretch;",
      )
    })
  })

  describe("reverseRows direction (non-reverted)", () => {
    it("returns column-reverse with align-items from X and justify-content from Y", () => {
      const result = alignContent({ direction: "reverseRows", alignX: "left", alignY: "top" })
      expect(result).toBe(
        "flex-direction: column-reverse; align-items: flex-start; justify-content: flex-start;",
      )
    })

    it("maps block/center", () => {
      const result = alignContent({ direction: "reverseRows", alignX: "block", alignY: "center" })
      expect(result).toBe(
        "flex-direction: column-reverse; align-items: stretch; justify-content: center;",
      )
    })
  })
})
