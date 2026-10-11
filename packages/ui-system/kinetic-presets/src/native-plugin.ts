import { type CompilerPlugin } from '@pyreon/native-compiler/plugin-api'

/**
 * Map a `@pyreon/kinetic-presets` export name onto the native preset vocabulary, or undefined when it has no analogue.
 *
 * Only UNAMBIGUOUS names map. The pack ships 123 presets and native knows seven, so most of them (backInDown, blurScale,
 * bounceIn, flip*, rotate*, …) have nothing to lower to. Mapping those to the nearest fade would silently animate the
 * wrong thing, which is worse than declining by name — and the decline is what the author can act on. Diagonal and
 * magnitude variants (fadeDownLeft, slideUpBig) are deliberately NOT mapped: native has neither a diagonal nor a distance
 * parameter, so a mapping would drop half the intent without saying so.
 */
function nativePresetForPackName(name: string): string | undefined {
  const exact: Readonly<Record<string, string>> = {
    fade: 'fade',
    fadeUp: 'slide-up',
    fadeDown: 'slide-down',
    fadeLeft: 'slide-left',
    fadeRight: 'slide-right',
    slideUp: 'slide-up',
    slideDown: 'slide-down',
    slideLeft: 'slide-left',
    slideRight: 'slide-right',
    scaleIn: 'scale-in',
    scale: 'scale',
  }
  return Object.hasOwn(exact, name) ? exact[name] : undefined
}

export const kineticPresetsPlugin: CompilerPlugin = {
  name: '@pyreon/kinetic-presets',
  apiVersion: 2,
  modules: ['@pyreon/kinetic-presets'],
  constants: nativePresetForPackName,
}
export default kineticPresetsPlugin
