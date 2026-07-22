// ============================================================================
// `@pyreon` theme native FRONTEND — compile-time theme-token resolution.
//
// The mainline of any real styler/rocketstyle style is a theme TOKEN, not a
// literal: `.states({ primary: { backgroundColor: t.color.primary } })` /
// `styled(Stack)\`background: ${(p) => p.theme.color.primary}\``. This module
// resolves such a reference to a concrete value the connector can parse (a #hex
// color or a numeric dimension).
//
// FUNDAMENTALLY-CORRECT resolution: tokens resolve against the APP'S OWN theme,
// parsed from a `defineTheme({ … })` declaration in the compiled source — NOT a
// hardcoded table. A native build must emit the app's real primary color, not a
// guess. The bundled DEFAULT_THEME (mirroring @pyreon/ui-theme + the primitive
// defaults in `canonical-primitives.ts`) is the FALLBACK only — used per-token
// when the app defines no theme, or omits that entry. So a zero-config app still
// resolves standard tokens, and a customized app resolves to ITS values.
//
// Authoring syntax (native-canonical — the runtime `defineTheme` is identity):
//   const theme = defineTheme({
//     color:   { primary: '#2563eb', danger: '#dc2626' },
//     spacing: { md: 12, lg: 16 },
//     radius:  { sm: 4 },
//   })
// Only LITERAL leaf values are read (a native theme must be static). Group
// aliases are accepted (`colors`/`space`/`borderRadius`/`radii`).
//
// Shared by the styler + rocketstyle frontends: a value that isn't a literal is
// handed here with the parsed theme; a resolved token becomes a literal that
// flows through the connector unchanged, an unknown one is dropped + warned by
// the caller.
// ============================================================================

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

/** A resolved, static theme vocabulary the native frontends resolve against. */
export interface ThemeTable {
  color: Record<string, string>
  spacing: Record<string, number>
  radius: Record<string, number>
}

// Defaults — mirror packages/native/compiler/src/canonical-primitives.ts
// (COLOR_TOKENS_RGB / SPACE_BY_NAME / the radius map) + @pyreon/ui-theme, so a
// zero-config native build matches the primitive/runtime defaults exactly.
export const DEFAULT_THEME: ThemeTable = {
  color: {
    text: '#111827',
    surface: '#ffffff',
    primary: '#2563eb',
    secondary: '#6b7280',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    muted: '#9ca3af',
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  radius: { none: 0, sm: 4, md: 8, lg: 16, full: 9999 },
}

// Group-name aliases → the canonical ThemeTable group. `t.colors.primary` and
// `t.color.primary` are the same token; likewise space/spacing, radius/radii/…
const GROUP_ALIAS: Record<string, keyof ThemeTable> = {
  color: 'color',
  colors: 'color',
  spacing: 'spacing',
  space: 'spacing',
  radius: 'radius',
  radii: 'radius',
  borderRadius: 'radius',
}

const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'ParenthesizedExpression',
])

function unwrap(node: AnyNode | undefined): AnyNode | undefined {
  let cur = node
  for (let i = 0; i < 20 && cur; i++) {
    if (!TS_WRAPPERS.has(cur.type)) return cur
    cur = cur.expression
  }
  return cur
}

/**
 * Parse a `defineTheme({ color: {…}, spacing: {…}, radius: {…} })` marker call
 * into a Partial<ThemeTable> of its LITERAL leaves. Returns null if `init` isn't
 * a `defineTheme(…)` call over an object literal — the marker is REQUIRED (a
 * bare `const x = { color: … }` is NOT swallowed as a theme). Non-literal leaves
 * are skipped (a native theme must be static — a runtime value can't be baked).
 */
export function parseThemeDefinition(init: AnyNode | undefined): Partial<ThemeTable> | null {
  const call = unwrap(init)
  if (
    call?.type !== 'CallExpression' ||
    unwrap(call.callee)?.type !== 'Identifier' ||
    unwrap(call.callee)?.name !== 'defineTheme'
  ) {
    return null
  }
  const obj = unwrap((call.arguments as AnyNode[])?.[0])
  if (!obj || obj.type !== 'ObjectExpression') return null
  const out: Partial<ThemeTable> = {}
  let found = false
  for (const p of (obj.properties as AnyNode[]) ?? []) {
    if ((p.type !== 'Property' && p.type !== 'ObjectProperty') || p.computed) continue
    const rawGroup = p.key?.name ?? p.key?.value
    if (typeof rawGroup !== 'string') continue
    const group = GROUP_ALIAS[rawGroup]
    if (!group) continue
    const groupObj = unwrap(p.value)
    if (!groupObj || groupObj.type !== 'ObjectExpression') continue
    const entries = readLiteralLeaves(groupObj)
    if (Object.keys(entries).length === 0) continue
    found = true
    // color values must be strings; spacing/radius numbers.
    if (group === 'color') {
      const m: Record<string, string> = {}
      for (const [k, v] of Object.entries(entries)) if (typeof v === 'string') m[k] = v
      out.color = { ...out.color, ...m }
    } else {
      const m: Record<string, number> = {}
      for (const [k, v] of Object.entries(entries)) if (typeof v === 'number') m[k] = v
      const prev = out[group] as Record<string, number> | undefined
      out[group] = { ...prev, ...m }
    }
  }
  return found ? out : null
}

/** Read an object literal's direct LITERAL leaves (string | number), skipping
 *  nested objects + non-literal values. `-4` (unary) is read as a number. */
function readLiteralLeaves(obj: AnyNode): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const p of (obj.properties as AnyNode[]) ?? []) {
    if ((p.type !== 'Property' && p.type !== 'ObjectProperty') || p.computed) continue
    const key = p.key?.name ?? p.key?.value
    if (typeof key !== 'string') continue
    const v = unwrap(p.value)
    if (v?.type === 'Literal' && (typeof v.value === 'string' || typeof v.value === 'number')) {
      out[key] = v.value as string | number
    } else if (v?.type === 'UnaryExpression' && v.operator === '-' && v.argument?.type === 'Literal') {
      out[key] = -Number(v.argument.value)
    }
  }
  return out
}

/** Merge a parsed app theme OVER the defaults, per group + per entry (so an app
 *  that only overrides `color.primary` keeps every other default token). */
export function mergeTheme(over: Partial<ThemeTable> | null | undefined): ThemeTable {
  if (!over) return DEFAULT_THEME
  return {
    color: { ...DEFAULT_THEME.color, ...over.color },
    spacing: { ...DEFAULT_THEME.spacing, ...over.spacing },
    radius: { ...DEFAULT_THEME.radius, ...over.radius },
  }
}

/**
 * Resolve a theme-token reference to a connector-parseable value, or null.
 * Accepts the value expression directly (`t.color.primary`) OR an arrow whose
 * body is the member chain (`(t) => t.color.primary`, `(p) => p.theme.color.primary`).
 * A color group → a #hex string; a spacing / radius group → a number. Resolves
 * against `theme` (the app theme merged over defaults).
 */
export function resolveThemeToken(
  node: AnyNode | undefined,
  theme: ThemeTable = DEFAULT_THEME,
): string | number | null {
  let chain = memberChain(node)
  if (!chain) return null
  // Two authoring shapes reach the same tokens: rocketstyle's `.theme((t) => …)`
  // passes the theme directly (`t.color.primary`); styler passes the PROPS
  // (`(p) => p.theme.color.primary`). Strip a leading `.theme.` so both resolve.
  if (chain.length >= 2 && chain[1] === 'theme') chain = [chain[0]!, ...chain.slice(2)]
  if (chain.length < 3) return null // <root>.<group>.<entry…>
  const group = GROUP_ALIAS[chain[1]!]
  if (!group) return null
  const map = theme[group] as Record<string, string | number>
  // Flat (`t.color.primary`) OR nested (`t.color.system.primary.base`) — take
  // the first chain segment (after the group) that names a known token entry.
  for (const k of chain.slice(2)) {
    if (Object.prototype.hasOwnProperty.call(map, k)) return map[k]!
  }
  return null
}

/** Extract `[root, ...members]` from a member chain (or an arrow returning one). */
function memberChain(node: AnyNode | undefined): string[] | null {
  let n = unwrap(node)
  if (n?.type === 'ArrowFunctionExpression') {
    const body = unwrap(n.body)
    if (body?.type === 'BlockStatement') {
      const ret = ((body.body as AnyNode[]) ?? []).find((s) => s.type === 'ReturnStatement')
      n = ret ? unwrap(ret.argument) : undefined
    } else {
      n = body
    }
  }
  const parts: string[] = []
  let cur = unwrap(n)
  while (cur && cur.type === 'MemberExpression') {
    const prop = cur.property
    if (!prop || prop.type !== 'Identifier' || cur.computed) return null
    parts.unshift(prop.name as string)
    cur = unwrap(cur.object)
  }
  if (!cur || cur.type !== 'Identifier') return null
  parts.unshift(cur.name as string)
  return parts
}
