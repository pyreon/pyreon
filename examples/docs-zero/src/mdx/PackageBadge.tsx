interface PackageBadgeProps {
  name: string
}

// Renders an inline pill that links to the package's npm page. The
// VitePress version also rendered a download badge from shields.io —
// that's a follow-up; this stub is enough to make the markdown compile
// and render cleanly.
export function PackageBadge(props: PackageBadgeProps) {
  const npmUrl = `https://www.npmjs.com/package/${props.name}`
  return (
    <a
      class="docs-package-badge"
      href={npmUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <code>{props.name}</code>
    </a>
  )
}
