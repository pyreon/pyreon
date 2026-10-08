import type { CallRecognizer, DeclEmitter } from '@pyreon/native-compiler/plugin-api'
export const recognizeColorScheme: CallRecognizer = () => ({ type: 'color-scheme' })
export const recognizeSizeClass: CallRecognizer = () => ({ type: 'size-class' })
export const colorSchemeDecl: DeclEmitter = {
  legacyKind: 'color-scheme',
  usesColorScheme: true,
  swift: (decl, ctx) =>
    `private var ${ctx.ident(decl.name)}: String { pyreonColorScheme == .dark ? "dark" : "light" }`,
  kotlin: (decl, ctx) =>
    `val ${ctx.ident(decl.name)} = if (isSystemInDarkTheme()) "dark" else "light"`,
}
export const sizeClassDecl: DeclEmitter = {
  legacyKind: 'size-class',
  usesSizeClass: true,
  swift: (decl, ctx) =>
    `private var ${ctx.ident(decl.name)}: String { pyreonSizeClass == .regular ? "regular" : "compact" }`,
  kotlin: (decl, ctx) =>
    `val ${ctx.ident(decl.name)} = if (LocalConfiguration.current.screenWidthDp >= 600) "regular" else "compact"`,
}
