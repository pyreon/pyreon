import { describe, expect, it } from "vitest";
import stripUnit from "../units/stripUnit";
import value from "../units/value";
import values from "../units/values";

describe("stripUnit", () => {
  it("strips px unit and returns number", () => {
    expect(stripUnit("16px")).toBe(16);
  });

  it("strips rem unit and returns number", () => {
    expect(stripUnit("1.5rem")).toBe(1.5);
  });

  it("strips em unit and returns number", () => {
    expect(stripUnit("2em")).toBe(2);
  });

  it("strips % and returns number", () => {
    expect(stripUnit("50%")).toBe(50);
  });

  it("handles negative values", () => {
    expect(stripUnit("-10px")).toBe(-10);
  });

  it("handles decimal values", () => {
    expect(stripUnit("0.5rem")).toBe(0.5);
  });

  it("returns original string for non-numeric strings", () => {
    expect(stripUnit("auto")).toBe("auto");
  });

  it("passes through numbers", () => {
    expect(stripUnit(42)).toBe(42);
  });

  describe("with unitReturn=true", () => {
    it("returns [value, unit] tuple for px", () => {
      expect(stripUnit("16px", true)).toEqual([16, "px"]);
    });

    it("returns [value, unit] tuple for rem", () => {
      expect(stripUnit("2rem", true)).toEqual([2, "rem"]);
    });

    it("returns [value, unit] tuple for %", () => {
      expect(stripUnit("50%", true)).toEqual([50, "%"]);
    });

    it("returns [value, unit] tuple for em", () => {
      expect(stripUnit("1.5em", true)).toEqual([1.5, "em"]);
    });

    it("returns [value, empty string] for unitless number string", () => {
      expect(stripUnit("42", true)).toEqual([42, ""]);
    });

    it("returns [number, undefined] for number input", () => {
      expect(stripUnit(42, true)).toEqual([42, undefined]);
    });
  });
});

describe("value", () => {
  it("returns string values as-is", () => {
    expect(value("50%")).toBe("50%");
    expect(value("2em")).toBe("2em");
    expect(value("100vh")).toBe("100vh");
  });

  it("returns 0 as-is", () => {
    expect(value(0)).toBe(0);
  });

  it("returns null for null/undefined", () => {
    expect(value(null)).toBeNull();
    expect(value(undefined)).toBeNull();
  });

  it("converts unitless numbers to rem by default (divides by rootSize)", () => {
    // 16 / 16 = 1rem
    expect(value(16)).toBe("1rem");
    // 32 / 16 = 2rem
    expect(value(32)).toBe("2rem");
  });

  it("converts px values to rem", () => {
    expect(value("16px")).toBe("1rem");
    expect(value("32px")).toBe("2rem");
  });

  it("respects custom rootSize", () => {
    // 20 / 10 = 2rem
    expect(value(20, 10)).toBe("2rem");
  });

  it("respects outputUnit=px for unitless numbers", () => {
    expect(value(16, 16, "px")).toBe("16px");
  });
});

describe("values", () => {
  it("returns the first defined value converted", () => {
    expect(values([undefined, null, 16])).toBe("1rem");
  });

  it("returns the first value if defined", () => {
    expect(values([32, 16])).toBe("2rem");
  });

  it("passes through string values", () => {
    expect(values(["50%"])).toBe("50%");
  });

  it("returns null when all values are null/undefined", () => {
    expect(values([undefined, null])).toBeNull();
  });

  it("returns 0 for zero value", () => {
    expect(values([0])).toBe(0);
  });

  it("joins array values with spaces", () => {
    const result = values([[16, 32]]);
    expect(result).toContain("1rem");
    expect(result).toContain("2rem");
  });

  it("respects rootSize parameter", () => {
    expect(values([20], 10)).toBe("2rem");
  });
});
