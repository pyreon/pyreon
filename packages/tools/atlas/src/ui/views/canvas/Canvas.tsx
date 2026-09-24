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
    // The surface is zoomed with a transform, and a client rect is measured
    // AFTER it — so the overlay box is right in viewport space, but the number
    // has to be divided back: at 200% a 100×40 button reported 200 × 80, and
    // the number is the addon's whole product.
    const zoom = ZOOM_PCT[m.zoomIdx()]! / 100
    boxEl.style.display = 'block'
    boxEl.style.left = `${r.left - s.left + stage.scrollLeft}px`
    boxEl.style.top = `${r.top - s.top + stage.scrollTop}px`
    boxEl.style.width = `${r.width}px`
    boxEl.style.height = `${r.height}px`
    labelEl.style.display = 'block'
    labelEl.style.left = `${r.left - s.left + stage.scrollLeft}px`
    labelEl.style.top = `${r.bottom - s.top + stage.scrollTop + 6}px`
    labelEl.textContent = `${Math.round(r.width / zoom)} × ${Math.round(r.height / zoom)}`
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

  // A width is PINNED when a viewport preset (shipped or per-project) sets
  // one; the fluid default is not a frame, it is the stage.
  //
  // `let`, not `const`: these derive from `props.model`, and the compiler
  // INLINES a prop-derived const at every JSX use site (emitting its own
  // `_rp` import, which collides with the explicit one this file needs for
  // the `css` prop). `let` is the documented opt-out — see anti-patterns
  // "reactive-props inlining re-invokes a STATEFUL prop-derived const".
  // oxlint-disable-next-line prefer-const
  let pinned = () => m.viewportPreset().width !== null
  // The render context in one line — brand, mode, pinned viewport, forced
  // pseudo state, locale. Lives in the canvas bar; a pinned frame repeats it
  // on its own chrome so a screenshot of the device edge still says what it is.
  // oxlint-disable-next-line prefer-const
  let chrome = () =>
    `${m.brand().name} · ${m.dark() ? 'dark' : 'light'}${
      m.viewportPreset().width === null ? '' : ` · ${m.viewportPreset().hint}`
    }${m.pseudo() ? ` · :${m.pseudo()}` : ''}${m.locale() === 'en' ? '' : ` · ${m.locale()}`}`

  return (
    <C.Main>
      <C.CanvasBar>
        <C.ZoomBtn
          data-testid="toggle-sidebar"
          title="Toggle sidebar"
          onClick={() => m.sidebarOpen.set(!m.sidebarOpen())}
        >
          {() => (m.sidebarOpen() ? '⇤' : '⇥')}
        </C.ZoomBtn>
        <C.Col>
          <C.CanvasName data-testid="canvas-name">{() => m.sel()?.name ?? ''}</C.CanvasName>
          <C.CanvasPath data-testid="canvas-meta">{() => `components/${m.selId()} · ${chrome()}`}</C.CanvasPath>
        </C.Col>
        <C.Spacer />
        <C.Segment>
          <C.ZoomBtn onClick={() => m.zoomIdx.set(Math.max(0, m.zoomIdx() - 1))}>−</C.ZoomBtn>
          <C.ZoomLabel data-testid="zoom-label">{() => `${ZOOM_PCT[m.zoomIdx()]}%`}</C.ZoomLabel>
          <C.ZoomBtn onClick={() => m.zoomIdx.set(Math.min(ZOOM_PCT.length - 1, m.zoomIdx() + 1))}>+</C.ZoomBtn>
        </C.Segment>
        <C.ZoomBtn
          data-testid="toggle-panel"
          title="Toggle addon panel"
          onClick={() => m.panelOpen.set(!m.panelOpen())}
        >
          {() => (m.panelOpen() ? '⇥' : '⇤')}
        </C.ZoomBtn>
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
          variant={() => (pinned() ? 'framed' : 'bare') as never}
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
          <Show when={pinned}>
            <C.FrameChrome>{chrome}</C.FrameChrome>
          </Show>
          <C.PreviewSurface
            data-testid="canvas-preview"
            ref={m.previewRef}
            size={() => ('z' + ZOOM_PCT[m.zoomIdx()]) as never}
            variant={() => (BACKGROUND_VARIANT[m.background()] ?? 'bgTheme') as never}
            {...({
              css: _rp(() => {
                const color = m.backgroundPreset().color
                const bg = BACKGROUND_VARIANT[m.background()] || !color ? '' : `background:${color};`
                // An adopted overlay (a modal, a drawer) is confined to this
                // surface — give it a viewport-sized box to open into rather
                // than the 220px a closed component needs.
                return `${bg}min-height:${m.overlayOpen() ? 520 : 220}px;`
              }),
            } as Record<string, unknown>)}
            state={() => (m.outline() ? 'outlined' : 'plain') as never}
          >
            {() => m.preview()}
          </C.PreviewSurface>
        </C.Frame>
        <Show when={() => m.previewEmpty()}>
          <C.EmptyHint data-testid="canvas-empty">
            Nothing rendered for this state — the component returned no DOM. Pick another
            scenario in the sidebar, or give it what it needs (data props, an open state, a
            render-prop child) in atlas.config.ts.
          </C.EmptyHint>
        </Show>
      </C.Stage>
    </C.Main>
  )
}
