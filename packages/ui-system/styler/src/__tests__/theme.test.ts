import { describe, expect, it } from "vitest";
import { ThemeContext, useTheme } from "../ThemeProvider";

describe("ThemeContext", () => {
  it("is a Context object", () => {
    expect(ThemeContext).toBeDefined();
    expect(ThemeContext.id).toBeDefined();
  });

  it("has an id property for context identification", () => {
    expect(typeof ThemeContext.id).toBe("symbol");
  });
});

describe("useTheme", () => {
  it("is a function", () => {
    expect(typeof useTheme).toBe("function");
  });

  it("returns the default theme (empty object) when called outside a provider", () => {
    const theme = useTheme();
    expect(theme).toEqual({});
  });

  it("can be called with a type parameter", () => {
    interface MyTheme {
      primary: string;
      spacing: number;
    }
    const theme = useTheme<MyTheme>();
    expect(theme).toBeDefined();
  });
});
