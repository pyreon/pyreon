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
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
  script?: Array<{ src?: string; children?: string } & Record<string, string | undefined>>
  style?: Array<{ children: string } & Record<string, string | undefined>>
  noscript?: Array<{ children: string }>
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
  return {
    add(id, entry) {
      map.set(id, entry)
    },
    remove(id) {
      map.delete(id)
    },
    resolve() {
      const keyed = new Map<string, HeadTag>()
      const unkeyed: HeadTag[] = []
      for (const entry of map.values()) {
        for (const tag of entry.tags) {
          if (tag.key) keyed.set(tag.key, tag)
          else unkeyed.push(tag)
        }
      }
      return [...keyed.values(), ...unkeyed]
    },
    resolveTitleTemplate() {
      let template: (string | ((title: string) => string)) | undefined
      for (const entry of map.values()) {
        if (entry.titleTemplate !== undefined) template = entry.titleTemplate
      }
      return template
    },
    resolveHtmlAttrs() {
      const attrs: Record<string, string> = {}
      for (const entry of map.values()) {
        if (entry.htmlAttrs) Object.assign(attrs, entry.htmlAttrs)
      }
      return attrs
    },
    resolveBodyAttrs() {
      const attrs: Record<string, string> = {}
      for (const entry of map.values()) {
        if (entry.bodyAttrs) Object.assign(attrs, entry.bodyAttrs)
      }
      return attrs
    },
  }
}

export const HeadContext = createContext<HeadContextValue | null>(null)
