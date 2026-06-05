interface Heading {
  level: number
  text: string
  slug: string
}

interface TocProps {
  headings: () => Heading[]
}

export function Toc(props: TocProps) {
  return (
    <aside class="docs-toc" aria-label="On this page">
      {() => {
        const list = props.headings()
        if (list.length === 0) return null
        return (
          <>
            <p class="docs-toc__label">On this page</p>
            <ul class="docs-toc__list">
              {list.map((h) => (
                <li class={`docs-toc__item docs-toc__item--l${h.level}`}>
                  <a href={`#${h.slug}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </>
        )
      }}
    </aside>
  )
}
