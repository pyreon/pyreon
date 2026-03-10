import { onMount, onUnmount, useContext } from "@pyreon/core"
import { effect } from "@pyreon/reactivity"
import { HeadContext } from "./context"
import type { HeadEntry, HeadTag, UseHeadInput } from "./context"
import { syncDom } from "./dom"

function buildEntry(o: UseHeadInput): HeadEntry {
  const tags: HeadTag[] = []
  if (o.title != null) tags.push({ tag: "title", key: "title", children: o.title })
  o.meta?.forEach((m, i) =>
    tags.push({
      tag: "meta",
      key: m.name ?? m.property ?? `meta-${i}`,
      props: m,
    }),
  )
  o.link?.forEach((l, i) =>
    tags.push({
      tag: "link",
      key: l.href ? `link-${l.rel ?? ""}-${l.href}` : l.rel ? `link-${l.rel}` : `link-${i}`,
      props: l,
    }),
  )
  o.script?.forEach((s, i) => {
    const { children, ...rest } = s
    tags.push({
      tag: "script",
      key: s.src ?? `script-${i}`,
      props: rest as Record<string, string>,
      ...(children != null ? { children } : {}),
    })
  })
  o.style?.forEach((s, i) => {
    const { children, ...rest } = s
    tags.push({
      tag: "style",
      key: `style-${i}`,
      props: rest as Record<string, string>,
      children,
    })
  })
  o.noscript?.forEach((ns, i) => {
    tags.push({ tag: "noscript", key: `noscript-${i}`, children: ns.children })
  })
  if (o.jsonLd) {
    tags.push({
      tag: "script",
      key: "jsonld",
      props: { type: "application/ld+json" },
      children: JSON.stringify(o.jsonLd),
    })
  }
  if (o.base) tags.push({ tag: "base", key: "base", props: o.base })
  return {
    tags,
    titleTemplate: o.titleTemplate,
    htmlAttrs: o.htmlAttrs,
    bodyAttrs: o.bodyAttrs,
  }
}

/**
 * Register head tags (title, meta, link, script, style, noscript, base, jsonLd)
 * for the current component.
 *
 * Accepts a static object or a reactive getter:
 *   useHead({ title: "My Page", meta: [{ name: "description", content: "..." }] })
 *   useHead(() => ({ title: `${count()} items` }))  // updates when signal changes
 *
 * Tags are deduplicated by key — innermost component wins.
 * Requires a <HeadProvider> (CSR) or renderWithHead() (SSR) ancestor.
 */
export function useHead(input: UseHeadInput | (() => UseHeadInput)): void {
  const ctx = useContext(HeadContext)
  if (!ctx) return // no HeadProvider — silently no-op

  const id = Symbol()

  if (typeof input === "function") {
    if (typeof document !== "undefined") {
      // CSR: reactive — re-register whenever signals change
      effect(() => {
        ctx.add(id, buildEntry(input()))
        syncDom(ctx)
      })
    } else {
      // SSR: evaluate once synchronously (no effects on server)
      ctx.add(id, buildEntry(input()))
    }
  } else {
    ctx.add(id, buildEntry(input))
    if (typeof document !== "undefined") {
      onMount(() => {
        syncDom(ctx)
        return undefined
      })
    }
  }

  onUnmount(() => {
    ctx.remove(id)
    if (typeof document !== "undefined") syncDom(ctx)
  })
}
