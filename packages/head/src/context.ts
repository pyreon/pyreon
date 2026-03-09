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
  meta?: Array<Record<string, string>>
  link?: Array<Record<string, string>>
  script?: Array<{ src?: string; children?: string } & Record<string, string | undefined>>
  base?: Record<string, string>
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface HeadContextValue {
  add(id: symbol, tags: HeadTag[]): void
  remove(id: symbol): void
  /** Returns deduplicated tags — last-added entry wins per key */
  resolve(): HeadTag[]
}

export function createHeadContext(): HeadContextValue {
  const map = new Map<symbol, HeadTag[]>()
  return {
    add(id, tags) { map.set(id, tags) },
    remove(id) { map.delete(id) },
    resolve() {
      const keyed = new Map<string, HeadTag>()
      const unkeyed: HeadTag[] = []
      for (const tags of map.values()) {
        for (const tag of tags) {
          if (tag.key) keyed.set(tag.key, tag)
          else unkeyed.push(tag)
        }
      }
      return [...keyed.values(), ...unkeyed]
    },
  }
}

export const HeadContext = createContext<HeadContextValue | null>(null)
