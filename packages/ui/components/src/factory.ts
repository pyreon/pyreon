import { Element, Text } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'
import { styles as renderStyles } from '@pyreon/unistyle'

// Activate ThemeDefault type augmentation for typed .theme() callbacks.
import '@pyreon/ui-theme'

// ─── Pseudo-state CSS selectors ──────────────────────────────────────────────

const PSEUDO_CSS_MAP: Record<string, string> = {
  hover: '&:hover',
  focus: '&:focus-visible',
  active: '&:active',
  disabled: '&:disabled, &[aria-disabled="true"]',
  readOnly: '&[readonly]',
}

/**
 * Shared .styles() for all UI components.
 *
 * Takes the resolved $rocketstyle theme object and:
 * 1. Renders base properties as CSS via unistyle's styles() (170+ property mappings)
 * 2. Extracts pseudo-state objects (hover, focus, active, disabled, readOnly)
 *    and wraps them in CSS pseudo selectors
 * 3. Reads $rocketstate.pseudo for JS-driven states (pressed) that have no CSS pseudo
 */
const uiStyles = (css: any) => css`
  ${({ $rocketstyle: s, $rocketstate: rs }: any) => {
    // Separate pseudo objects from base properties
    const { hover, focus, active, disabled, pressed, readOnly, ...base } = s ?? {}

    // Render base theme → CSS declarations via unistyle
    let result = renderStyles({ theme: base, css })

    // Render each pseudo-state object wrapped in its CSS selector
    for (const [key, selector] of Object.entries(PSEUDO_CSS_MAP)) {
      const pseudo = { hover, focus, active, disabled, readOnly }[key]
      if (pseudo && typeof pseudo === 'object') {
        const pseudoCSS = renderStyles({ theme: pseudo, css })
        if (pseudoCSS) result += ` ${selector} { ${pseudoCSS} }`
      }
    }

    // JS-driven pressed state — applied inline when $rocketstate.pseudo.pressed is true
    if (pressed && typeof pressed === 'object' && rs?.pseudo?.pressed) {
      result += ` ${renderStyles({ theme: pressed, css })}`
    }

    return result
  }}
`

// ─── Base components ─────────────────────────────────────────────────────────

/** Shared rocketstyle factory — useBooleans enabled for all UI components. */
export const rs = rocketstyle({ useBooleans: true })

/** Base element component — all layout/interactive components extend this. */
export const el = rs({ name: 'Base', component: Element }).styles(uiStyles)

/** Base text component — all typography components extend this. */
export const txt = rs({ name: 'TextBase', component: Text }).styles(uiStyles)
