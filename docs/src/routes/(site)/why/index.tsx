import { RedirectPage } from '../../../site/pages/RedirectPage'

/** `/why` — no index page (sitemap decision "merge"): forwards to the first story. */
export default function WhyIndex() {
  return <RedirectPage path="/why" to="/why/components-run-once" title="Why Pyreon" label="Components run once →" />
}
