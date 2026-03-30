import { calculateChainOptions, removeUndefinedProps } from "../utils/attrs";
import { chainOptions } from "../utils/chaining";
import { removeNullableValues } from "../utils/collection";
import { calculateHocsFuncs } from "../utils/compose";
import { createStaticsEnhancers } from "../utils/statics";

// --------------------------------------------------------
// removeUndefinedProps
// --------------------------------------------------------
describe("removeUndefinedProps", () => {
  it("should remove properties with undefined values", () => {
    const result = removeUndefinedProps({
      a: 1,
      b: undefined,
      c: "hello",
    });
    expect(result).toEqual({ a: 1, c: "hello" });
  });

  it("should keep null values", () => {
    const result = removeUndefinedProps({ a: null, b: undefined });
    expect(result).toEqual({ a: null });
  });

  it("should keep false values", () => {
    const result = removeUndefinedProps({ a: false, b: undefined });
    expect(result).toEqual({ a: false });
  });

  it("should keep zero values", () => {
    const result = removeUndefinedProps({ a: 0, b: undefined });
    expect(result).toEqual({ a: 0 });
  });

  it("should keep empty string values", () => {
    const result = removeUndefinedProps({ a: "", b: undefined });
    expect(result).toEqual({ a: "" });
  });

  it("should return empty object when all values are undefined", () => {
    const result = removeUndefinedProps({ a: undefined, b: undefined });
    expect(result).toEqual({});
  });

  it("should return all props when none are undefined", () => {
    const input = { a: 1, b: "test", c: true };
    const result = removeUndefinedProps(input);
    expect(result).toEqual(input);
  });

  it("should handle empty object", () => {
    const result = removeUndefinedProps({});
    expect(result).toEqual({});
  });
});

// --------------------------------------------------------
// removeNullableValues
// --------------------------------------------------------
describe("removeNullableValues", () => {
  it("should remove null values", () => {
    const result = removeNullableValues({ a: 1, b: null });
    expect(result).toEqual({ a: 1 });
  });

  it("should remove undefined values", () => {
    const result = removeNullableValues({ a: 1, b: undefined });
    expect(result).toEqual({ a: 1 });
  });

  it("should remove false values", () => {
    const result = removeNullableValues({ a: 1, b: false });
    expect(result).toEqual({ a: 1 });
  });

  it("should keep zero values", () => {
    const result = removeNullableValues({ a: 0, b: null });
    expect(result).toEqual({ a: 0 });
  });

  it("should keep empty string values", () => {
    const result = removeNullableValues({ a: "", b: null });
    expect(result).toEqual({ a: "" });
  });

  it("should keep truthy values", () => {
    const result = removeNullableValues({ a: 1, b: "test", c: true });
    expect(result).toEqual({ a: 1, b: "test", c: true });
  });

  it("should handle empty object", () => {
    const result = removeNullableValues({});
    expect(result).toEqual({});
  });
});

// --------------------------------------------------------
// calculateChainOptions
// --------------------------------------------------------
describe("calculateChainOptions", () => {
  it("should return empty object when no options provided", () => {
    const calculate = calculateChainOptions(undefined);
    const result = calculate([{}]);
    expect(result).toEqual({});
  });

  it("should return empty object for empty options array", () => {
    const calculate = calculateChainOptions([]);
    const result = calculate([{}]);
    expect(result).toEqual({});
  });

  it("should execute a single option function", () => {
    const fn = (props: any) => ({
      color: props.variant === "primary" ? "blue" : "gray",
    });
    const calculate = calculateChainOptions([fn]);
    const result = calculate([{ variant: "primary" }]);
    expect(result).toEqual({ color: "blue" });
  });

  it("should merge results from multiple option functions", () => {
    const fn1 = (_: any) => ({ color: "blue" });
    const fn2 = (_: any) => ({ size: "large" });
    const calculate = calculateChainOptions([fn1, fn2]);
    const result = calculate([{}]);
    expect(result).toEqual({ color: "blue", size: "large" });
  });

  it("should let later functions override earlier ones", () => {
    const fn1 = (_: any) => ({ color: "blue" });
    const fn2 = (_: any) => ({ color: "red" });
    const calculate = calculateChainOptions([fn1, fn2]);
    const result = calculate([{}]);
    expect(result).toEqual({ color: "red" });
  });

  it("should pass arguments to each option function", () => {
    const fn = vi.fn((_: any) => ({}));
    const calculate = calculateChainOptions([fn]);
    const props = { variant: "primary" };
    calculate([props]);
    expect(fn).toHaveBeenCalledWith(props);
  });
});

// --------------------------------------------------------
// chainOptions
// --------------------------------------------------------
describe("chainOptions", () => {
  it("should return default options when opts is undefined", () => {
    const defaults = [() => ({})];
    const result = chainOptions(undefined, defaults);
    expect(result).toEqual(defaults);
  });

  it("should append function to defaults", () => {
    const fn1 = () => ({ a: 1 });
    const fn2 = () => ({ b: 2 });
    const result = chainOptions(fn2, [fn1]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(fn1);
    expect(result[1]).toBe(fn2);
  });

  it("should wrap object in a function and append", () => {
    const obj = { color: "blue" };
    const result = chainOptions(obj, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.()).toEqual(obj);
  });

  it("should return empty array when no defaults and undefined opts", () => {
    const result = chainOptions(undefined, []);
    expect(result).toEqual([]);
  });

  it("should not mutate the defaults array", () => {
    const defaults = [() => ({})];
    const fn = () => ({ a: 1 });
    const result = chainOptions(fn, defaults);
    expect(defaults).toHaveLength(1);
    expect(result).toHaveLength(2);
  });
});

// --------------------------------------------------------
// createStaticsEnhancers
// --------------------------------------------------------
describe("createStaticsEnhancers", () => {
  it("should assign options to context", () => {
    const context: Record<string, any> = {};
    createStaticsEnhancers({
      context,
      options: { theme: "dark", variant: "primary" },
    });
    expect(context).toEqual({ theme: "dark", variant: "primary" });
  });

  it("should not modify context when options is empty", () => {
    const context: Record<string, any> = { existing: true };
    createStaticsEnhancers({ context, options: {} });
    expect(context).toEqual({ existing: true });
  });

  it("should merge with existing context properties", () => {
    const context: Record<string, any> = { existing: true };
    createStaticsEnhancers({ context, options: { newProp: "value" } });
    expect(context).toEqual({ existing: true, newProp: "value" });
  });
});

// --------------------------------------------------------
// calculateHocsFuncs
// --------------------------------------------------------
describe("calculateHocsFuncs", () => {
  it("should return empty array for empty options", () => {
    const result = calculateHocsFuncs({});
    expect(result).toEqual([]);
  });

  it("should filter out non-function values", () => {
    const fn = (x: any) => x;
    const result = calculateHocsFuncs({ a: fn, b: "string", c: 123 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(fn);
  });

  it("should reverse the order of functions", () => {
    const fn1 = (x: any) => x;
    const fn2 = (x: any) => x;
    const result = calculateHocsFuncs({ a: fn1, b: fn2 });
    expect(result[0]).toBe(fn2);
    expect(result[1]).toBe(fn1);
  });

  it("should return empty array for undefined input", () => {
    const result = calculateHocsFuncs(undefined as any);
    expect(result).toEqual([]);
  });
});
