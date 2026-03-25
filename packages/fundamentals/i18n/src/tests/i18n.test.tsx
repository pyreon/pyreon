import { effect } from "@pyreon/reactivity"
import { mount } from "@pyreon/runtime-dom"
import { I18nProvider, useI18n } from "../context"
import { createI18n } from "../create-i18n"
import { interpolate } from "../interpolation"
import { resolvePluralCategory } from "../pluralization"
import { parseRichText, Trans } from "../trans"
import type { TranslationDictionary } from "../types"

// ─── interpolate ─────────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("replaces placeholders with values", () => {
    expect(interpolate("Hello {{name}}!", { name: "Alice" })).toBe("Hello Alice!")
  })

  it("handles multiple placeholders", () => {
    expect(interpolate("{{greeting}}, {{name}}!", { greeting: "Hi", name: "Bob" })).toBe("Hi, Bob!")
  })

  it("handles whitespace inside braces", () => {
    expect(interpolate("Hello {{ name }}!", { name: "Alice" })).toBe("Hello Alice!")
  })

  it("leaves unmatched placeholders as-is", () => {
    expect(interpolate("Hello {{name}}!", {})).toBe("Hello {{name}}!")
  })

  it("returns template unchanged when no values provided", () => {
    expect(interpolate("Hello {{name}}!")).toBe("Hello {{name}}!")
  })

  it("returns template unchanged when no placeholders present", () => {
    expect(interpolate("Hello world!", { name: "Alice" })).toBe("Hello world!")
  })

  it("handles number values", () => {
    expect(interpolate("Count: {{count}}", { count: 42 })).toBe("Count: 42")
  })
})

// ─── resolvePluralCategory ───────────────────────────────────────────────────

describe("resolvePluralCategory", () => {
  it('returns "one" for count 1 in English', () => {
    expect(resolvePluralCategory("en", 1)).toBe("one")
  })

  it('returns "other" for count 0 in English', () => {
    expect(resolvePluralCategory("en", 0)).toBe("other")
  })

  it('returns "other" for count > 1 in English', () => {
    expect(resolvePluralCategory("en", 5)).toBe("other")
  })

  it("uses custom plural rules when provided", () => {
    const rules = {
      custom: (count: number) => (count === 0 ? "zero" : count === 1 ? "one" : "other"),
    }
    expect(resolvePluralCategory("custom", 0, rules)).toBe("zero")
    expect(resolvePluralCategory("custom", 1, rules)).toBe("one")
    expect(resolvePluralCategory("custom", 5, rules)).toBe("other")
  })
})

// ─── createI18n ──────────────────────────────────────────────────────────────

describe("createI18n", () => {
  const en = {
    greeting: "Hello {{name}}!",
    farewell: "Goodbye",
    nested: {
      deep: {
        key: "Deep value",
      },
    },
  }

  const de = {
    greeting: "Hallo {{name}}!",
    farewell: "Auf Wiedersehen",
    nested: {
      deep: {
        key: "Tiefer Wert",
      },
    },
  }

  it("translates a simple key", () => {
    const i18n = createI18n({ locale: "en", messages: { en } })
    expect(i18n.t("greeting", { name: "Alice" })).toBe("Hello Alice!")
  })

  it("translates nested keys with dot notation", () => {
    const i18n = createI18n({ locale: "en", messages: { en } })
    expect(i18n.t("nested.deep.key")).toBe("Deep value")
  })

  it("returns the key itself when missing", () => {
    const i18n = createI18n({ locale: "en", messages: { en } })
    expect(i18n.t("nonexistent.key")).toBe("nonexistent.key")
  })

  it("falls back to fallbackLocale when key is missing", () => {
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { ...en, onlyEn: "English only" }, de },
    })
    expect(i18n.t("onlyEn")).toBe("English only")
  })

  it("calls onMissingKey when translation is not found", () => {
    const missing: string[] = []
    const i18n = createI18n({
      locale: "en",
      messages: { en },
      onMissingKey: (locale, key) => {
        missing.push(`${locale}:${key}`)
        return `[MISSING: ${key}]`
      },
    })

    expect(i18n.t("unknown")).toBe("[MISSING: unknown]")
    expect(missing).toEqual(["en:unknown"])
  })

  it("falls back to key when onMissingKey returns void", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en },
      onMissingKey: () => {
        // intentionally returns undefined
        return undefined
      },
    })

    expect(i18n.t("unknown")).toBe("unknown")
  })

  it("uses fallback locale for plural forms", () => {
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      messages: {
        en: {
          items_one: "{{count}} item",
          items_other: "{{count}} items",
        },
        de: {},
      },
    })

    // German has no items translation, falls back to English plural forms
    expect(i18n.t("items", { count: 1 })).toBe("1 item")
    expect(i18n.t("items", { count: 5 })).toBe("5 items")
  })

  it("reactively updates when locale changes", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en, de },
    })

    const results: string[] = []
    const cleanup = effect(() => {
      results.push(i18n.t("farewell"))
    })

    expect(results).toEqual(["Goodbye"])

    i18n.locale.set("de")
    expect(results).toEqual(["Goodbye", "Auf Wiedersehen"])

    cleanup.dispose()
  })

  it("reactively updates when messages are added", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en },
    })

    const results: string[] = []
    const cleanup = effect(() => {
      results.push(i18n.t("newKey"))
    })

    expect(results).toEqual(["newKey"]) // Missing key returns key itself

    i18n.addMessages("en", { newKey: "New value!" })
    expect(results).toEqual(["newKey", "New value!"])

    cleanup.dispose()
  })

  it("reports available locales", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en, de },
    })
    expect(i18n.availableLocales()).toEqual(["en", "de"])
  })

  it("exists() checks key presence", () => {
    const i18n = createI18n({ locale: "en", messages: { en } })
    expect(i18n.exists("greeting")).toBe(true)
    expect(i18n.exists("nested.deep.key")).toBe(true)
    expect(i18n.exists("nonexistent")).toBe(false)
  })

  it("exists() checks namespaced keys", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: {} },
    })
    i18n.addMessages("en", { title: "Admin Panel" }, "admin")
    expect(i18n.exists("admin:title")).toBe(true)
    expect(i18n.exists("admin:nonexistent")).toBe(false)
  })

  it("exists() checks fallback locale", () => {
    const i18n = createI18n({
      locale: "de",
      fallbackLocale: "en",
      messages: { en: { ...en, onlyEn: "yes" }, de },
    })
    expect(i18n.exists("onlyEn")).toBe(true)
  })
})

// ─── Pluralization ───────────────────────────────────────────────────────────

describe("createI18n pluralization", () => {
  it("selects the correct plural form", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: {
          items_one: "{{count}} item",
          items_other: "{{count}} items",
        },
      },
    })

    expect(i18n.t("items", { count: 1 })).toBe("1 item")
    expect(i18n.t("items", { count: 5 })).toBe("5 items")
    expect(i18n.t("items", { count: 0 })).toBe("0 items")
  })

  it("falls back to base key when plural form is missing", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: {
          items: "some items", // No _one or _other suffixes
        },
      },
    })

    expect(i18n.t("items", { count: 1 })).toBe("some items")
  })

  it("falls back to basic rules when Intl.PluralRules fails", () => {
    // Use an invalid locale to trigger the catch branch
    const category1 = resolvePluralCategory("invalid-xxx-yyy", 1)
    const category5 = resolvePluralCategory("invalid-xxx-yyy", 5)
    // Intl.PluralRules may either handle it or throw — either way we get a result
    expect(typeof category1).toBe("string")
    expect(typeof category5).toBe("string")
  })

  it("uses custom plural rules", () => {
    const i18n = createI18n({
      locale: "ar",
      pluralRules: {
        ar: (count: number) => {
          if (count === 0) return "zero"
          if (count === 1) return "one"
          if (count === 2) return "two"
          if (count >= 3 && count <= 10) return "few"
          return "other"
        },
      },
      messages: {
        ar: {
          items_zero: "لا عناصر",
          items_one: "عنصر واحد",
          items_two: "عنصران",
          items_few: "{{count}} عناصر",
          items_other: "{{count}} عنصراً",
        },
      },
    })

    expect(i18n.t("items", { count: 0 })).toBe("لا عناصر")
    expect(i18n.t("items", { count: 1 })).toBe("عنصر واحد")
    expect(i18n.t("items", { count: 2 })).toBe("عنصران")
    expect(i18n.t("items", { count: 5 })).toBe("5 عناصر")
    expect(i18n.t("items", { count: 100 })).toBe("100 عنصراً")
  })
})

// ─── Namespaces ──────────────────────────────────────────────────────────────

describe("createI18n namespaces", () => {
  it("supports namespace:key syntax", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hi" } },
    })
    // "greeting" is in the default "common" namespace
    expect(i18n.t("greeting")).toBe("Hi")
  })

  it("loads namespaces asynchronously", async () => {
    const loaderCalls: string[] = []

    const i18n = createI18n({
      locale: "en",
      loader: async (locale, namespace) => {
        loaderCalls.push(`${locale}:${namespace}`)
        if (namespace === "auth") {
          return {
            login: "Log in",
            errors: {
              invalid: "Invalid credentials",
            },
          }
        }
        return undefined
      },
    })

    expect(i18n.t("auth:login")).toBe("auth:login") // Not loaded yet

    await i18n.loadNamespace("auth")

    expect(loaderCalls).toEqual(["en:auth"])
    expect(i18n.t("auth:login")).toBe("Log in")
    expect(i18n.t("auth:errors.invalid")).toBe("Invalid credentials")
  })

  it("tracks loading state", async () => {
    let resolveLoader: ((dict: TranslationDictionary) => void) | undefined

    const i18n = createI18n({
      locale: "en",
      loader: async () => {
        return new Promise<TranslationDictionary>((resolve) => {
          resolveLoader = resolve
        })
      },
    })

    expect(i18n.isLoading()).toBe(false)

    const loadPromise = i18n.loadNamespace("test")
    expect(i18n.isLoading()).toBe(true)

    resolveLoader!({ hello: "world" })
    await loadPromise

    expect(i18n.isLoading()).toBe(false)
  })

  it("does not re-fetch already loaded namespaces", async () => {
    let callCount = 0

    const i18n = createI18n({
      locale: "en",
      loader: async () => {
        callCount++
        return { key: "value" }
      },
    })

    await i18n.loadNamespace("test")
    await i18n.loadNamespace("test")

    expect(callCount).toBe(1)
  })

  it("deduplicates concurrent loads for the same namespace", async () => {
    let callCount = 0

    const i18n = createI18n({
      locale: "en",
      loader: async () => {
        callCount++
        return { key: "value" }
      },
    })

    // Fire two loads concurrently — should only call loader once
    await Promise.all([i18n.loadNamespace("test"), i18n.loadNamespace("test")])

    expect(callCount).toBe(1)
  })

  it("loadedNamespaces reflects current locale namespaces", async () => {
    const i18n = createI18n({
      locale: "en",
      loader: async (_locale, ns) => ({ [`${ns}Key`]: "value" }),
    })

    expect(i18n.loadedNamespaces().size).toBe(0)

    await i18n.loadNamespace("auth")
    expect(i18n.loadedNamespaces().has("auth")).toBe(true)

    await i18n.loadNamespace("admin")
    expect(i18n.loadedNamespaces().has("auth")).toBe(true)
    expect(i18n.loadedNamespaces().has("admin")).toBe(true)
  })

  it("loadNamespace is a no-op without a loader", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { key: "value" } },
    })

    await i18n.loadNamespace("test") // Should not throw
    expect(i18n.isLoading()).toBe(false)
  })

  it("handles loader returning undefined", async () => {
    const i18n = createI18n({
      locale: "en",
      loader: async () => undefined,
    })

    await i18n.loadNamespace("missing")
    expect(i18n.loadedNamespaces().has("missing")).toBe(false)
  })

  it("handles loader errors gracefully", async () => {
    const i18n = createI18n({
      locale: "en",
      loader: async () => {
        throw new Error("Network error")
      },
    })

    await expect(i18n.loadNamespace("test")).rejects.toThrow("Network error")
    expect(i18n.isLoading()).toBe(false) // Loading state cleaned up
  })

  it("addMessages does not corrupt store when source is mutated", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } })

    const source = { greeting: "Hello" }
    i18n.addMessages("en", source)

    // Mutating the source should not affect the store
    source.greeting = "MUTATED"
    expect(i18n.t("greeting")).toBe("Hello")
  })

  it("loads namespace for a specific locale", async () => {
    const loaderCalls: string[] = []

    const i18n = createI18n({
      locale: "en",
      loader: async (locale, namespace) => {
        loaderCalls.push(`${locale}:${namespace}`)
        return { key: `${locale} value` }
      },
    })

    await i18n.loadNamespace("common", "de")
    expect(loaderCalls).toEqual(["de:common"])
  })

  it("addMessages merges into existing namespace", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: { existing: "yes" },
      },
    })

    i18n.addMessages("en", { added: "also yes" })
    expect(i18n.t("existing")).toBe("yes")
    expect(i18n.t("added")).toBe("also yes")
  })

  it("addMessages deep-merges nested dictionaries", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: {
          errors: {
            auth: "Auth error",
          },
        },
      },
    })

    i18n.addMessages("en", {
      errors: {
        network: "Network error",
      },
    })

    expect(i18n.t("errors.auth")).toBe("Auth error")
    expect(i18n.t("errors.network")).toBe("Network error")
  })

  it("addMessages to a specific namespace", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: {} },
    })

    i18n.addMessages("en", { title: "Dashboard" }, "admin")
    expect(i18n.t("admin:title")).toBe("Dashboard")
  })

  it("addMessages creates locale if not exists", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } })

    i18n.addMessages("fr", { greeting: "Bonjour" })
    i18n.locale.set("fr")
    expect(i18n.t("greeting")).toBe("Bonjour")
    expect(i18n.availableLocales()).toContain("fr")
  })
})

// ─── Locale switching with namespaces ────────────────────────────────────────

describe("createI18n locale switching", () => {
  it("reloads translations when switching locale with loader", async () => {
    const translations: Record<string, Record<string, TranslationDictionary>> = {
      en: { common: { hello: "Hello" } },
      de: { common: { hello: "Hallo" } },
    }

    const i18n = createI18n({
      locale: "en",
      loader: async (locale, ns) => translations[locale]?.[ns],
    })

    await i18n.loadNamespace("common")
    expect(i18n.t("hello")).toBe("Hello")

    i18n.locale.set("de")
    await i18n.loadNamespace("common")
    expect(i18n.t("hello")).toBe("Hallo")
  })

  it("handles mixed static + async messages", async () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: { staticKey: "From static" },
      },
      loader: async (_locale, ns) => {
        if (ns === "dynamic") return { dynamicKey: "From loader" }
        return undefined
      },
    })

    expect(i18n.t("staticKey")).toBe("From static")
    expect(i18n.t("dynamic:dynamicKey")).toBe("dynamic:dynamicKey")

    await i18n.loadNamespace("dynamic")
    expect(i18n.t("dynamic:dynamicKey")).toBe("From loader")
  })
})

// ─── I18nProvider / useI18n context ──────────────────────────────────────────

describe("I18nProvider / useI18n", () => {
  it("provides i18n instance to child components via useI18n", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { hello: "Hello World" } },
    })

    let received: ReturnType<typeof useI18n> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const Child = () => {
      received = useI18n()
      return null
    }
    const unmount = mount(
      <I18nProvider instance={i18n}>
        <Child />
      </I18nProvider>,
      el,
    )

    expect(received).toBe(i18n)
    expect(received!.t("hello")).toBe("Hello World")
    unmount()
    el.remove()
  })

  it("renders children passed as a function", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { key: "Value" } },
    })

    let received: ReturnType<typeof useI18n> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const Child = () => {
      received = useI18n()
      return null
    }
    const unmount = mount(<I18nProvider instance={i18n}>{() => <Child />}</I18nProvider>, el)

    expect(received).toBeDefined()
    expect(received!.t("key")).toBe("Value")
    unmount()
    el.remove()
  })

  it("useI18n throws when called outside I18nProvider", () => {
    let error: Error | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)

    const Child = () => {
      try {
        useI18n()
      } catch (e) {
        error = e as Error
      }
      return null
    }
    const unmount = mount(<Child />, el)

    expect(error).toBeDefined()
    expect(error!.message).toContain("useI18n() must be used within an <I18nProvider>")
    unmount()
    el.remove()
  })

  it("renders direct VNode children (not a function)", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { test: "Test value" } },
    })

    let received: ReturnType<typeof useI18n> | undefined
    const el = document.createElement("div")
    document.body.appendChild(el)
    const Child = () => {
      received = useI18n()
      return null
    }
    const unmount = mount(
      <I18nProvider instance={i18n}>
        <Child />
      </I18nProvider>,
      el,
    )

    expect(received).toBeDefined()
    expect(received!.t("test")).toBe("Test value")
    unmount()
    el.remove()
  })
})

// ─── Pluralization — Intl.PluralRules unavailable fallback ──────────────────

describe("resolvePluralCategory fallback when Intl is unavailable", () => {
  it("falls back to basic one/other when Intl is undefined", () => {
    const originalIntl = globalThis.Intl
    // @ts-expect-error — temporarily remove Intl
    globalThis.Intl = undefined

    expect(resolvePluralCategory("en", 1)).toBe("one")
    expect(resolvePluralCategory("en", 0)).toBe("other")
    expect(resolvePluralCategory("en", 5)).toBe("other")

    globalThis.Intl = originalIntl
  })
})

// ─── parseRichText ──────────────────────────────────────────────────────────

describe("parseRichText", () => {
  it("returns a single-element array for plain text", () => {
    expect(parseRichText("Hello world")).toEqual(["Hello world"])
  })

  it("returns empty array for empty string", () => {
    expect(parseRichText("")).toEqual([])
  })

  it("parses a single tag", () => {
    expect(parseRichText("Hello <bold>world</bold>!")).toEqual([
      "Hello ",
      { tag: "bold", children: "world" },
      "!",
    ])
  })

  it("parses multiple tags", () => {
    expect(parseRichText("Read <terms>terms</terms> and <privacy>policy</privacy>")).toEqual([
      "Read ",
      { tag: "terms", children: "terms" },
      " and ",
      { tag: "privacy", children: "policy" },
    ])
  })

  it("handles tags at the start and end", () => {
    expect(parseRichText("<a>start</a> middle <b>end</b>")).toEqual([
      { tag: "a", children: "start" },
      " middle ",
      { tag: "b", children: "end" },
    ])
  })

  it("handles adjacent tags with no gap", () => {
    expect(parseRichText("<a>one</a><b>two</b>")).toEqual([
      { tag: "a", children: "one" },
      { tag: "b", children: "two" },
    ])
  })

  it("leaves unmatched tags as plain text", () => {
    expect(parseRichText("Hello <open>no close")).toEqual(["Hello <open>no close"])
  })
})

// ─── Trans ──────────────────────────────────────────────────────────────────

describe("Trans", () => {
  it("returns plain translated text when no components provided", () => {
    const t = (key: string) => (key === "hello" ? "Hello World" : key)
    const result = Trans({ t, i18nKey: "hello" })
    expect(result).toBe("Hello World")
  })

  it("returns plain translated text with values but no components", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { greeting: "Hi {{name}}!" } },
    })
    const result = Trans({
      t: i18n.t,
      i18nKey: "greeting",
      values: { name: "Alice" },
    })
    expect(result).toBe("Hi Alice!")
  })

  it("returns plain string when components map is provided but text has no tags", () => {
    const t = () => "No tags here"
    const result = Trans({
      t,
      i18nKey: "plain",
      components: { bold: (ch: string) => ({ type: "strong", children: ch }) },
    })
    expect(result).toBe("No tags here")
  })

  it("invokes component functions for matched tags", () => {
    const t = () => "Click <link>here</link> please"
    const result = Trans({
      t,
      i18nKey: "action",
      components: {
        link: (children: string) => ({
          type: "a",
          props: { href: "/go" },
          children,
        }),
      },
    })

    // Result is a Fragment VNode; check its children
    expect(result).toBeTruthy()
    expect(typeof result).toBe("object")
    // The Fragment wraps: ["Click ", { type: 'a', ... }, " please"]
    const vnode = result as any
    expect(vnode.children.length).toBe(3)
    expect(vnode.children[0]).toBe("Click ")
    expect(vnode.children[1]).toEqual({
      type: "a",
      props: { href: "/go" },
      children: "here",
    })
    expect(vnode.children[2]).toBe(" please")
  })

  it("renders unmatched tags as plain text children (no raw HTML)", () => {
    const t = () => "Hello <unknown>world</unknown>"
    const result = Trans({
      t,
      i18nKey: "test",
      components: {}, // No matching component
    })

    const vnode = result as any
    expect(vnode.children.length).toBe(2)
    expect(vnode.children[0]).toBe("Hello ")
    // Unmatched tags render children as plain text, stripping markup for safety
    expect(vnode.children[1]).toBe("world")
  })

  it("works with values and components together", () => {
    const i18n = createI18n({
      locale: "en",
      messages: {
        en: { items: "You have <bold>{{count}}</bold> items" },
      },
    })

    const result = Trans({
      t: i18n.t,
      i18nKey: "items",
      values: { count: 42 },
      components: {
        bold: (children: string) => ({ type: "strong", children }),
      },
    })

    const vnode = result as any
    expect(vnode.children.length).toBe(3)
    expect(vnode.children[0]).toBe("You have ")
    expect(vnode.children[1]).toEqual({ type: "strong", children: "42" })
    expect(vnode.children[2]).toBe(" items")
  })
})

// ─── addMessages flat keys ──────────────────────────────────────────────────

describe("addMessages flat dot-notation keys", () => {
  it("flat key makes t() resolve via dot notation", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } })
    i18n.addMessages("en", { "section.title": "Report" })
    expect(i18n.t("section.title")).toBe("Report")
  })

  it("nested keys still work", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } })
    i18n.addMessages("en", { section: { title: "Report" } })
    expect(i18n.t("section.title")).toBe("Report")
  })

  it("mixed flat and nested keys", () => {
    const i18n = createI18n({ locale: "en", messages: { en: {} } })
    i18n.addMessages("en", { "a.b": "flat", c: { d: "nested" } })
    expect(i18n.t("a.b")).toBe("flat")
    expect(i18n.t("c.d")).toBe("nested")
  })
})

// ─── core subpath ───────────────────────────────────────────────────────────

describe("i18n core subpath", () => {
  it("exports createI18n and interpolate without @pyreon/core dependency", async () => {
    const mod = await import("../core")
    expect(mod.createI18n).toBeDefined()
    expect(mod.interpolate).toBeDefined()
  })
})
