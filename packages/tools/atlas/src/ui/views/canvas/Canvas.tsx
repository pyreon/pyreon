/** Canvas view — the live preview on a zoomable, dotted stage. */
import { _rp, Show } from '@pyreon/core'
import { effect } from '@pyreon/reactivity'
import * as C from '../../components'
import type { WorkbenchModel } from '../../model'
import { BACKGROUND_VARIANT, VIEWPORT_SIZE } from '../../addons'
import { ZOOM_PCT } from '../../model'


export function Canvas(props: { model: WorkbenchModel }) {
  const m = props.model

  // ── Measure addon ─────────────────────────────────────────────────────────
  // Geometry is written IMPERATIVELY onto the overlay elements (left/top/…):
  // continuous per-pixel positioning is measurement, not styling — hashing a
  // class per mousemove would grow the style cache without bound. Same
  // precedent as `@pyreon/elements`' overlay positioning.
  let stageEl: HTMLElement | null = null
  let boxEl: HTMLElement | null = null
  let labelEl: HTMLElement | null = null
  const stageRef = (el: HTMLElement | null) => {
    stageEl = el
  }
  const boxRef = (el: HTMLElement | null) => {
    boxEl = el
  }
  const labelRef = (el: HTMLElement | null) => {
    labelEl = el
  }

  const hideOverlay = () => {
    if (boxEl) boxEl.style.display = 'none'
    if (labelEl) labelEl.style.display = 'none'
  }
  const showFor = (target: Element) => {
    const stage = stageEl
    if (!stage || !boxEl || !labelEl) return
    const surface = m.previewElement()
    // Only elements INSIDE the preview are the user's — measuring the
    // workbench chrome would be noise.
    if (!surface || !surface.contains(target) || target === surface) return hideOverlay()
    const s = stage.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    boxEl.style.display = 'block'
    boxEl.style.left = `${r.left - s.left + stage.scrollLeft}px`
    boxEl.style.top = `${r.top - s.top + stage.scrollTop}px`
    boxEl.style.width = `${r.width}px`
    boxEl.style.height = `${r.height}px`
    labelEl.style.display = 'block'
    labelEl.style.left = `${r.left - s.left + stage.scrollLeft}px`
    labelEl.style.top = `${r.bottom - s.top + stage.scrollTop + 6}px`
    labelEl.textContent = `${Math.round(r.width)} × ${Math.round(r.height)}`
  }

  // Pointer tracking rides JSX event props on the Stage element (below) —
  // framework-managed, disposed with the element, no raw listener wiring.
  const onStageMove = (e: Event) => {
    if (!m.measure()) return
    showFor(e.target as Element)
  }
  const onStageLeave = () => hideOverlay()
  // Body-scope effect: owned by the component's scope, auto-disposed on
  // unmount. Toggling Measure off hides any overlay left behind.
  effect(() => {
    if (!m.measure()) hideOverlay()
  })

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
      <C.Stage
        onPointerMove={onStageMove}
        onPointerLeave={onStageLeave}
        {...({ innerRef: stageRef } as Record<string, unknown>)}
      >
        <Show when={() => m.measure()}>
          <C.MeasureBox data-testid="measure-box" ref={boxRef} />
          <C.MeasureLabel data-testid="measure-label" ref={labelRef} />
        </Show>
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
