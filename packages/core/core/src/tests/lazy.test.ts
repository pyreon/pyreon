import { h } from "../h";
import { lazy } from "../lazy";
import type { ComponentFn, Props, VNode } from "../types";

describe("lazy", () => {
  test("returns a LazyComponent with __loading flag", () => {
    const Comp = lazy<Props>(() => new Promise(() => {})); // never resolves
    expect(typeof Comp).toBe("function");
    expect(typeof Comp.__loading).toBe("function");
    expect(Comp.__loading()).toBe(true);
  });

  test("__loading returns true while loading", () => {
    const Comp = lazy<Props>(() => new Promise(() => {}));
    expect(Comp.__loading()).toBe(true);
  });

  test("returns null while loading (component not yet available)", () => {
    const Comp = lazy<Props>(() => new Promise(() => {}));
    const result = Comp({});
    expect(result).toBeNull();
  });

  test("resolves to the loaded component", async () => {
    const Inner: ComponentFn<{ name: string }> = (props) => h("span", null, props.name);
    const Comp = lazy(() => Promise.resolve({ default: Inner }));

    await new Promise((r) => setTimeout(r, 0));

    expect(Comp.__loading()).toBe(false);
    const result = Comp({ name: "test" });
    expect(result).not.toBeNull();
    expect((result as VNode).type).toBe(Inner);
    expect((result as VNode).props).toEqual({ name: "test" });
  });

  test("throws on import error", async () => {
    const Comp = lazy<Props>(() => Promise.reject(new Error("load failed")));

    await new Promise((r) => setTimeout(r, 0));

    expect(Comp.__loading()).toBe(false);
    expect(() => Comp({})).toThrow("load failed");
  });

  test("wraps non-Error rejection in Error", async () => {
    const Comp = lazy<Props>(() => Promise.reject("string-error"));

    await new Promise((r) => setTimeout(r, 0));

    expect(() => Comp({})).toThrow("string-error");
  });

  test("wraps numeric rejection in Error", async () => {
    const Comp = lazy<Props>(() => Promise.reject(404));

    await new Promise((r) => setTimeout(r, 0));

    expect(() => Comp({})).toThrow("404");
  });

  test("__loading is false after successful load", async () => {
    const Inner: ComponentFn = () => null;
    const Comp = lazy(() => Promise.resolve({ default: Inner }));

    expect(Comp.__loading()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(Comp.__loading()).toBe(false);
  });

  test("__loading is false after failed load", async () => {
    const Comp = lazy<Props>(() => Promise.reject(new Error("fail")));

    expect(Comp.__loading()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(Comp.__loading()).toBe(false);
  });

  test("multiple calls after load return consistent results", async () => {
    const Inner: ComponentFn = () => h("div", null, "content");
    const Comp = lazy(() => Promise.resolve({ default: Inner }));

    await new Promise((r) => setTimeout(r, 0));

    const result1 = Comp({});
    const result2 = Comp({});
    expect((result1 as VNode).type).toBe(Inner);
    expect((result2 as VNode).type).toBe(Inner);
  });

  test("passes props through to loaded component via h()", async () => {
    const Inner: ComponentFn<{ count: number }> = (props) => h("span", null, String(props.count));
    const Comp = lazy(() => Promise.resolve({ default: Inner }));

    await new Promise((r) => setTimeout(r, 0));

    const result = Comp({ count: 42 });
    expect((result as VNode).props).toEqual({ count: 42 });
  });
});
