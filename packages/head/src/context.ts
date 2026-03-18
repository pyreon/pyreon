import { createContext } from "@pyreon/core"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeadTag {
  /** HTML tag name */
  tag: "title" | "meta" | "link" | "script" | "style" | "base" | "noscript"
  /**
   * Deduplication key. Tags with the same key replace each other;
   * innermost component (last added) wins.
   * Example: all components setting the page title use key "title".
   */
  key?: string
  /** HTML attributes for the tag */
  props?: Record<string, string>
  /** Text content — for <title>, <script>, <style>, <noscript> */
  children?: string
}

export interface UseHeadInput {
  title?: string
  /**
   * Title template — use `%s` as a placeholder for the page title.
   * Applied to the resolved title after deduplication.
   * @example useHead({ titleTemplate: "%s | My App" })
   */
  titleTemplate?: string | ((title: string) => string)
  meta?: Record<string, string>[]
  link?: Record<string, string>[]
  script?: ({ src?: string; children?: string } & Record<string, string | undefined>)[]
  style?: ({ children: string } & Record<string, string | undefined>)[]
  noscript?: { children: string }[]
  /** Convenience: emits a <script type="application/ld+json"> tag with JSON.stringify'd content */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
  base?: Record<string, string>
  /** Attributes to set on the <html> element (e.g. { lang: "en", dir: "ltr" }) */
  htmlAttrs?: Record<string, string>
  /** Attributes to set on the <body> element (e.g. { class: "dark" }) */
  bodyAttrs?: Record<string, string>
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface HeadEntry {
  tags: HeadTag[]
  titleTemplate?: string | ((title: string) => string) | undefined
  htmlAttrs?: Record<string, string> | undefined
  bodyAttrs?: Record<string, string> | undefined
}

export interface HeadContextValue {
  add(id: symbol, entry: HeadEntry): void
  remove(id: symbol): void
  /** Returns deduplicated tags — last-added entry wins per key */
  resolve(): HeadTag[]
  /** Returns the merged titleTemplate (last-added wins) */
  resolveTitleTemplate(): (string | ((title: string) => string)) | undefined
  /** Returns merged htmlAttrs (later entries override earlier) */
  resolveHtmlAttrs(): Record<string, string>
  /** Returns merged bodyAttrs (later entries override earlier) */
  resolveBodyAttrs(): Record<string, string>
}

export function createHeadContext(): HeadContextValue {
  const map = new Map<symbol, HeadEntry>()

  // ── Cached resolve ───────────────────────────────────────────────────────
  let dirty = true
  let cachedTags: HeadTag[] = []
  let cachedTitleTemplate: (string | ((title: string) => string)) | undefined
  let cachedHtmlAttrs: Record<string, string> = {}
  let cachedBodyAttrs: Record<string, string> = {}

  function rebuild(): void {
    if (!dirty) return
    dirty = false

    const keyed = new Map<string, HeadTag>()
    const unkeyed: HeadTag[] = []
    let titleTemplate: (string | ((title: string) => string)) | undefined
    const htmlAttrs: Record<string, string> = {}
    const bodyAttrs: Record<string, string> = {}

    for (const entry of map.values()) {
      for (const tag of entry.tags) {
        if (tag.key) keyed.set(tag.key, tag)
        else unkeyed.push(tag)
      }
      if (entry.titleTemplate !== undefined) titleTemplate = entry.titleTemplate
      if (entry.htmlAttrs) Object.assign(htmlAttrs, entry.htmlAttrs)
      if (entry.bodyAttrs) Object.assign(bodyAttrs, entry.bodyAttrs)
    }

    cachedTags = [...keyed.values(), ...unkeyed]
    cachedTitleTemplate = titleTemplate
    cachedHtmlAttrs = htmlAttrs
    cachedBodyAttrs = bodyAttrs
  }

  return {
    add(id, entry) {
      map.set(id, entry)
      dirty = true
    },
    remove(id) {
      map.delete(id)
      dirty = true
    },
    resolve() {
      rebuild()
      return cachedTags
    },
    resolveTitleTemplate() {
      rebuild()
      return cachedTitleTemplate
    },
    resolveHtmlAttrs() {
      rebuild()
      return cachedHtmlAttrs
    },
    resolveBodyAttrs() {
      rebuild()
      return cachedBodyAttrs
    },
  }
}

export const HeadContext = createContext<HeadContextValue | null>(null)
