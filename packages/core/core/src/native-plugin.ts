/** Framework colour-mode read through the public compiler facade. */
import type { CompilerPlugin } from '@pyreon/native-compiler/plugin-api'
export const corePlugin: CompilerPlugin = {
  name: '@pyreon/core',
  apiVersion: 1,
  modules: ['@pyreon/core'],
  calls: { useColorMode: () => ({ type: 'color-mode' }) },
  destructureCalls: ['useColorMode'],
  decls: {
    'color-mode': {
      legacyKind: 'color-scheme',
      usesColorScheme: true,
      swift: (decl, ctx) =>
        `private var ${ctx.ident(decl.name)}: String { pyreonColorScheme == .dark ? "dark" : "light" }`,
      kotlin: (decl, ctx) =>
        `val ${ctx.ident(decl.name)} = if (isSystemInDarkTheme()) "dark" else "light"`,
    },
  },
}
export default corePlugin
