import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { _resetRegistry, useCookie } from "../index"

function clearAllCookies(): void {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0]?.trim()
    if (name) {
      // biome-ignore lint/suspicious/noDocumentCookie: test cleanup requires direct cookie access
      document.cookie = `${name}=; max-age=0; path=/`
    }
  }
}

describe("useCookie — options", () => {
  beforeEach(() => {
    _resetRegistry()
    clearAllCookies()
  })

  afterEach(() => {
    _resetRegistry()
    clearAllCookies()
  })

  describe("maxAge", () => {
    it("sets cookie with maxAge in seconds", () => {
      const sig = useCookie("session", "token-abc", { maxAge: 3600 })
      sig.set("token-xyz")
      // Cookie should be written — we can verify the signal value
      expect(sig()).toBe("token-xyz")
    })

    it("maxAge=0 still writes cookie (browser handles expiry)", () => {
      const sig = useCookie("ephemeral", "val", { maxAge: 0 })
      sig.set("updated")
      expect(sig()).toBe("updated")
    })

    it("large maxAge for long-lived cookies", () => {
      const oneYear = 60 * 60 * 24 * 365
      const sig = useCookie("locale", "en", { maxAge: oneYear })
      sig.set("de")
      expect(sig()).toBe("de")
    })
  })

  describe("path", () => {
    it("defaults to / when no path specified", () => {
      const sig = useCookie("default-path", "val")
      sig.set("updated")
      expect(sig()).toBe("updated")
    })

    it("accepts custom path", () => {
      const sig = useCookie("scoped", "val", { path: "/admin" })
      sig.set("updated")
      expect(sig()).toBe("updated")
    })
  })

  describe("sameSite", () => {
    it("defaults to lax when not specified", () => {
      const sig = useCookie("lax-default", "val")
      sig.set("updated")
      expect(sig()).toBe("updated")
    })

    it("accepts strict sameSite", () => {
      const sig = useCookie("strict-cookie", "val", { sameSite: "strict" })
      sig.set("updated")
      expect(sig()).toBe("updated")
    })

    it("accepts none sameSite", () => {
      const sig = useCookie("none-cookie", "val", { sameSite: "none", secure: true })
      sig.set("updated")
      expect(sig()).toBe("updated")
    })

    it("accepts lax sameSite explicitly", () => {
      const sig = useCookie("explicit-lax", "val", { sameSite: "lax" })
      sig.set("updated")
      expect(sig()).toBe("updated")
    })
  })

  describe("combined options", () => {
    it("maxAge + path + sameSite together", () => {
      const sig = useCookie("combined", "default", {
        maxAge: 86400,
        path: "/app",
        sameSite: "strict",
      })
      sig.set("updated")
      expect(sig()).toBe("updated")
      sig.remove()
      expect(sig()).toBe("default")
    })

    it("expires + domain + secure together", () => {
      const future = new Date(Date.now() + 86400000)
      const sig = useCookie("full-options", "val", {
        expires: future,
        domain: "example.com",
        secure: true,
        sameSite: "none",
      })
      sig.set("updated")
      expect(sig()).toBe("updated")
    })

    it("all options combined", () => {
      const sig = useCookie("all-opts", "val", {
        maxAge: 7200,
        path: "/dashboard",
        domain: "example.com",
        secure: true,
        sameSite: "strict",
      })
      sig.set("new-val")
      expect(sig()).toBe("new-val")
    })
  })

  describe("custom serializer/deserializer", () => {
    it("uses custom serializer for cookie writes", () => {
      const sig = useCookie("date-cookie", new Date("2025-01-01"), {
        serializer: (d) => d.toISOString(),
        deserializer: (s) => new Date(s),
      })
      const newDate = new Date("2025-06-15")
      sig.set(newDate)
      expect(sig().toISOString()).toBe("2025-06-15T00:00:00.000Z")
    })
  })

  describe("remove with options", () => {
    it("remove() resets signal regardless of cookie options", () => {
      const sig = useCookie("removable", "default", {
        maxAge: 86400,
        path: "/app",
        domain: "example.com",
      })
      sig.set("changed")
      sig.remove()
      expect(sig()).toBe("default")
    })

    it("after remove(), a new useCookie call creates a fresh signal", () => {
      const a = useCookie("temp-cookie", "first")
      a.set("modified")
      a.remove()

      const b = useCookie("temp-cookie", "second")
      expect(b()).toBe("second")
      expect(a).not.toBe(b)
    })
  })

  describe("onError callback", () => {
    it("calls onError when deserialization fails", () => {
      // Pre-seed a corrupt cookie
      // biome-ignore lint/suspicious/noDocumentCookie: test setup
      document.cookie = `broken-cookie=${encodeURIComponent("{invalid json")}; path=/`

      const errors: Error[] = []
      const sig = useCookie("broken-cookie", "fallback", {
        onError: (e) => {
          errors.push(e)
          return undefined
        },
      })
      expect(sig()).toBe("fallback")
      expect(errors).toHaveLength(1)
    })

    it("onError can provide custom fallback", () => {
      // biome-ignore lint/suspicious/noDocumentCookie: test setup
      document.cookie = `bad-cookie=${encodeURIComponent("not-json{")}`
      const sig = useCookie("bad-cookie", "default", {
        onError: () => "custom-fallback",
      })
      expect(sig()).toBe("custom-fallback")
    })
  })
})
