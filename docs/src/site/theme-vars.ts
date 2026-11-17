import { duration, easing, leading, radius, space, text, tracking, z } from './theme'

/**
 * The scale tokens of `theme.ts` as CSS custom properties, for the two plain
 * stylesheets that cannot import a module: the islands' sheet
 * (`kit/site-css.ts`) and the docs sheet (`styles/docs-v3.css`).
 *
 * One source, one set of names, on every page: `SITE_CSS` carries this block,
 * and every page (marketing, docs, the 404) injects `SITE_CSS`. Colours are
 * not here: they flip with the theme and already come as `--c-*` (islands)
 * and `--dx-*` (docs).
 *
 *   --s-space-<key>     space[key] px          (--s-space-150: 12px)
 *   --s-radius-<name>   radius[name] px        (--s-radius-card: 22px)
 *   --s-fs-<role>       text[role].size px     (--s-fs-body: 15px)
 *   --s-lh-<role>       text[role].lineHeight  (--s-lh-body: 1.65)
 *   --s-leading-<name>  leading[name]
 *   --s-tracking-<name> tracking[name]
 *   --s-dur-<name>      duration[name] ms
 *   --s-ease-<name>     easing[name]
 *   --s-z-<name>        z[name]
 *
 * Breakpoints are not custom properties (a `@media` condition cannot read
 * one): use `media.up` / `media.down` from `theme.ts`.
 */
export function scaleVars(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(space)) out[`space-${k}`] = `${v}px`
  for (const [k, v] of Object.entries(radius)) out[`radius-${k}`] = `${v}px`
  for (const [role, spec] of Object.entries(text)) {
    out[`fs-${role}`] = `${spec.size}px`
    if ('lineHeight' in spec) out[`lh-${role}`] = String(spec.lineHeight)
  }
  for (const [k, v] of Object.entries(leading)) out[`leading-${k}`] = String(v)
  for (const [k, v] of Object.entries(tracking)) out[`tracking-${k}`] = v
  for (const [k, v] of Object.entries(duration)) out[`dur-${k}`] = `${v}ms`
  for (const [k, v] of Object.entries(easing)) out[`ease-${k}`] = v
  for (const [k, v] of Object.entries(z)) out[`z-${k}`] = String(v)
  return out
}

/** `:root{--s-…}`, the same in both themes. Pure; exported for tests. */
export function renderScaleVars(vars: Record<string, string> = scaleVars()): string {
  return `:root{${Object.entries(vars)
    .map(([name, value]) => `--s-${name}:${value}`)
    .join(';')}}`
}

export const SCALE_VARS_CSS = renderScaleVars()
