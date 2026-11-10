import { onMount } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { usePageHead } from './site-head'

export interface StableLinkPageProps {
  /** Root-relative path of this page, e.g. `/discord`. */
  path: string
  /** What the link leads to, e.g. "the Pyreon Discord". */
  destination: string
  title: string
  description: string
  /** Where to send the visitor, or `null` while the channel is not open. */
  target: string | null
  /** The page shown while `target` is `null`. */
  children: VNodeChild
}

/**
 * A stable address on pyreon.dev (`/discord`, `/newsletter`) that either
 * forwards to its channel or, while there is none, is a useful page of its own.
 *
 * Forwarding works on a static host: the prerendered HTML carries a
 * `<meta http-equiv="refresh">`, a canonical link to the target and a visible
 * "Continue" link, so it works with JavaScript off. A visitor who arrives by
 * in-app navigation (no document load, so no meta refresh) is forwarded on
 * mount instead.
 */
export function StableLinkPage(props: StableLinkPageProps) {
  const target = props.target
  if (target === null) {
    usePageHead({ path: props.path, title: props.title, description: props.description })
    return <div class="site-page stable-link">{props.children}</div>
  }

  usePageHead({
    path: props.path,
    title: props.title,
    description: props.description,
    canonical: target,
    meta: [
      { 'http-equiv': 'refresh', content: `0; url=${target}` },
      { name: 'robots', content: 'noindex' },
    ],
  })
  onMount(() => {
    window.location.replace(target)
  })
  return (
    <div class="site-page stable-link stable-link--redirect">
      <header class="site-page__hero">
        <h1>Taking you to {props.destination}</h1>
        <p class="site-page__lead">If nothing happens in a second, use the link below.</p>
        <p>
          <a class="site-button site-button--primary" href={target} rel="noopener">
            Continue to {props.destination}
          </a>
        </p>
      </header>
    </div>
  )
}
