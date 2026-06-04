interface Heading {
  level: number
  text: string
  id: string
}

export function Toc(props: { headings: Heading[] }) {
  if (props.headings.length === 0) return null
  return (
    <aside class="toc">
      <div class="label">On this page</div>
      {props.headings.map((h) => (
        <a href={'#' + h.id} data-level={String(h.level)}>
          {h.text}
        </a>
      ))}
    </aside>
  )
}
