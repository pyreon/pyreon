/**
 * The chrome's icons — inline SVG drawn in `currentColor`, so they take the
 * button's ink in both themes. Decorative: every button that holds one has
 * its own accessible name.
 */
/**
 * The Pyreon mark's "n" stroke. The ember disc beside it is a CSS gradient
 * on `BrandMark` (see components/topbar/BrandMark.ts), not an SVG
 * `<linearGradient>`: a camelCase SVG tag does not survive an HTML parser
 * without SVG tag-name adjustment (happy-dom, which `atlas scan`'s SSR-parity
 * check hydrates in), and a gradient id is page-global.
 */
export function PyreonMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 120 120" aria-hidden="true">
      <path
        d="M70 86 L70 42 L70 64 Q70 42 92 42 Q112 42 112 64 L112 86"
        stroke="currentColor"
        stroke-width="12"
        fill="none"
        stroke-linecap="square"
      />
    </svg>
  )
}

export function CatalogIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="3" width="12" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" />
      <path d="M6 3v10" stroke="currentColor" stroke-width="1.4" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.4" />
    </svg>
  )
}

/** Sun and moon together; the theme CSS shows the one for the other mode. */
export function ThemeIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <g data-icon="sun">
        <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path
          d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
          stroke="currentColor"
          stroke-width="1.4"
          stroke-linecap="round"
        />
      </g>
      <path
        data-icon="moon"
        d="M13 9.6A5.5 5.5 0 0 1 6.4 3a5.5 5.5 0 1 0 6.6 6.6Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </svg>
  )
}
