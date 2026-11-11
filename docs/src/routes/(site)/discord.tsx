import { RouterLink } from '@pyreon/router'
import { StableLinkPage } from '../../components/StableLinkPage'
import { resolveSiteLink } from '../../site-links'

const ISSUES = 'https://github.com/pyreon/pyreon/issues'

/** `/discord` — forwards to the community server once `SITE_LINKS.discord` is set. */
export default function DiscordPage() {
  return (
    <StableLinkPage
      path="/discord"
      destination="the Pyreon Discord"
      title="Community · Pyreon"
      description="Talk to the people building Pyreon: questions, bug reports and ideas, answered in the open."
      target={resolveSiteLink('discord')}
    >
      <header class="site-page__hero">
        <p class="site-page__eyebrow">Community</p>
        <h1>Talk to the people building Pyreon</h1>
        <p class="site-page__lead">
          The Pyreon Discord opens with the launch. Until then, the conversation happens on
          GitHub, where every question and every answer stays searchable for the next person who
          hits the same thing.
        </p>
        <p class="site-actions">
          <a class="site-button site-button--primary" href={`${ISSUES}/new/choose`} rel="noopener">
            Ask a question or report a bug
          </a>
          <a class="site-button" href={ISSUES} rel="noopener">
            Browse open issues
          </a>
        </p>
      </header>
      <section class="site-section">
        <h2>Other ways to follow along</h2>
        <ul class="site-links">
          <li>
            <RouterLink to="/blog">The blog</RouterLink>: how the compiler and runtime work, and
            release write-ups.
          </li>
          <li>
            <a href="https://github.com/pyreon/pyreon/releases" rel="noopener">
              Releases on GitHub
            </a>
              : watch the repository and pick “Releases” to hear about each one.
          </li>
          <li>
            <RouterLink to="/open">Open stats</RouterLink>: the project in live numbers.
          </li>
        </ul>
      </section>
    </StableLinkPage>
  )
}
