/**
 * Reading a plugin module's exports -- the half of CLI plugin loading that
 * needs no filesystem, so `run.ts` can use it and a test can feed it objects.
 */

import { isLathePlugin, type LathePlugin } from '../core/plugin'

/**
 * The plugin(s) a loaded module provides: its default export -- a plugin, an
 * array of plugins, or a factory called with no arguments that returns either
 * -- or else its only named export that is a plugin.
 */
export function pluginsFromModule(mod: unknown, spec: string): LathePlugin[] {
  const m = (mod ?? {}) as Record<string, unknown>
  const fromValue = (value: unknown): LathePlugin[] | undefined => {
    if (isLathePlugin(value)) return [value]
    if (Array.isArray(value) && value.length > 0 && value.every(isLathePlugin)) return value as LathePlugin[]
    return undefined
  }
  if ('default' in m) {
    let value = m.default
    if (typeof value === 'function' && !isLathePlugin(value)) value = (value as () => unknown)()
    const found = fromValue(value)
    if (found) return found
    throw new Error(
      `\`${spec}\`'s default export is not a Lathe plugin. Export \`definePlugin({ name, … })\`, an array of them, or a function returning one.`,
    )
  }
  const named = Object.entries(m).filter(([, v]) => isLathePlugin(v))
  if (named.length === 1) return [named[0]?.[1] as LathePlugin]
  throw new Error(
    named.length === 0
      ? `\`${spec}\` exports no Lathe plugin. Make one with \`definePlugin\` and export it as the default.`
      : `\`${spec}\` exports several plugins (${named.map(([k]) => k).join(', ')}) and no default — name one as the default export, or list them from a config file.`,
  )
}
