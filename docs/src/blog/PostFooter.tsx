import { NewsletterForm, ShareLinks } from '@pyreon/zero-content/blog'
import type { BlogPost } from '@pyreon/zero-content/blog'
import { BLOG_FEED, NEWSLETTER_ACTION, SITE_ORIGIN } from './site'

/**
 * End of every post: a call to action (start a project, star the repo,
 * follow the feed), share links as plain intent URLs (no third-party
 * script, no tracking), and the newsletter sign-up — which renders nothing
 * until `NEWSLETTER_ACTION` is set.
 */
export function PostFooter(props: { post: BlogPost }) {
  return (
    <div class="blog-post-footer">
      <section class="blog-cta" aria-labelledby="blog-cta-title">
        <p id="blog-cta-title" class="blog-cta__title">
          Build something with Pyreon
        </p>
        <p class="blog-cta__text">
          Scaffold an app in under a minute — SSR, SSG, islands and a blog are templates away.
        </p>
        <pre class="blog-cta__command">
          <code>npm create @pyreon/zero@latest</code>
        </pre>
        <p class="blog-cta__links">
          <a href="https://github.com/pyreon/pyreon" rel="noopener">
            Star Pyreon on GitHub
          </a>
          <a href={BLOG_FEED} rel="alternate" type="application/rss+xml">
            Follow the blog via RSS
          </a>
        </p>
      </section>
      <ShareLinks url={`${SITE_ORIGIN}${props.post.url}`} title={props.post.title} label="Share this post:" />
      <NewsletterForm
        action={NEWSLETTER_ACTION}
        heading="Get new posts by email"
        description="One email per post. No tracking, unsubscribe any time."
      />
    </div>
  )
}
