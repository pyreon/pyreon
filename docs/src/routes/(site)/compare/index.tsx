import { RedirectPage } from '../../../site/pages/RedirectPage'

/** `/compare` — no index page (sitemap decision "merge"): forwards to the rival most visitors arrive with. */
export default function CompareIndex() {
  return <RedirectPage path="/compare" to="/compare/react" title="Compare Pyreon" label="Pyreon vs React →" />
}
