/**
 * `<MapView map={map} height={…}>` (MAP-2) — the renderer for a `useMap()` state.
 *
 * iOS lowers to `PyreonMapView(state:)`, a SwiftUI `Map` bound to the `PyreonMapState` (camera, markers, two-way
 * selection). Android has no map renderer yet (MAP-3): the element is NAMED there and lowers to an empty box of the
 * same size, never a guessed map. `height` must be a static number (default 240).
 */
import type { ElementLowering, ExprIR, JsxElementIR } from '@pyreon/native-compiler/plugin-api'

const DEFAULT_HEIGHT = 240

function mapExpr(el: JsxElementIR): ExprIR | undefined {
  const attr = el.attrs.find((a) => a.kind === 'attr' && a.name === 'map')

  return attr?.kind === 'attr' ? attr.value : undefined
}

function heightOf(el: JsxElementIR, staticAttr: (el: JsxElementIR, name: string) => unknown): number {
  const h = staticAttr(el, 'height')

  return typeof h === 'number' ? h : DEFAULT_HEIGHT
}

export const mapViewLowering: ElementLowering = {
  module: '@pyreon/hooks',
  tags: ['MapView'],
  emit: {
    swift(el, ctx) {
      const map = mapExpr(el)
      if (map === undefined) {
        ctx.warn('<MapView>: `map` must be the state from `useMap()`; nothing to render, so it lowers to an empty view.')

        return `Color.clear.frame(height: ${heightOf(el, ctx.staticAttr)})${ctx.layoutModifiers(el)}`
      }

      return `PyreonMapView(state: ${ctx.expr(map)}).frame(height: ${heightOf(el, ctx.staticAttr)})${ctx.layoutModifiers(el)}`
    },
    kotlin(el, ctx) {
      ctx.warn(
        '<MapView> has no Android renderer yet (MAP-3: MapLibre or osmdroid over a local style): it lowers to an empty box of the same height. The `useMap()` state itself works on Android.',
      )
      const mods = ctx.layoutModifiers(el)
      const base = mods === '' ? 'Modifier' : mods

      return `Box(modifier = ${base}.fillMaxWidth().height(${heightOf(el, ctx.staticAttr)}.dp)) {}`
    },
  },
}
