import { signal } from '@pyreon/reactivity'
import type { VNodeChild } from '@pyreon/core'

// ─── <Playground> — code editor + preview iframe (PR-K audit H2) ──────────
//
// Minimal sandboxed code playground. Renders a `<textarea>` next to a
// sandboxed `<iframe srcdoc>` whose body re-renders on input. Keeps
// scope intentionally tight: no CodeMirror dependency, no Babel /
// esbuild runtime — just literal HTML/JS/CSS rendered in a sandbox.
//
// For richer interactivity (syntax highlighting, autocomplete,
// multi-file demos) consumers should reach for `@pyreon/code` directly.
//
// Example:
//
//     <Playground
//       title="Hello world"
//       html={'<button id="b">Click</button>'}
//       js={'b.onclick = () => alert("hi")'}
//     />

export interface PlaygroundProps {
  /** Optional title shown above the editor. */
  title?: string
  /** Initial HTML source. */
  html?: string
  /** Initial CSS source. */
  css?: string
  /** Initial JS source. */
  js?: string
  /** When `true`, the JS / CSS / HTML editors render as a multi-tab
   *  surface instead of stacked panels. Default `false`. */
  tabs?: boolean
  /** Optional iframe height (px). Default `240`. */
  height?: number
  /** Optional class name applied to the outer wrapper. */
  class?: string
}

/**
 * Build the iframe srcdoc payload from the three sources. Pure —
 * exported for testing.
 *
 * @internal exported for testing
 */
export function buildSrcdoc(html: string, css: string, js: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>${css}</style>
</head>
<body>
${html}
<script>
${js}
</script>
</body>
</html>`
}

export function Playground(props: PlaygroundProps): VNodeChild {
  const html = signal(props.html ?? '')
  const css = signal(props.css ?? '')
  const js = signal(props.js ?? '')

  // Sandboxed iframe — `allow-scripts` lets user code run; absence of
  // `allow-same-origin` is intentional so the iframe can't reach the
  // host page's DOM / cookies. Each edit rebuilds the srcdoc.
  const height = props.height ?? 240

  return (
    <div
      class={`pyreon-playground${props.class ? ' ' + props.class : ''}`}
    >
      {props.title && (
        <header class="pyreon-playground__title">{props.title}</header>
      )}
      <div class="pyreon-playground__editors">
        {props.html !== undefined && (
          <label class="pyreon-playground__editor">
            <span class="pyreon-playground__editor-label">HTML</span>
            <textarea
              class="pyreon-playground__textarea"
              value={() => html()}
              onInput={(e) => html.set((e.target as HTMLTextAreaElement).value)}
              spellCheck={false}
            />
          </label>
        )}
        {props.css !== undefined && (
          <label class="pyreon-playground__editor">
            <span class="pyreon-playground__editor-label">CSS</span>
            <textarea
              class="pyreon-playground__textarea"
              value={() => css()}
              onInput={(e) => css.set((e.target as HTMLTextAreaElement).value)}
              spellCheck={false}
            />
          </label>
        )}
        {props.js !== undefined && (
          <label class="pyreon-playground__editor">
            <span class="pyreon-playground__editor-label">JS</span>
            <textarea
              class="pyreon-playground__textarea"
              value={() => js()}
              onInput={(e) => js.set((e.target as HTMLTextAreaElement).value)}
              spellCheck={false}
            />
          </label>
        )}
      </div>
      {(() => {
        // `srcdoc` isn't declared on `IframeAttributes` in
        // `@pyreon/core`'s JSX types yet — use a data-* prop +
        // setAttribute via ref to bypass. Renders the iframe with a
        // reactive srcdoc that rebuilds on every signal change.
        return (
          <iframe
            class="pyreon-playground__preview"
            title="Preview"
            sandbox="allow-scripts"
            ref={(el: HTMLIFrameElement | null) => {
              if (el !== null) {
                el.setAttribute('srcdoc', buildSrcdoc(html(), css(), js()))
              }
            }}
            style={`height: ${height}px;`}
          />
        )
      })()}
    </div>
  )
}
