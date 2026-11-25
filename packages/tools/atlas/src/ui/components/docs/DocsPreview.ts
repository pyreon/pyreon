import { el } from '../../kit'

export const DocsPreview = el
  .attrs({
    tag: 'div',
    // The previewed component's own links are not the workbench router's: the
    // router's plain-<a href> dev warning skips this region (see ../../route).
    'data-allow-reload': '',
    contentAlignX: 'center',
    contentAlignY: 'center',
  })
  .theme((t) => ({
    borderRadius: t.radius.stage,
    border: t.hairline,
    background: t.surface,
    padding: '48px',
    marginBottom: '24px',
    // Containing block for adopted overlays — see PreviewSurface.
    contain: 'layout',
  }))
