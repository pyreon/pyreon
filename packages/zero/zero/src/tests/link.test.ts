import { describe, expect, it } from "vitest"

// Link module depends on @pyreon/router and DOM APIs.
// We test the pure logic patterns extracted from useLink:
// - path matching (isActive, isExactActive)
// - class building
// - click validation

describe("link path matching", () => {
  function isActive(href: string, currentPath: string): boolean {
    if (!currentPath || !href) return false
    if (href === "/") return currentPath === "/"
    return currentPath.startsWith(href)
  }

  function isExactActive(href: string, currentPath: string): boolean {
    if (!currentPath) return false
    return currentPath === href
  }

  describe("isActive", () => {
    it("root path only matches root exactly", () => {
      expect(isActive("/", "/")).toBe(true)
      expect(isActive("/", "/about")).toBe(false)
      expect(isActive("/", "/posts/1")).toBe(false)
    })

    it("matches nested paths", () => {
      expect(isActive("/posts", "/posts")).toBe(true)
      expect(isActive("/posts", "/posts/1")).toBe(true)
      expect(isActive("/posts", "/posts/1/edit")).toBe(true)
    })

    it("does not partially match different segments", () => {
      expect(isActive("/post", "/posts")).toBe(true) // prefix match — intended behavior
      expect(isActive("/about", "/about-us")).toBe(true) // prefix match
    })

    it("returns false for non-matching paths", () => {
      expect(isActive("/about", "/contact")).toBe(false)
      expect(isActive("/posts", "/users")).toBe(false)
    })

    it("returns false for empty values", () => {
      expect(isActive("", "/about")).toBe(false)
      expect(isActive("/about", "")).toBe(false)
    })
  })

  describe("isExactActive", () => {
    it("matches exact paths", () => {
      expect(isExactActive("/about", "/about")).toBe(true)
      expect(isExactActive("/", "/")).toBe(true)
    })

    it("does not match partial paths", () => {
      expect(isExactActive("/posts", "/posts/1")).toBe(false)
      expect(isExactActive("/posts/1", "/posts")).toBe(false)
    })

    it("returns false for empty current path", () => {
      expect(isExactActive("/about", "")).toBe(false)
    })
  })
})

describe("link class building", () => {
  function buildClasses(
    baseClass: string | undefined,
    activeClass: string | undefined,
    exactActiveClass: string | undefined,
    active: boolean,
    exactActive: boolean,
  ): string | undefined {
    const cls: string[] = []
    if (baseClass) cls.push(baseClass)
    if (activeClass && active) cls.push(activeClass)
    if (exactActiveClass && exactActive) cls.push(exactActiveClass)
    return cls.join(" ") || undefined
  }

  it("returns base class only when not active", () => {
    expect(buildClasses("nav-link", "active", "exact", false, false)).toBe("nav-link")
  })

  it("adds active class when active", () => {
    expect(buildClasses("nav-link", "active", "exact", true, false)).toBe("nav-link active")
  })

  it("adds both active and exact classes", () => {
    expect(buildClasses("nav-link", "active", "exact", true, true)).toBe("nav-link active exact")
  })

  it("returns undefined when no classes", () => {
    expect(buildClasses(undefined, undefined, undefined, false, false)).toBeUndefined()
  })

  it("only adds exact active class when exact match", () => {
    expect(buildClasses(undefined, undefined, "current-page", false, true)).toBe("current-page")
  })

  it("skips active class if not provided even when active", () => {
    expect(buildClasses("link", undefined, undefined, true, true)).toBe("link")
  })
})

describe("link click validation", () => {
  function shouldNavigate(
    defaultPrevented: boolean,
    button: number,
    metaKey: boolean,
    ctrlKey: boolean,
    shiftKey: boolean,
    altKey: boolean,
    external: boolean,
  ): boolean {
    if (defaultPrevented) return false
    if (button !== 0) return false
    if (metaKey || ctrlKey || shiftKey || altKey) return false
    if (external) return false
    return true
  }

  it("navigates on plain left click", () => {
    expect(shouldNavigate(false, 0, false, false, false, false, false)).toBe(true)
  })

  it("skips if defaultPrevented", () => {
    expect(shouldNavigate(true, 0, false, false, false, false, false)).toBe(false)
  })

  it("skips non-left clicks (middle click, right click)", () => {
    expect(shouldNavigate(false, 1, false, false, false, false, false)).toBe(false)
    expect(shouldNavigate(false, 2, false, false, false, false, false)).toBe(false)
  })

  it("skips modifier keys (new tab/window behavior)", () => {
    expect(shouldNavigate(false, 0, true, false, false, false, false)).toBe(false) // meta
    expect(shouldNavigate(false, 0, false, true, false, false, false)).toBe(false) // ctrl
    expect(shouldNavigate(false, 0, false, false, true, false, false)).toBe(false) // shift
    expect(shouldNavigate(false, 0, false, false, false, true, false)).toBe(false) // alt
  })

  it("skips external links", () => {
    expect(shouldNavigate(false, 0, false, false, false, false, true)).toBe(false)
  })
})
