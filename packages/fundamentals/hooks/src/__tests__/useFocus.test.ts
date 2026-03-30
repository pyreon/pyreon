import { describe, expect, it } from "vitest";
import { useFocus } from "../useFocus";

describe("useFocus", () => {
  it("initializes with focused=false", () => {
    const { focused } = useFocus();
    expect(focused()).toBe(false);
  });

  it("sets focused to true on focus", () => {
    const { focused, props } = useFocus();
    props.onFocus();
    expect(focused()).toBe(true);
  });

  it("sets focused to false on blur", () => {
    const { focused, props } = useFocus();
    props.onFocus();
    expect(focused()).toBe(true);
    props.onBlur();
    expect(focused()).toBe(false);
  });

  it("toggles focus state through multiple cycles", () => {
    const { focused, props } = useFocus();
    props.onFocus();
    expect(focused()).toBe(true);
    props.onBlur();
    expect(focused()).toBe(false);
    props.onFocus();
    expect(focused()).toBe(true);
  });

  it("calling blur when not focused is safe", () => {
    const { focused, props } = useFocus();
    props.onBlur();
    expect(focused()).toBe(false);
  });

  it("calling focus multiple times stays true", () => {
    const { focused, props } = useFocus();
    props.onFocus();
    props.onFocus();
    expect(focused()).toBe(true);
  });

  it("returns props object with onFocus and onBlur", () => {
    const { props } = useFocus();
    expect(typeof props.onFocus).toBe("function");
    expect(typeof props.onBlur).toBe("function");
  });
});
