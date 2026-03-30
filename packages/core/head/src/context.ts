import { createContext } from "@pyreon/core";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeadTag {
  /** HTML tag name */
  tag: "title" | "meta" | "link" | "script" | "style" | "base" | "noscript";
  /**
   * Deduplication key. Tags with the same key replace each other;
   * innermost component (last added) wins.
   * Example: all components setting the page title use key "title".
   */
  key?: string;
  /** HTML attributes for the tag */
  props?: Record<string, string>;
  /** Text content — for <title>, <script>, <style>, <noscript> */
  children?: string;
}

// ─── Strict tag types ────────────────────────────────────────────────────────

/** Standard `<meta>` tag attributes. Catches typos like `{ naem: "description" }`. */
export interface MetaTag {
  /** Standard meta name (e.g. "description", "viewport", "robots") */
  name?: string;
  /** Open Graph / social property (e.g. "og:title", "twitter:card") */
  property?: string;
  /** HTTP equivalent header (e.g. "refresh", "content-type") */
  "http-equiv"?: string;
  /** Value associated with name, property, or http-equiv */
  content?: string;
  /** Document character encoding (e.g. "utf-8") */
  charset?: string;
  /** Schema.org itemprop */
  itemprop?: string;
  /** Media condition for applicability (e.g. "(prefers-color-scheme: dark)") */
  media?: string;
}

/** Standard `<link>` tag attributes. */
export interface LinkTag {
  /** Relationship to the current document (e.g. "stylesheet", "icon", "canonical") */
  rel?: string;
  /** URL of the linked resource */
  href?: string;
  /** Resource type hint for preloading (e.g. "style", "script", "font") */
  as?: string;
  /** MIME type (e.g. "text/css", "image/png") */
  type?: string;
  /** Media query for conditional loading */
  media?: string;
  /** CORS mode */
  crossorigin?: string;
  /** Subresource integrity hash */
  integrity?: string;
  /** Icon sizes (e.g. "32x32", "any") */
  sizes?: string;
  /** Language of the linked resource */
  hreflang?: string;
  /** Title for the link (used for alternate stylesheets) */
  title?: string;
  /** Fetch priority hint */
  fetchpriority?: "high" | "low" | "auto";
  /** Referrer policy */
  referrerpolicy?: string;
  /** Image source set for preloading responsive images */
  imagesrcset?: string;
  /** Image sizes for preloading responsive images */
  imagesizes?: string;
  /** Disable the resource (for stylesheets) */
  disabled?: string;
  /** Color for mask-icon */
  color?: string;
}

/** Standard `<script>` tag attributes. */
export interface ScriptTag {
  /** External script URL */
  src?: string;
  /** Script MIME type or module type (e.g. "module", "importmap") */
  type?: string;
  /** Load asynchronously */
  async?: string;
  /** Defer execution until document is parsed */
  defer?: string;
  /** CORS mode */
  crossorigin?: string;
  /** Subresource integrity hash */
  integrity?: string;
  /** Exclude from module-supporting browsers */
  nomodule?: string;
  /** Referrer policy */
  referrerpolicy?: string;
  /** Fetch priority hint */
  fetchpriority?: string;
  /** Inline script content */
  children?: string;
}

/** Standard `<style>` tag attributes. */
export interface StyleTag {
  /** Inline CSS content (required) */
  children: string;
  /** Media query for conditional styles */
  media?: string;
  /** Nonce for CSP */
  nonce?: string;
  /** Title for alternate stylesheets */
  title?: string;
  /** Render-blocking behavior */
  blocking?: string;
}

/** Standard `<base>` tag attributes. */
export interface BaseTag {
  /** Base URL for relative URLs in the document */
  href?: string;
  /** Default target for links and forms */
  target?: "_blank" | "_self" | "_parent" | "_top";
}

export interface UseHeadInput {
  title?: string;
  /**
   * Title template — use `%s` as a placeholder for the page title.
   * Applied to the resolved title after deduplication.
   * @example useHead({ titleTemplate: "%s | My App" })
   */
  titleTemplate?: string | ((title: string) => string);
  meta?: MetaTag[];
  link?: LinkTag[];
  script?: ScriptTag[];
  style?: StyleTag[];
  noscript?: { children: string }[];
  /** Convenience: emits a <script type="application/ld+json"> tag with JSON.stringify'd content */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  base?: BaseTag;
  /** Attributes to set on the <html> element (e.g. { lang: "en", dir: "ltr" }) */
  htmlAttrs?: Record<string, string>;
  /** Attributes to set on the <body> element (e.g. { class: "dark" }) */
  bodyAttrs?: Record<string, string>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export interface HeadEntry {
  tags: HeadTag[];
  titleTemplate?: string | ((title: string) => string) | undefined;
  htmlAttrs?: Record<string, string> | undefined;
  bodyAttrs?: Record<string, string> | undefined;
}

export interface HeadContextValue {
  add(id: symbol, entry: HeadEntry): void;
  remove(id: symbol): void;
  /** Returns deduplicated tags — last-added entry wins per key */
  resolve(): HeadTag[];
  /** Returns the merged titleTemplate (last-added wins) */
  resolveTitleTemplate(): (string | ((title: string) => string)) | undefined;
  /** Returns merged htmlAttrs (later entries override earlier) */
  resolveHtmlAttrs(): Record<string, string>;
  /** Returns merged bodyAttrs (later entries override earlier) */
  resolveBodyAttrs(): Record<string, string>;
}

export function createHeadContext(): HeadContextValue {
  const map = new Map<symbol, HeadEntry>();

  // ── Cached resolve ───────────────────────────────────────────────────────
  let dirty = true;
  let cachedTags: HeadTag[] = [];
  let cachedTitleTemplate: (string | ((title: string) => string)) | undefined;
  let cachedHtmlAttrs: Record<string, string> = {};
  let cachedBodyAttrs: Record<string, string> = {};

  function rebuild(): void {
    if (!dirty) return;
    dirty = false;

    const keyed = new Map<string, HeadTag>();
    const unkeyed: HeadTag[] = [];
    let titleTemplate: (string | ((title: string) => string)) | undefined;
    const htmlAttrs: Record<string, string> = {};
    const bodyAttrs: Record<string, string> = {};

    for (const entry of map.values()) {
      for (const tag of entry.tags) {
        if (tag.key) keyed.set(tag.key, tag);
        else unkeyed.push(tag);
      }
      if (entry.titleTemplate !== undefined) titleTemplate = entry.titleTemplate;
      if (entry.htmlAttrs) Object.assign(htmlAttrs, entry.htmlAttrs);
      if (entry.bodyAttrs) Object.assign(bodyAttrs, entry.bodyAttrs);
    }

    cachedTags = [...keyed.values(), ...unkeyed];
    cachedTitleTemplate = titleTemplate;
    cachedHtmlAttrs = htmlAttrs;
    cachedBodyAttrs = bodyAttrs;
  }

  return {
    add(id, entry) {
      map.set(id, entry);
      dirty = true;
    },
    remove(id) {
      map.delete(id);
      dirty = true;
    },
    resolve() {
      rebuild();
      return cachedTags;
    },
    resolveTitleTemplate() {
      rebuild();
      return cachedTitleTemplate;
    },
    resolveHtmlAttrs() {
      rebuild();
      return cachedHtmlAttrs;
    },
    resolveBodyAttrs() {
      rebuild();
      return cachedBodyAttrs;
    },
  };
}

export const HeadContext = createContext<HeadContextValue | null>(null);
