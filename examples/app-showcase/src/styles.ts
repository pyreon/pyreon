import { createGlobalStyle, styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'

/**
 * Shared styled components for the app shell — sidebar, layout, homepage.
 * Section-specific styled components live in `src/sections/<section>/styled.ts`.
 *
 * Convention: $-prefixed props are "transient" — they're consumed by the
 * styled component and stripped before reaching the DOM.
 */

// ─── Color tokens (used in interpolations) ───────────────────────────
export const tokens = {
  ink: '#111827',
  text: '#374151',
  textMuted: '#6b7280',
  textFaint: '#9ca3af',
  border: '#e5e7eb',
  borderHover: '#d1d5db',
  bg: '#f6f7fb',
  surface: '#ffffff',
  surfaceAlt: '#f3f4f6',
  accent: '#4338ca',
  accentSoft: '#eef2ff',
  accentRing: '#a5b4fc',
  accentInk: '#4f46e5',
  successInk: '#10b981',
} as const

// ─── Global resets ───────────────────────────────────────────────────
export const GlobalReset = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  body {
    font-family: Inter, system-ui, sans-serif;
    background: ${tokens.bg};
    color: ${tokens.ink};
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; }
  button { font: inherit; }
`

// ─── Shell layout ────────────────────────────────────────────────────
export const Shell = styled('div')`
  display: flex;
  min-height: 100vh;
`

export const Sidebar = styled('nav')`
  width: 240px;
  border-right: 1px solid ${tokens.border};
  padding: 16px 0;
  overflow-y: auto;
  position: fixed;
  top: 0;
  bottom: 0;
  background: ${tokens.surface};
`

export const Brand = styled('a')`
  display: block;
  padding: 0 16px 16px;
  border-bottom: 1px solid ${tokens.border};
  margin-bottom: 8px;
  text-decoration: none;
  color: inherit;
`

export const BrandTitle = styled('h1')`
  font-size: 18px;
  font-weight: 700;
  color: ${tokens.ink};
`

export const BrandSubtitle = styled('span')`
  font-size: 12px;
  color: ${tokens.textFaint};
`

export const NavGroup = styled('div')`
  margin-bottom: 12px;
`

export const NavGroupLabel = styled('div')`
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${tokens.textFaint};
`

export const NavLink = styled('a')<{ $active?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 16px 6px 24px;
  font-size: 13px;
  text-decoration: none;
  font-weight: ${(p) => (p.$active ? 600 : 400)};
  background: ${(p) => (p.$active ? tokens.accentSoft : 'transparent')};
  color: ${(p) =>
    p.$disabled ? tokens.textFaint : p.$active ? tokens.accent : tokens.text};
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};

  &:hover {
    background: ${(p) =>
      p.$disabled ? 'transparent' : p.$active ? tokens.accentSoft : tokens.surfaceAlt};
  }
`

export const SoonBadge = styled('span')`
  font-size: 9px;
  padding: 2px 6px;
  background: ${tokens.surfaceAlt};
  border-radius: 999px;
  color: ${tokens.textFaint};
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

export const Main = styled('main')`
  margin-left: 240px;
  flex: 1;
  min-height: 100vh;
`

// ─── Page primitives (used by route entries) ─────────────────────────
export const Page = styled('div')`
  padding: 32px 40px;
  max-width: 1080px;
`

export const PageWide = styled('div')`
  padding: 48px 56px;
  max-width: 1080px;
`

// ─── Homepage primitives ─────────────────────────────────────────────
export const StatGrid = styled('div')`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  margin-bottom: 40px;
`

export const StatCard = styled('div')`
  padding: 20px;
  background: ${tokens.surface};
  border: 1px solid ${tokens.border};
  border-radius: 12px;
  text-align: center;
`

export const StatValue = styled('div')`
  font-size: 32px;
  font-weight: 700;
  color: ${tokens.accent};
  line-height: 1;
`

export const StatLabel = styled('div')`
  font-size: 13px;
  color: ${tokens.textMuted};
  margin-top: 6px;
`

export const SectionGrid = styled('div')`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`

export const SectionCardLink = styled('a')<{ $disabled?: boolean }>`
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};
  opacity: ${(p) => (p.$disabled ? 0.6 : 1)};
`

export const SectionCardHead = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
`

export const FeatureChips = styled('div')`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

export const FeatureChip = styled('span')`
  font-size: 11px;
  padding: 2px 8px;
  background: ${tokens.accentSoft};
  color: ${tokens.accent};
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
`

// ─── Rocketstyle component extensions ───────────────────────────────
// For ui-components we extend via the rocketstyle chain so the variants
// from @pyreon/ui-theme stay intact and the new styles compose with the
// existing theme. `.attrs(...)` controls layout (Element layout props),
// `.theme(...)` adds CSS overrides on top of the base theme.

/** Page title (h1) used on the homepage and section pages. */
export const PageTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 12,
}))

/** Section heading (h2). */
export const PageSubtitle = Title.attrs({ tag: 'h2' }).theme(() => ({
  marginBottom: 16,
}))

/** Lead paragraph used on the homepage. */
export const LeadParagraph = Paragraph.theme(() => ({
  marginBottom: 32,
  fontSize: 16,
  color: tokens.text,
  maxWidth: 720,
}))

/** Footnote paragraph used at the bottom of pages. */
export const FootnoteParagraph = Paragraph.theme(() => ({
  marginTop: 32,
  fontSize: 13,
  color: tokens.textFaint,
}))

/** Card variant tuned for the section grid. */
export const SectionCard = Card.theme(() => ({
  height: '100%',
  padding: 20,
}))

/** Title used inside SectionCard. */
export const SectionCardTitle = Title.attrs({ tag: 'h3' }).theme(() => ({
  color: tokens.accent,
}))

/** Tagline paragraph used inside SectionCard. */
export const SectionCardTagline = Paragraph.theme(() => ({
  fontSize: 14,
  color: tokens.text,
  marginBottom: 12,
}))
