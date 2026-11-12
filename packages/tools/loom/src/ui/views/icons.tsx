/**
 * The observatory's three inline SVG icons — the Loom mark (the warp/weft
 * grid with the ember knot), search and theme. Decorative: every use sits in
 * a control that carries its own accessible name.
 */

export function LoomGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="lm-eg" x1="0" x2="1">
          <stop offset="0" stop-color="#FF1F8C" />
          <stop offset=".55" stop-color="#FF5E1A" />
          <stop offset="1" stop-color="#FFC83D" />
        </linearGradient>
      </defs>
      <path
        d="M30 12 V108 M90 12 V108 M12 30 H108 M12 90 H108"
        stroke="currentColor"
        stroke-width="10"
        fill="none"
        stroke-linecap="square"
      />
      <circle cx="60" cy="60" r="18" fill="url(#lm-eg)" />
    </svg>
  )
}

export function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.5" />
    </svg>
  )
}

export function ThemeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5" fill="none" />
      <path d="M8 3a5 5 0 0 1 0 10z" fill="currentColor" />
    </svg>
  )
}
