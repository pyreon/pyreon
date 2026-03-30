import { createI18n } from "../create-i18n";
import {
  _resetDevtools,
  getActiveI18nInstances,
  getI18nInstance,
  getI18nSnapshot,
  onI18nChange,
  registerI18n,
  unregisterI18n,
} from "../devtools";

afterEach(() => _resetDevtools());

describe("i18n devtools", () => {
  test("getActiveI18nInstances returns empty initially", () => {
    expect(getActiveI18nInstances()).toEqual([]);
  });

  test("registerI18n makes instance visible", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hello" } } });
    registerI18n("app", i18n);
    expect(getActiveI18nInstances()).toEqual(["app"]);
  });

  test("getI18nInstance returns the registered instance", () => {
    const i18n = createI18n({ locale: "en", messages: { en: { hi: "Hello" } } });
    registerI18n("app", i18n);
    expect(getI18nInstance("app")).toBe(i18n);
  });

  test("getI18nInstance returns undefined for unregistered name", () => {
    expect(getI18nInstance("nope")).toBeUndefined();
  });

  test("unregisterI18n removes the instance", () => {
    const i18n = createI18n({ locale: "en" });
    registerI18n("app", i18n);
    unregisterI18n("app");
    expect(getActiveI18nInstances()).toEqual([]);
  });

  test("getI18nSnapshot returns current state", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hi: "Hello" }, de: { hi: "Hallo" } },
    });
    registerI18n("app", i18n);
    const snapshot = getI18nSnapshot("app");
    expect(snapshot).toBeDefined();
    expect(snapshot!.locale).toBe("en");
    expect(snapshot!.availableLocales).toEqual(expect.arrayContaining(["en", "de"]));
    expect(snapshot!.isLoading).toBe(false);
  });

  test("getI18nSnapshot handles instance with non-function properties", () => {
    // Register a plain object where properties are NOT functions
    // This covers the false branches of typeof checks in getI18nSnapshot
    const plainInstance = {
      locale: "not-a-function",
      availableLocales: 42,
      loadedNamespaces: null,
      isLoading: undefined,
    };
    registerI18n("plain", plainInstance);
    const snapshot = getI18nSnapshot("plain");
    expect(snapshot).toBeDefined();
    expect(snapshot!.locale).toBeUndefined();
    expect(snapshot!.availableLocales).toEqual([]);
    expect(snapshot!.loadedNamespaces).toEqual([]);
    expect(snapshot!.isLoading).toBe(false);
  });

  test("getI18nSnapshot reflects locale change", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {}, de: {} } });
    registerI18n("app", i18n);
    i18n.locale.set("de");
    const snapshot = getI18nSnapshot("app");
    expect(snapshot!.locale).toBe("de");
  });

  test("getI18nSnapshot returns undefined for unregistered name", () => {
    expect(getI18nSnapshot("nope")).toBeUndefined();
  });

  test("onI18nChange fires on register", () => {
    const calls: number[] = [];
    const unsub = onI18nChange(() => calls.push(1));

    registerI18n("app", createI18n({ locale: "en" }));
    expect(calls.length).toBe(1);

    unsub();
  });

  test("onI18nChange fires on unregister", () => {
    registerI18n("app", createI18n({ locale: "en" }));

    const calls: number[] = [];
    const unsub = onI18nChange(() => calls.push(1));
    unregisterI18n("app");
    expect(calls.length).toBe(1);

    unsub();
  });

  test("onI18nChange unsubscribe stops notifications", () => {
    const calls: number[] = [];
    const unsub = onI18nChange(() => calls.push(1));
    unsub();

    registerI18n("app", createI18n({ locale: "en" }));
    expect(calls.length).toBe(0);
  });

  test("multiple instances are tracked", () => {
    registerI18n("app", createI18n({ locale: "en" }));
    registerI18n("admin", createI18n({ locale: "en" }));
    expect(getActiveI18nInstances().sort()).toEqual(["admin", "app"]);
  });

  test("getI18nInstance cleans up and returns undefined when WeakRef is dead", () => {
    const instance = createI18n({ locale: "en" });
    const originalWeakRef = globalThis.WeakRef;
    let mockDerefResult: object | undefined = instance;
    const MockWeakRef = class {
      deref() {
        return mockDerefResult;
      }
    };
    globalThis.WeakRef = MockWeakRef as any;

    _resetDevtools();
    registerI18n("mock-instance", instance);
    expect(getI18nInstance("mock-instance")).toBe(instance);

    // Simulate GC
    mockDerefResult = undefined;
    expect(getI18nInstance("mock-instance")).toBeUndefined();

    globalThis.WeakRef = originalWeakRef;
  });

  test("getActiveI18nInstances cleans up garbage-collected WeakRefs", () => {
    const instance = createI18n({ locale: "en" });
    const originalWeakRef = globalThis.WeakRef;
    let mockDerefResult: object | undefined = instance;
    const MockWeakRef = class {
      deref() {
        return mockDerefResult;
      }
    };
    globalThis.WeakRef = MockWeakRef as any;

    _resetDevtools();
    registerI18n("gc-instance", instance);
    expect(getActiveI18nInstances()).toEqual(["gc-instance"]);

    // Simulate GC
    mockDerefResult = undefined;
    expect(getActiveI18nInstances()).toEqual([]);

    globalThis.WeakRef = originalWeakRef;
  });
});
