interface PlaygroundProps {
  title?: string
  code: string
  height?: number
  language?: string
}

// Minimal Playground stub for the docs-zero migration. Renders the code
// as a static <pre> block + the title above. The interactive iframe
// runner is a follow-up (PR 9 polish — opt-in native-mode Playground
// that runs Pyreon inline, shares route's render context with the host
// page).
export function Playground(props: PlaygroundProps) {
  return (
    <figure class="docs-playground">
      {props.title ? (
        <figcaption class="docs-playground__title">{props.title}</figcaption>
      ) : null}
      <pre
        class="docs-playground__code"
        style={
          props.height
            ? `min-height: ${props.height}px`
            : undefined
        }
      >
        <code>{props.code}</code>
      </pre>
    </figure>
  )
}
