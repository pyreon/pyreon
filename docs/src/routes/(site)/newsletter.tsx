import { StableLinkPage } from '../../components/StableLinkPage'
import { NEWSLETTER_COPY } from '../../site/content/channels'
import { resolveSiteLink } from '../../site-links'

/** `/newsletter` — forwards to the sign-up page once `SITE_LINKS.newsletter` is set. */
export default function NewsletterPage() {
  return <StableLinkPage copy={NEWSLETTER_COPY} target={resolveSiteLink('newsletter')} />
}
