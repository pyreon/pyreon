---
'@pyreon/zero-content': minor
---

PR-I — sidebar / router widgets (audit H11+H13+M9+M10+M11)

Five independent fixes:

- **H11**: `defineSidebar({ groups })` config-driven mode. Pin navigation
  structure in TypeScript instead of relying on frontmatter
  `sidebar.order` / `sidebar.group`. `<Sidebar config={...}>` skips
  the auto-sort pass and preserves authored order.

- **H13**: `<Toc>` smooth-scroll on click. Intercepts the link click,
  animates `window.scrollTo({ behavior: 'smooth' })`, and updates the
  URL hash without the native jump. `scrollOffset` accommodates
  sticky headers; `smoothScroll: false` opts out.

- **M9**: `<PrevNext>` page navigation footer. Pure resolver
  (`resolvePrevNext`) + a rendered component that reads
  `currentPath`. Renders `nothing` when current entry isn't in the
  list; omits the prev/next link at list boundaries.

- **M10**: `<Breadcrumbs>` path crumb trail. Auto-derives labels from
  URL segments (`getting-started` → `Getting Started`). Optional
  `entries` lookup mode uses explicit `SidebarEntry` titles when a
  URL matches.

- **M11**: `resolvePageLayout` — frontmatter-driven per-page layout
  override. Falls back to the default layout with a `fellBack: true`
  flag when the named layout isn't in the registry, so callers can
  surface a console warning.

29 new specs cover the five contracts; H11 + M11 bisect-verified.
