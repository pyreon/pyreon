/**
 * /sections — showcase page exercising the full rocketstyle + unistyle
 * pipeline. Mirrors the shape of a real multi-section page (bokisch.com-style)
 * without any private content.
 *
 * Every section tests one or more patterns that have regressed in this
 * codebase over the last 10 PRs. Playwright smoke tests assert computed
 * styles across this page at multiple viewport widths — this is the
 * visual regression safety net.
 */

import { BadgeGrid, CardGrid, Callout, Hero, InversedPanel, LogoGrid, TimelineList } from '../components/sections'

export default function SectionsPage() {
  return (
    <>
      <Hero heading="Sections Showcase" subtitle="A reference page that exercises every pattern we keep breaking — responsive theme objects, hover states, inversed mode, SSR hydration, grid layouts, images." />
      <Callout />
      <LogoGrid />
      <BadgeGrid />
      <CardGrid />
      <InversedPanel />
      <TimelineList />
    </>
  )
}
