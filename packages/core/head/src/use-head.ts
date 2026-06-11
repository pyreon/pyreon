import { onMount, onUnmount, useContext } from '@pyreon/core'
import { effect, isClient } from '@pyreon/reactivity'
import type { HeadEntry, HeadTag, UseHeadInput } from './context'
import { HeadContext } from './context'
import { syncDom } from './dom'

/** Cast a strict tag interface to the internal props format, stripping undefined values */
function toProps(obj: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v
  }
  return result
}

function buildEntry(o: UseHeadInput): HeadEntry {
  const tags: HeadTag[] = []
  if (o.title != null) tags.push({ tag: 'title', key: 'title', children: o.title })
  o.meta?.forEach((m, i) => {
    tags.push({
      tag: 'meta',
      key: m.name ?? m.property ?? `meta-${i}`,
      props: toProps(m as Record<string, string | undefined>),
    })
  })
  o.link?.forEach((l, i) => {
    tags.push({
      tag: 'link',
      key: l.href ? `link-${l.rel || ''}-${l.href}` : l.rel ? `link-${l.rel}` : `link-${i}`,
      props: toProps(l as Record<string, string | undefined>),
    })
  })
  o.script?.forEach((s, i) => {
    const { children, ...rest } = s
    // Default `<script src=...>` tags to non-blocking: if the script
    // has a `src` AND the author hasn't picked a load strategy
    // explicitly (no `type`, `async`, OR `defer`), add `defer` so the
    // script doesn't block HTML parsing. This is the modern best
    // practice — Mozilla's "Web Performance Score" + Google's Core
    // Web Vitals both penalize render-blocking scripts. Inline
    // scripts (no `src`) are left alone (they're explicit synchronous
    // content by design); `type="module"` is also left alone (modules
    // are deferred by default per the HTML spec).
    const noLoadStrategy =
      rest.src !== undefined &&
      rest.type === undefined &&
      rest.async === undefined &&
      rest.defer === undefined
    const propsWithDefault = noLoadStrategy
      ? { ...rest, defer: '' }
      : rest
    tags.push({
      tag: 'script',
      key: s.src ?? `script-${i}`,
      props: toProps(propsWithDefault as Record<string, string | undefined>),
      ...(children != null ? { children } : {}),
    })
  })
  o.style?.forEach((s, i) => {
    const { children, ...rest } = s
    tags.push({
      tag: 'style',
      key: `style-${i}`,
      props: toProps(rest as Record<string, string | undefined>),
      children,
    })
  })
  o.noscript?.forEach((ns, i) => {
    tags.push({ tag: 'noscript', key: `noscript-${i}`, children: ns.children })
  })
  if (o.jsonLd) {
    tags.push({
      tag: 'script',
      key: 'jsonld',
      props: { type: 'application/ld+json' },
      children: JSON.stringify(o.jsonLd),
    })
  }
  if (o.speculationRules) {
    tags.push({
      tag: 'script',
      key: 'speculationrules',
      props: { type: 'speculationrules' },
      children: JSON.stringify(o.speculationRules),
    })
  }
  if (o.base)
    tags.push({
      tag: 'base',
      key: 'base',
      props: toProps(o.base as Record<string, string | undefined>),
    })
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

  if (typeof input === 'function') {
    if (isClient) {
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
    onMount(() => {
      syncDom(ctx)
    })
  }

  onUnmount(() => {
    ctx.remove(id)
    syncDom(ctx)
  })
}
