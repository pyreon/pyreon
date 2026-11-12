import { Element, Text } from '@pyreon/elements'
import rocketstyle, { type ThemeModeCallback } from '@pyreon/rocketstyle'
import { makeItResponsive, styles } from '@pyreon/unistyle'
import { color, type ColorKey } from '../theme'

/**
 * `el` / `txt` — the same two bases `@pyreon/ui-components` builds on
 * (packages/ui/components/src/bases/{element,text}.ts), copied so the site
 * does not inherit the component library's `ThemeDefault` augmentation: the
 * kit reads its tokens from `../theme` directly, and the `t` a `.theme()`
 * callback receives is only the small `siteTheme`.
 *
 * Pseudo-states: put `hover` / `focus` / `active` / `disabled` objects in
 * `.theme()`; they become `:hover` / `:focus-visible` / `:active` / `:disabled`.
 */
const rs = rocketstyle({ useBooleans: false })


function split(theme: Record<string, unknown> = {}) {
  const { hover, focus, active, disabled, pressed, ...rest } = theme
  return { hover, focus, active, disabled, pressed, rest }
}

export const el = rs({ name: 'SiteBase', component: Element }).styles(
  (css) => css`
    ${({ href, onClick, $rocketstyle, $rocketstate }) => {
      const { disabled, active, pseudo = {} } = $rocketstate ?? {}
      const s = split($rocketstyle)
      const r = (theme: unknown) => makeItResponsive({ theme: theme as never, styles, css: css as never })
      return css`
        ${r(s.rest)};
        ${!disabled && (onClick || href) ? css`cursor: pointer;` : ''};
        ${!disabled ? css`&:hover { ${r(s.hover)}; }` : ''};
        ${pseudo.hover ? r(s.hover) : ''};
        ${!disabled ? css`&:focus-visible { ${r(s.focus)}; }` : ''};
        ${pseudo.focus ? r(s.focus) : ''};
        ${!disabled ? css`&:active { ${r(s.active)}; }` : ''};
        ${!disabled && (active || pseudo.pressed) ? r(s.active) : ''};
        &[aria-pressed='true'] { ${r(s.pressed)}; }
        ${disabled ? r(s.disabled) : ''};
        &:disabled, &[aria-disabled='true'] { ${r(s.disabled)}; }
      `
    }}
  `,
)

export const txt = rs({ name: 'SiteText', component: Text }).styles(
  (css) => css`
    ${({ $rocketstyle }) => {
      const s = split($rocketstyle)
      const r = (theme: unknown) => makeItResponsive({ theme: theme as never, styles, css: css as never })
      return css`
        ${r(s.rest)};
        &:hover { ${r(s.hover)}; }
        &:focus-visible { ${r(s.focus)}; }
        &:active { ${r(s.active)}; }
        &[aria-pressed='true'] { ${r(s.pressed)}; }
        &:disabled, &[aria-disabled='true'] { ${r(s.disabled)}; }
      `
    }}
  `,
)

/** rocketstyle's `mode(light, dark)` helper, as `.theme()` callbacks receive it. */
export type ModeFn = ThemeModeCallback

/**
 * A semantic colour from `theme.ts` resolved for the current mode. Under the
 * site's CSS-variables mode this is one `var(--px-m-…)` reference whose value
 * flips with `<html data-theme>`.
 */
export const tone = (m: ModeFn, key: ColorKey): string => m(color[key].light, color[key].dark) as unknown as string

/** Same as `tone`, for any `{ dark, light }` pair (gradients, shadows). */
export const pair = (m: ModeFn, p: { dark: string; light: string }): string => m(p.light, p.dark) as unknown as string

/** The site's focus treatment: a 2px ember outline, offset 2px. */
export const focusRing = (m: ModeFn) => ({
  outlineWidth: '2px',
  outlineStyle: 'solid',
  outlineColor: tone(m, 'focus'),
  outlineOffset: '2px',
})

/** Props an anchor-tagged kit component accepts (rocketstyle types them via `.attrs<…>()`). */
export type LinkAttrs = {
  href?: string | undefined
  target?: string | undefined
  rel?: string | undefined
  onClick?: ((e: MouseEvent) => void) | undefined
}

/** Props a button-tagged kit component accepts. */
export type ButtonAttrs = {
  type?: 'button' | 'submit' | 'reset' | undefined
  disabled?: boolean | undefined
  onClick?: ((e: MouseEvent) => void) | undefined
}
