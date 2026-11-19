import type { VNodeChild } from '@pyreon/core'
import { h } from '@pyreon/core'
import { renderToString } from '@pyreon/runtime-server'
import { sheet } from '@pyreon/styler'
import { PyreonUI } from '@pyreon/ui-core'
import { siteTheme } from '../theme'

/**
 * Effective CSS of server-rendered kit elements, for tests that prove a
 * consolidated component paints what the definitions it replaced painted.
 *
 * Every element of the rendered tree is listed in document order with its
 * tag and attributes (the hashed class and the rocketstyle name dropped) and
 * its effective CSS: per media query and per nested selector (`&:hover`,
 * `&:focus-visible`, a nested `@media` from `extendCss`), every property's
 * winning value after the cascade between the `elements`, `rocketstyle` and
 * `instance` layers. A value that moved from the theme to an Element prop still counts
 * as the same.
 */

export interface RenderedElement {
  open: string
  /** `media|selector|property` → value (`selector` is empty for the element itself). */
  css: Record<string, string>
}

const LAYER_ORDER = ['elements', 'rocketstyle', 'instance']
const RULE = /^@layer (\w+)\{(?:(@media[^{]+)\{)?\.([\w-]+)\{([\s\S]*)\}\}?\}$/

/** Declarations and nested blocks of one rule body, flattened to `selector|property` keys. */
function flatten(body: string, prefix: string, out: Record<string, string>, media: string): void {
  let i = 0
  let decl = ''
  while (i < body.length) {
    const c = body[i] as string
    if (c === '{') {
      // `decl` holds the nested block's selector (or at-rule); find its matching brace.
      let depth = 1
      let j = i + 1
      while (j < body.length && depth > 0) {
        if (body[j] === '{') depth++
        else if (body[j] === '}') depth--
        j++
      }
      const selector = decl.trim().replace(/\s+/g, ' ')
      const inner = body.slice(i + 1, j - 1)
      if (selector.startsWith('@media')) flatten(inner, prefix, out, `${media}${selector}`)
      else flatten(inner, `${prefix}${selector}`, out, media)
      decl = ''
      i = j
      continue
    }
    if (c === ';') {
      const k = decl.indexOf(':')
      if (k > 0) {
        const prop = decl.slice(0, k).trim()
        const value = decl.slice(k + 1).trim().replace(/\s+/g, ' ')
        if (prop && value) out[`${media}|${prefix}|${prop}`] = value
      }
      decl = ''
      i++
      continue
    }
    decl += c
    i++
  }
  const k = decl.indexOf(':')
  if (k > 0 && decl.slice(0, k).trim()) out[`${media}|${prefix}|${decl.slice(0, k).trim()}`] = decl.slice(k + 1).trim().replace(/\s+/g, ' ')
}

function effectiveCss(classes: readonly string[]): Record<string, string> {
  const rules = sheet
    .getStyleRules()
    .map((r) => RULE.exec(r.trim()))
    .filter((m): m is RegExpExecArray => m !== null && classes.includes(m[3] as string))
    .sort((a, b) => LAYER_ORDER.indexOf(a[1] as string) - LAYER_ORDER.indexOf(b[1] as string))
  const out: Record<string, string> = {}
  for (const m of rules) flatten(m[4] as string, '', out, (m[2] ?? '').trim())
  // An empty pseudo-state block leaves nothing; a declaration-free key is never written.
  return out
}

/** Render `node` on the server under `<PyreonUI>` (dark, CSS-variables mode, as the site does) and list its elements. */
export async function renderElements(node: VNodeChild): Promise<RenderedElement[]> {
  sheet.reset()
  const html = await renderToString(h(PyreonUI, { theme: siteTheme, mode: 'dark' }, h('main', null, node)))
  const inner = /^<main>([\s\S]*)<\/main>$/.exec(html)?.[1] ?? ''
  const out: RenderedElement[] = []
  for (const m of inner.matchAll(/<([a-z][\w-]*)\b[^>]*>/g)) {
    const open = m[0]
    const classes = /class="([^"]*)"/.exec(open)?.[1]?.split(/\s+/) ?? []
    out.push({
      // The hashed class, the rocketstyle name and Element's own marker attribute are implementation details.
      open: open.replace(/ class="[^"]*"/, '').replace(/ data-rocketstyle="[^"]*"/, '').replace(/ data-pyr-element="[^"]*"/, ''),
      css: effectiveCss(classes),
    })
  }
  return out
}

/** The first element only. */
export async function renderRoot(node: VNodeChild): Promise<RenderedElement> {
  const [first] = await renderElements(node)
  if (!first) throw new Error('[Pyreon] renderRoot: the node rendered no element; render an element, not text.')
  return first
}

/** The keys whose values differ between two CSS maps (missing on one side counts), sorted. */
export function cssDiff(a: Record<string, string>, b: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].filter((k) => a[k] !== b[k]).sort()
}
