/**
 * `@pyreon/elements/native-plugin` — how `<Element>` crosses to SwiftUI and Compose.
 *
 * The package OWNS its native lowering: `<Element direction alignX alignY gap>` is the canonical `<Stack>` in
 * the ui-system's vocabulary, so the plugin retags it and the compiler's own Stack emit (plus the
 * styler / rocketstyle style connector) lowers the result. It is also what makes a rocketstyle component built
 * over `Element` resolve to a style base. `@pyreon/native-cli` discovers it from `package.json` →
 * `pyreon.native.plugin` when a source file imports `@pyreon/elements`.
 *
 * Tooling-only — nothing here is reachable from the web entry point.
 */
export { elementToStack, elementsLowering, elementsPlugin, elementsPlugin as default, ELEMENTS_PRIMITIVE_ALIAS } from './native-plugin/plugin'
