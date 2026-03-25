import { describe, expect, it, vi } from "vitest"
import { useControllableState } from "../useControllableState"

describe("useControllableState", () => {
  it("uses defaultValue when uncontrolled", () => {
    const [value] = useControllableState({ defaultValue: "hello" })
    expect(value()).toBe("hello")
  })

  it("updates internal state when uncontrolled", () => {
    const [value, setValue] = useControllableState({ defaultValue: 0 })
    setValue(5)
    expect(value()).toBe(5)
  })

  it("uses value when controlled", () => {
    const [value] = useControllableState({ value: "controlled", defaultValue: "default" })
    expect(value()).toBe("controlled")
  })

  it("does not update internal state when controlled", () => {
    const onChange = vi.fn()
    const [value, setValue] = useControllableState({
      value: "controlled",
      defaultValue: "default",
      onChange,
    })
    setValue("new")
    expect(value()).toBe("controlled")
    expect(onChange).toHaveBeenCalledWith("new")
  })

  it("calls onChange in uncontrolled mode", () => {
    const onChange = vi.fn()
    const [, setValue] = useControllableState({ defaultValue: 0, onChange })
    setValue(10)
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it("supports updater function", () => {
    const [value, setValue] = useControllableState({ defaultValue: 1 })
    setValue((prev: number) => prev + 1)
    expect(value()).toBe(2)
  })
})
