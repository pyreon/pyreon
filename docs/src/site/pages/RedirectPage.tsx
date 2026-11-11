import { onMount } from '@pyreon/core'
import { useRouter } from '@pyreon/router'
import { Pill } from '../kit/controls'
import { Section, Wrap } from '../kit/layout'
import { Heading, Lede } from '../kit/type'
import { usePageHead } from '../../components/site-head'
import { SITE_ORIGIN } from '../../blog/site'

/**
 * An index route that has no page of its own (`/why`, `/compare`: the
 * sitemap merges them into their first page; the nav menus are the index).
 * Works on a static host: the prerendered HTML carries a meta refresh, a
 * canonical to the target and `noindex`, plus a visible link; a visitor who
 * arrives by in-app navigation is sent on with `router.replace`.
 */
export function RedirectPage(props: { path: string; to: string; title: string; label: string }) {
  usePageHead({
    path: props.path,
    title: props.title,
    description: `${props.title} continues at ${props.to}.`,
    canonical: `${SITE_ORIGIN}${props.to}`,
    meta: [
      { 'http-equiv': 'refresh', content: `0; url=${props.to}` },
      { name: 'robots', content: 'noindex' },
    ],
  })
  const router = useRouter()
  onMount(() => {
    void router.replace(props.to)
  })
  return (
    <Section size="hero">
      <Wrap>
        <Heading tag="h1" size="section">
          {props.title}
        </Heading>
        <Lede size="section">This page lives at its first chapter.</Lede>
        <p>
          <Pill href={props.to} variant="solid">
            {props.label}
          </Pill>
        </p>
      </Wrap>
    </Section>
  )
}
