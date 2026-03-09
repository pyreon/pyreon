import { useContext, onMount, onUnmount } from "@pyreon/core"
import { effect } from "@pyreon/reactivity"
import { HeadContext } from "./context"
import type { HeadTag, UseHeadInput } from "./context"
import { syncDom } from "./dom"

function buildTags(o: UseHeadInput): HeadTag[] {
  const tags: HeadTag[] = []
  if (o.title != null) tags.push({ tag: "title", key: "title", children: o.title })
  o.meta?.forEach((m, i) => tags.push({
    tag: "meta",
    key: m["name"] ?? m["property"] ?? `meta-${i}`,
    props: m,
  }))
  o.link?.forEach((l, i) => tags.push({
    tag: "link",
    key: l["rel"] ? `link-${l["rel"]}` : `link-${i}`,
    props: l,
  }))
  o.script?.forEach((s, i) => {
    const { children, ...rest } = s
    tags.push({
      tag: "script",
      key: s["src"] ?? `script-${i}`,
      props: rest as Record<string, string>,
      ...(children != null ? { children } : {}),
    })
  })
  if (o.base) tags.push({ tag: "base", key: "base", props: o.base })
  return tags
}

/**
 * Register head tags (title, meta, link, script, base) for the current component.
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
  if (!ctx) return  // no HeadProvider — silently no-op

  const id = Symbol()

  if (typeof input === "function") {
    if (typeof document !== "undefined") {
      // CSR: reactive — re-register whenever signals change
      effect(() => { ctx.add(id, buildTags(input())); syncDom(ctx) })
    } else {
      // SSR: evaluate once synchronously (no effects on server)
      ctx.add(id, buildTags(input()))
    }
  } else {
    ctx.add(id, buildTags(input))
    if (typeof document !== "undefined") {
      onMount(() => syncDom(ctx))
    }
  }

  onUnmount(() => {
    ctx.remove(id)
    if (typeof document !== "undefined") syncDom(ctx)
  })
}
