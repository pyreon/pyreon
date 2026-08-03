/**
 * The framed surface a `<CodeBlock>` editor mounts into — the visual shell
 * (border, radius, background) so the editor itself stays chrome-free.
 */
import { dim, el, type T } from '../../kit'

export const CodeSurface = el
  // No height cap here: the SOURCE variant caps the EDITOR instead, so
  // CodeMirror's own scroller owns the overflow. Capping the frame would clip
  // a long file behind `overflow:hidden` with no way to scroll to it.
  .attrs({ tag: 'div' })
  .variants(dim(() => ({ snippet: {}, source: {} })))
  .theme((t: T) => ({
    borderRadius: t.radius.card,
    marginBottom: '16px',
    overflow: 'hidden',
    border: t.hairline,
    background: t.codeBg,
  }))
