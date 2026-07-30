/** Canvas view — the live preview on a zoomable, dotted stage. */
import { _rp } from '@pyreon/core'
import * as C from '../chrome'
import type { WorkbenchModel } from '../model'
import { BACKGROUND_VARIANT, VIEWPORT_SIZE } from '../addons'
import { ZOOM_PCT } from '../model'


export function Canvas(props: { model: WorkbenchModel }) {
  const m = props.model
  return (
    <C.Main>
      <C.CanvasBar>
        <C.Col>
          <C.CanvasName data-testid="canvas-name">{() => m.sel()?.name ?? ''}</C.CanvasName>
          <C.CanvasPath>{() => `components/${m.selId()}`}</C.CanvasPath>
        </C.Col>
        <C.Spacer />
        <C.Segment>
          <C.ZoomBtn onClick={() => m.zoomIdx.set(Math.max(0, m.zoomIdx() - 1))}>−</C.ZoomBtn>
          <C.ZoomLabel data-testid="zoom-label">{() => `${ZOOM_PCT[m.zoomIdx()]}%`}</C.ZoomLabel>
          <C.ZoomBtn onClick={() => m.zoomIdx.set(Math.min(ZOOM_PCT.length - 1, m.zoomIdx() + 1))}>+</C.ZoomBtn>
        </C.Segment>
      </C.CanvasBar>

      {/*
        Addon dimensions are passed as ACCESSORS (`() => …`) like every other
        signal-driven dimension here, so they re-resolve without the compiler —
        see ../Workbench for why that matters for the prebuilt lib.
      */}
      <C.Stage>
        {/*
          The four SHIPPED viewport ids resolve to cached `size` classes; a
          per-project preset (any other id) pins the frame via the Element
          `width` STYLE PROP — unistyle turns it into a hashed class, so custom
          widths still ship zero inline styles. Same split for backgrounds:
          shipped ids are variants, a preset's `color` styles the surface.
        */}
        <C.Frame
          data-testid="canvas-frame"
          size={() => (VIEWPORT_SIZE[m.viewport()] ?? 'vFull') as never}
          {...({
            // The Element `css` PROP — the per-instance styling channel (the
            // chain's structural css lives in its theme, so nothing is
            // overridden). `_rp`-branded by hand, exactly what the compiler
            // would emit — the UI ships prebuilt, and a bare function value
            // would land on the DOM as an attribute instead of restyling.
            css: _rp(() => {
              const w = m.viewportPreset().width
              return VIEWPORT_SIZE[m.viewport()] || w === null ? '' : `width:${w}px;max-width:100%;`
            }),
          } as Record<string, unknown>)}
        >
          <C.FrameChrome>
            {() =>
              `${m.brand().name} · ${m.dark() ? 'dark' : 'light'}${
                m.viewportPreset().width === null ? '' : ` · ${m.viewportPreset().hint}`
              }${m.pseudo() ? ` · :${m.pseudo()}` : ''}${m.locale() === 'en' ? '' : ` · ${m.locale()}`}`
            }
          </C.FrameChrome>
          <C.PreviewSurface
            data-testid="canvas-preview"
            ref={m.previewRef}
            size={() => ('z' + ZOOM_PCT[m.zoomIdx()]) as never}
            variant={() => (BACKGROUND_VARIANT[m.background()] ?? 'bgTheme') as never}
            {...({
              css: _rp(() => {
                const color = m.backgroundPreset().color
                return BACKGROUND_VARIANT[m.background()] || !color ? '' : `background:${color};`
              }),
            } as Record<string, unknown>)}
            state={() => (m.outline() ? 'outlined' : 'plain') as never}
          >
            {() => m.preview()}
          </C.PreviewSurface>
        </C.Frame>
      </C.Stage>
    </C.Main>
  )
}
