import { When } from './when'

/** A code block with its file name and language: build-time Shiki HTML when there is some, else the plain text. */
export function CodeFigure(props: { label: string; lang: string; source: string; html?: string | undefined }) {
  return (
    <figure class="dx-code">
      <figcaption class="dx-code__head">
        <span>{props.label}</span>
        <span class="dx-code__sp" />
        <span>{props.lang}</span>
      </figcaption>
      {/* Build-time Shiki output of repo-owned content (vite-plugins/docs-home-content.ts, product-content.ts).
          A focusable region: the code scrolls sideways on its own, so the keyboard must reach it. */}
      <When on={props.html}>
        <section class="dx-code__body dx-shiki" tabIndex={0} aria-label={props.label} dangerouslySetInnerHTML={{ __html: props.html ?? '' }} />
      </When>
      <When on={!props.html}>
        <section class="dx-code__body" tabIndex={0} aria-label={props.label}>
          <pre>
            <code>{props.source}</code>
          </pre>
        </section>
      </When>
    </figure>
  )
}

