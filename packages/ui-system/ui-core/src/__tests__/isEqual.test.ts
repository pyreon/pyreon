import { describe, expect, it } from "vitest";
import isEqual from "../isEqual";

describe("isEqual", () => {
  // Primitives
  it("should return true for identical primitives", () => {
    expect(isEqual(1, 1)).toBe(true);
    expect(isEqual("a", "a")).toBe(true);
    expect(isEqual(true, true)).toBe(true);
  });

  it("should return false for different primitives", () => {
    expect(isEqual(1, 2)).toBe(false);
    expect(isEqual("a", "b")).toBe(false);
    expect(isEqual(true, false)).toBe(false);
  });

  it("should handle NaN", () => {
    expect(isEqual(NaN, NaN)).toBe(true);
  });

  it("should distinguish 0 and -0", () => {
    expect(isEqual(0, -0)).toBe(false);
  });

  // Null / undefined
  it("should return true for null === null and undefined === undefined", () => {
    expect(isEqual(null, null)).toBe(true);
    expect(isEqual(undefined, undefined)).toBe(true);
  });

  it("should return false for null vs undefined", () => {
    expect(isEqual(null, undefined)).toBe(false);
  });

  it("should return false for null vs object", () => {
    expect(isEqual(null, {})).toBe(false);
    expect(isEqual({}, null)).toBe(false);
  });

  // Objects
  it("should return true for deeply equal objects", () => {
    expect(isEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
  });

  it("should return true regardless of key order", () => {
    expect(isEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("should return false for objects with different values", () => {
    expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("should return false for objects with different keys", () => {
    expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("should return false for objects with different key counts", () => {
    expect(isEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  // Nested objects
  it("should deeply compare nested objects", () => {
    const a = { a: { b: { c: 1 } } };
    expect(isEqual(a, { a: { b: { c: 1 } } })).toBe(true);
    expect(isEqual(a, { a: { b: { c: 2 } } })).toBe(false);
  });

  it("should handle nested key order differences", () => {
    expect(isEqual({ x: { b: 2, a: 1 }, y: 3 }, { y: 3, x: { a: 1, b: 2 } })).toBe(true);
  });

  // Arrays
  it("should return true for identical arrays", () => {
    expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it("should return false for arrays with different values", () => {
    expect(isEqual([1, 2], [1, 3])).toBe(false);
  });

  it("should return false for arrays with different lengths", () => {
    expect(isEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("should not treat array and object as equal", () => {
    expect(isEqual([1], { 0: 1 })).toBe(false);
    expect(isEqual({ 0: 1 }, [1])).toBe(false);
  });

  // Mixed nested
  it("should deeply compare arrays of objects", () => {
    expect(isEqual([{ a: 1 }, { b: 2 }], [{ a: 1 }, { b: 2 }])).toBe(true);
    expect(isEqual([{ a: 1 }], [{ a: 2 }])).toBe(false);
  });

  it("should deeply compare objects with array values", () => {
    expect(isEqual({ a: [1, 2] }, { a: [1, 2] })).toBe(true);
    expect(isEqual({ a: [1, 2] }, { a: [1, 3] })).toBe(false);
  });

  // Same reference
  it("should return true for the same reference", () => {
    const obj = { a: 1 };
    expect(isEqual(obj, obj)).toBe(true);
  });

  // Type mismatches
  it("should return false for different types", () => {
    expect(isEqual(1, "1")).toBe(false);
    expect(isEqual([], {})).toBe(false);
    expect(isEqual(0, false)).toBe(false);
  });
});
