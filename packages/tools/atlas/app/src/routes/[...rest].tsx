/**
 * Anything deeper than `/:component` (`/card/extra/`) — no page answers it.
 * The layout still renders the workbench, which selects its default component
 * and navigates the router there (see `WorkbenchRoute`), so a mangled link
 * lands on a working page instead of a blank one.
 */
export default function Unknown() {
  return null
}
