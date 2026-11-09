import type { CallRecognizer, DeclEmitter, ExtDecl, ReceiverLowering, ReceiverSite } from '@pyreon/native-compiler/plugin-api'
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

/** The two colour-scheme queries the platforms answer: the system appearance IS `prefers-color-scheme`. */
const SCHEMES: ReadonlyMap<string, 'dark' | 'light'> = new Map([
  ['(prefers-color-scheme:dark)', 'dark'],
  ['(prefers-color-scheme:light)', 'light'],
])

/**
 * `useMediaQuery('(prefers-color-scheme: dark)')` — a boolean read of the system appearance. Any other query (width, orientation,
 * a getter) is a named warning that drops the hook: those answer a different question natively (window size classes, not CSS
 * pixels) and silently approximating them would change what the app shows.
 */
export const recognizeMediaQuery: CallRecognizer = (_call, ctx) => {
  const node = ctx.unwrap(ctx.args[0] as never) as { type?: string; value?: unknown } | undefined
  const query = node?.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined
  const scheme = query === undefined ? undefined : SCHEMES.get(query.replace(/\s+/g, '').toLowerCase())
  if (scheme === undefined) {
    ctx.report(
      `useMediaQuery() \`${ctx.declName}\`: only the literal queries '(prefers-color-scheme: dark)' and '(prefers-color-scheme: light)' lower natively — a width, orientation or computed query has no native equivalent in CSS pixels — so the declaration is NOT lowered. Use useColorScheme(), useSizeClass() or useReducedMotion().`,
    )
    return null
  }
  return { type: 'media-query', payload: { scheme } as never }
}
const schemeOf = (decl: ExtDecl): 'dark' | 'light' => (decl.payload as unknown as { scheme: 'dark' | 'light' }).scheme
export const mediaQueryDecl: DeclEmitter = {
  usesColorScheme: true,
  swift: (decl, ctx) =>
    `private var ${ctx.ident(decl.name)}: Bool { pyreonColorScheme == .${schemeOf(decl)} }`,
  kotlin: (decl, ctx) =>
    `val ${ctx.ident(decl.name)} = ${schemeOf(decl) === 'dark' ? '' : '!'}isSystemInDarkTheme()`,
  typing: { callRead: () => ({ kind: 'boolean' }) },
}
/** `dark()` reads the derived boolean. */
const mediaQueryRead = (site: ReceiverSite, ctx: { ident(name: string): string }): string | undefined =>
  site.kind === 'call' && site.expr.args.length === 0 && site.expr.callee.kind === 'identifier'
    ? ctx.ident(site.receiver.name)
    : undefined
export const mediaQueryReceiver: ReceiverLowering = {
  swift: { expr: mediaQueryRead },
  kotlin: { expr: mediaQueryRead },
}
