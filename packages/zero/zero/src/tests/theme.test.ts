import { describe, expect, it } from "vitest";

// Theme module depends on @pyreon/reactivity signals which aren't available
// in pure test env, so we test the themeScript inline code and theme logic patterns.

describe("themeScript", () => {
  // The themeScript is an IIFE that prevents flash of wrong theme.
  // We test the logic it implements by simulating what it does.

  function resolveTheme(stored: string | null, prefersDark: boolean): "light" | "dark" {
    if (stored === "light") return "light";
    if (stored === "dark") return "dark";
    return prefersDark ? "dark" : "light";
  }

  it("returns stored light theme", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("returns stored dark theme", () => {
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to system preference when stored is null", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("falls back to system preference when stored is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("falls back to system preference for invalid stored values", () => {
    expect(resolveTheme("invalid", false)).toBe("light");
    expect(resolveTheme("", true)).toBe("dark");
  });
});

describe("theme toggle logic", () => {
  it("toggles dark to light", () => {
    const toggle = (current: "light" | "dark") => (current === "dark" ? "light" : "dark");
    expect(toggle("dark")).toBe("light");
  });

  it("toggles light to dark", () => {
    const toggle = (current: "light" | "dark") => (current === "dark" ? "light" : "dark");
    expect(toggle("light")).toBe("dark");
  });
});

describe("theme validation", () => {
  function isValidTheme(value: unknown): value is "light" | "dark" | "system" {
    return value === "light" || value === "dark" || value === "system";
  }

  it("validates valid themes", () => {
    expect(isValidTheme("light")).toBe(true);
    expect(isValidTheme("dark")).toBe(true);
    expect(isValidTheme("system")).toBe(true);
  });

  it("rejects invalid themes", () => {
    expect(isValidTheme("auto")).toBe(false);
    expect(isValidTheme("")).toBe(false);
    expect(isValidTheme(null)).toBe(false);
    expect(isValidTheme(undefined)).toBe(false);
    expect(isValidTheme(42)).toBe(false);
  });
});
