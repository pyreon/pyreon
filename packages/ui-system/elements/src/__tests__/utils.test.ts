import { describe, expect, it } from "vitest"
import { getShouldBeEmpty, isInlineElement } from "../Element/utils"
import { isWebFixNeeded } from "../helpers/Wrapper/utils"

describe("isInlineElement", () => {
  it("returns true for inline elements", () => {
    expect(isInlineElement("span")).toBe(true)
    expect(isInlineElement("a")).toBe(true)
    expect(isInlineElement("button")).toBe(true)
    expect(isInlineElement("input")).toBe(true)
    expect(isInlineElement("label")).toBe(true)
    expect(isInlineElement("strong")).toBe(true)
    expect(isInlineElement("em")).toBe(true)
    expect(isInlineElement("img")).toBe(true)
  })

  it("returns false for block elements", () => {
    expect(isInlineElement("div")).toBe(false)
    expect(isInlineElement("p")).toBe(false)
    expect(isInlineElement("section")).toBe(false)
    expect(isInlineElement("header")).toBe(false)
  })

  it("returns false for undefined", () => {
    expect(isInlineElement(undefined)).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isInlineElement("")).toBe(false)
  })
})

describe("getShouldBeEmpty", () => {
  it("returns true for void elements", () => {
    expect(getShouldBeEmpty("br")).toBe(true)
    expect(getShouldBeEmpty("img")).toBe(true)
    expect(getShouldBeEmpty("input")).toBe(true)
    expect(getShouldBeEmpty("hr")).toBe(true)
    expect(getShouldBeEmpty("embed")).toBe(true)
  })

  it("returns false for non-void elements", () => {
    expect(getShouldBeEmpty("div")).toBe(false)
    expect(getShouldBeEmpty("span")).toBe(false)
    expect(getShouldBeEmpty("p")).toBe(false)
  })

  it("returns false for undefined", () => {
    expect(getShouldBeEmpty(undefined)).toBe(false)
  })
})

describe("isWebFixNeeded", () => {
  it("returns true for button, fieldset, legend", () => {
    expect(isWebFixNeeded("button")).toBe(true)
    expect(isWebFixNeeded("fieldset")).toBe(true)
    expect(isWebFixNeeded("legend")).toBe(true)
  })

  it("returns false for other elements", () => {
    expect(isWebFixNeeded("div")).toBe(false)
    expect(isWebFixNeeded("span")).toBe(false)
    expect(isWebFixNeeded("input")).toBe(false)
  })

  it("returns false for undefined", () => {
    expect(isWebFixNeeded(undefined)).toBe(false)
  })
})
