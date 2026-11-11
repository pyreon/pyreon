import { RouterLink } from '@pyreon/router'
import { SITE_ORIGIN } from '../blog/site'
import { StableLinkPage } from '../components/StableLinkPage'
import { resolveSiteLink } from '../site-links'

const FEED = `${SITE_ORIGIN}/blog/rss.xml`

/** `/newsletter` — forwards to the sign-up page once `SITE_LINKS.newsletter` is set. */
export default function NewsletterPage() {
  return (
    <StableLinkPage
      path="/newsletter"
      destination="the Pyreon newsletter"
      title="Newsletter · Pyreon"
      description="Get every Pyreon post the day it goes out: deep dives into the compiler and runtime, measured benchmarks and release notes."
      target={resolveSiteLink('newsletter')}
    >
      <header class="site-page__hero">
        <p class="site-page__eyebrow">Newsletter</p>
        <h1>Every post, the day it goes out</h1>
        <p class="site-page__lead">
          Deep dives into how the compiler and runtime work, benchmark results with the losses
          left in, and release write-ups. The RSS feed carries every post in full, the moment it
          is published.
        </p>
        <p class="site-actions">
          <a class="site-button site-button--primary" href="/blog/rss.xml">
            Subscribe with RSS
          </a>
          <RouterLink class="site-button" to="/blog">
            Read the blog
          </RouterLink>
        </p>
      </header>
      <section class="site-section">
        <h2>Add the feed anywhere</h2>
        <p>Paste this address into any feed reader, or into an RSS-to-email service to get each post by mail:</p>
        <pre class="site-code">
          <code>{FEED}</code>
        </pre>
        <p>
          Prefer GitHub? Watch{' '}
          <a href="https://github.com/pyreon/pyreon" rel="noopener">
            pyreon/pyreon
          </a>{' '}
          and choose “Custom → Releases” to get a notification for each release.
        </p>
      </section>
    </StableLinkPage>
  )
}
