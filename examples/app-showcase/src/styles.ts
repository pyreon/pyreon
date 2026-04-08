import { RouterLink, type RouterLinkProps } from '@pyreon/router'
import { createGlobalStyle, styled } from '@pyreon/styler'
import { Card, Paragraph, Title } from '@pyreon/ui-components'
import type { Theme } from '@pyreon/ui-theme'

/**
 * Shared styled components for the app shell — sidebar, layout, homepage.
 * Section-specific styled components live in `src/sections/<section>/styled.ts`.
 *
 * Convention:
 *   • Every color/spacing/font value is read from the Pyreon theme via
 *     interpolation `${(p) => t(p).color.system.dark[800]}`. No design
 *     tokens hardcoded in the example.
 *   • Rocketstyle ui-components (Card, Title, Paragraph) are extended via
 *     the chain `.attrs(...).theme((t) => ({...}))` so the typed `t`
 *     parameter (augmented by @pyreon/ui-theme) flows through naturally.
 *   • $-prefixed transient props are consumed by the styled component
 *     and stripped before reaching the DOM.
 */

/**
 * Typed-theme accessor for styler interpolations.
 *
 * @pyreon/styler types `theme` as `DefaultTheme & Record<string, unknown>`
 * (see packages/ui-system/styler/src/resolve.ts), so `p.theme.color`
 * widens to `unknown` even when ui-theme augments DefaultTheme. This
 * helper does the cast in one place so every interpolation site stays
 * concise: `${(p) => t(p).color.system.dark[800]}`.
 */
export const t = (p: { theme?: unknown }): Theme => p.theme as Theme

// ─── Global resets ───────────────────────────────────────────────────
export const GlobalReset = createGlobalStyle`
  *, *::before, *::after { box-sizing: border-box; margin: 0; }
  body {
    font-family: ${(p) => t(p).fontFamily.base};
    background: ${(p) => t(p).color.system.base[50]};
    color: ${(p) => t(p).color.system.dark[800]};
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
  border-right: 1px solid ${(p) => t(p).color.system.base[200]};
  padding: 16px 0;
  overflow-y: auto;
  position: fixed;
  top: 0;
  bottom: 0;
  background: ${(p) => t(p).color.system.light.base};
`

/**
 * Brand "logo" link in the sidebar — wraps RouterLink so the click is
 * handled by the Pyreon router (no full page reload). Composing
 * `styled(RouterLink)` keeps the prop surface intact (`to`, `replace`,
 * `prefetch`) and avoids `as unknown as 'a'` casts.
 */
export const Brand = styled(RouterLink)<RouterLinkProps>`
  display: block;
  padding: 0 16px 16px;
  border-bottom: 1px solid ${(p) => t(p).color.system.base[200]};
  margin-bottom: 8px;
  text-decoration: none;
  color: inherit;
`

export const BrandTitle = styled('h1')`
  font-size: 18px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.dark[800]};
`

export const BrandSubtitle = styled('span')`
  font-size: ${(p) => t(p).fontSize.small}px;
  color: ${(p) => t(p).color.system.dark[400]};
`

export const NavGroup = styled('div')`
  margin-bottom: 12px;
`

export const NavGroupLabel = styled('div')`
  padding: 4px 16px;
  font-size: 11px;
  font-weight: ${(p) => t(p).fontWeight.semibold};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${(p) => t(p).color.system.dark[400]};
`

/**
 * Sidebar nav link — wraps RouterLink so each item is a real router
 * link (with prefetch + active class support) while still receiving
 * our $active / $disabled transient props for state-driven CSS.
 */
export const NavLink = styled(RouterLink)<
  RouterLinkProps & { $active?: boolean; $disabled?: boolean }
>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 16px 6px 24px;
  font-size: 13px;
  text-decoration: none;
  font-weight: ${(p) => (p.$active ? t(p).fontWeight.semibold : t(p).fontWeight.base)};
  background: ${(p) => (p.$active ? t(p).color.system.primary[100] : 'transparent')};
  color: ${(p) =>
    p.$disabled
      ? t(p).color.system.dark[400]
      : p.$active
        ? t(p).color.system.primary.text
        : t(p).color.system.dark[600]};
  cursor: ${(p) => (p.$disabled ? 'not-allowed' : 'pointer')};

  &:hover {
    background: ${(p) =>
      p.$disabled
        ? 'transparent'
        : p.$active
          ? t(p).color.system.primary[100]
          : t(p).color.system.base[100]};
  }
`

export const SoonBadge = styled('span')`
  font-size: 9px;
  padding: 2px 6px;
  background: ${(p) => t(p).color.system.base[100]};
  border-radius: ${(p) => t(p).borderRadius.pill}px;
  color: ${(p) => t(p).color.system.dark[400]};
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
  background: ${(p) => t(p).color.system.light.base};
  border: 1px solid ${(p) => t(p).color.system.base[200]};
  border-radius: ${(p) => t(p).borderRadius.large}px;
  text-align: center;
`

export const StatValue = styled('div')`
  font-size: ${(p) => t(p).headingSize.level1}px;
  font-weight: ${(p) => t(p).fontWeight.bold};
  color: ${(p) => t(p).color.system.primary.base};
  line-height: 1;
`

export const StatLabel = styled('div')`
  font-size: 13px;
  color: ${(p) => t(p).color.system.dark[500]};
  margin-top: 6px;
`

export const SectionGrid = styled('div')`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
`

/**
 * Section card on the homepage. The available variant wraps RouterLink
 * so the click is handled by the router; the disabled variant renders
 * as a plain styled `<div>` so it doesn't navigate. The page picks
 * which one based on `section.available`.
 */
export const SectionCardLink = styled(RouterLink)<RouterLinkProps>`
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
`

export const SectionCardDisabled = styled('div')`
  display: block;
  text-decoration: none;
  color: inherit;
  cursor: not-allowed;
  opacity: 0.6;
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
  background: ${(p) => t(p).color.system.primary[100]};
  color: ${(p) => t(p).color.system.primary.text};
  border-radius: ${(p) => t(p).borderRadius.base}px;
  font-family: ${(p) => t(p).fontFamily.mono};
`

// ─── Rocketstyle component extensions ───────────────────────────────
// For ui-components we extend via the rocketstyle chain. The `t` callback
// argument is fully typed because @pyreon/ui-theme augments
// rocketstyle's ThemeDefault interface.

/** Page title (h1) used on the homepage and section pages. */
export const PageTitle = Title.attrs({ tag: 'h1' }).theme(() => ({
  marginBottom: 12,
}))

/** Section heading (h2). */
export const PageSubtitle = Title.attrs({ tag: 'h2' }).theme(() => ({
  marginBottom: 16,
}))

/** Lead paragraph used on the homepage. */
export const LeadParagraph = Paragraph.theme((theme) => ({
  marginBottom: 32,
  fontSize: theme.fontSize.medium,
  color: theme.color.system.dark[600],
  maxWidth: 720,
}))

/** Footnote paragraph used at the bottom of pages. */
export const FootnoteParagraph = Paragraph.theme((theme) => ({
  marginTop: 32,
  fontSize: theme.fontSize.small,
  color: theme.color.system.dark[400],
}))

/** Card variant tuned for the section grid. */
export const SectionCard = Card.theme(() => ({
  height: '100%',
  padding: 20,
}))

/** Title used inside SectionCard. */
export const SectionCardTitle = Title.attrs({ tag: 'h3' }).theme((theme) => ({
  color: theme.color.system.primary.text,
}))

/** Tagline paragraph used inside SectionCard. */
export const SectionCardTagline = Paragraph.theme((theme) => ({
  fontSize: theme.fontSize.base,
  color: theme.color.system.dark[600],
  marginBottom: 12,
}))
