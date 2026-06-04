interface Heading {
  level: number
  text: string
  id: string
}

/**
 * Right-rail TOC. Accepts either a static array (for already-loaded
 * pages) or an accessor (for the dynamic markdown route, where the
 * headings come in once the lazy chunk resolves).
 */
export function Toc(props: { headings: Heading[] | (() => Heading[]) }) {
  const get = (): Heading[] =>
    typeof props.headings === 'function' ? props.headings() : props.headings
  return (
    <aside class="toc">
      {() => {
        const items = get()
        if (items.length === 0) return null as unknown as never
        return (
          <>
            <div class="label">On this page</div>
            {items.map((h) => (
              <a href={'#' + h.id} data-level={String(h.level)}>
                {h.text}
              </a>
            ))}
          </>
        )
      }}
    </aside>
  )
}
