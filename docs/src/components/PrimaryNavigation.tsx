import { RouterLink } from '@pyreon/router'

interface PrimaryNavigationProps {
  class: string
  label: string
  onNavigate?: () => void
}

/** Shared destinations for the desktop header and every mobile drawer. */
export function PrimaryNavigation(props: PrimaryNavigationProps) {
  return (
    <nav class={props.class} aria-label={props.label}>
      <RouterLink
        to="/docs/getting-started"
        class="docs-header__link"
        onClick={() => props.onNavigate?.()}
      >
        Docs
      </RouterLink>
      {/* Atlas is a separate static site, so this link must load its document. */}
      <a
        href="/atlas/"
        class="docs-header__link"
        data-allow-reload
        onClick={() => props.onNavigate?.()}
      >
        Components
      </a>
    </nav>
  )
}
