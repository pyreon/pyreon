/**
 * `@pyreon/config`'s `LatheSection` and Lathe's own are the SAME type.
 *
 * `@pyreon/config` is dependency-free by design, so it carries a copy rather
 * than importing this package -- and the copy drifted: it lacked `client` and
 * `validator` (a `defineConfig` user could not set them without a cast), and
 * typed `plugins` as `string[]`, so `plugins: ['querys']` typechecked and
 * failed at run time.
 *
 * The assertions are COMPILE-TIME: the package typecheck fails when the two
 * types diverge in either direction, and the runtime spec only exists so the
 * file is a test at all.
 */
import type { LathePluginName, LathePluginObject, LatheSection as ConfigSection } from '@pyreon/config'
import { ALL_PLUGINS, type LatheSection, type PluginName } from '../core/config'
import { definePlugin, type LathePlugin } from '../core/plugin'

/** `true` only when A and B are mutually assignable. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
/** `true` only when A is assignable to B. */
type Assignable<A, B> = [A] extends [B] ? true : false
/** `true` only when the two key sets are identical. */
type SameKeys<A, B> = [Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>] extends [never] ? true : false

/*
 * `plugins` is the one field compared in ONE direction. Lathe's plugin type
 * names the IR in its hook parameters, and a dependency-free copy of the IR in
 * `@pyreon/config` would be a second 300-line type to keep in sync. The config
 * only has to ACCEPT every real plugin, which `never` hook parameters do -- so
 * the check is "Lathe's plugin is assignable to the config's", plus identical
 * hook KEYS so a new hook cannot be added on one side only.
 */
type Data<T> = Omit<T, 'plugins' | 'projects'>
const sectionsMatch: Mutual<Data<LatheSection>, Data<ConfigSection>> = true
const keysMatch: SameKeys<Required<LatheSection>, Required<ConfigSection>> = true
type Project = NonNullable<LatheSection['projects']>[number]
type ConfigProject = NonNullable<ConfigSection['projects']>[number]
const projectsMatch: Mutual<Data<Project>, Data<ConfigProject>> = true
const projectKeysMatch: SameKeys<Required<Project>, Required<ConfigProject>> = true
const pluginsMatch: Mutual<PluginName, LathePluginName> = true
type Entry = NonNullable<LatheSection['plugins']>[number]
type ConfigEntry = NonNullable<ConfigSection['plugins']>[number]
const entriesAccepted: Assignable<Entry, ConfigEntry> = true
const pluginKeysMatch: SameKeys<Required<LathePlugin>, Required<LathePluginObject>> = true

describe('@pyreon/config LatheSection parity', () => {
  it('matches Lathe\'s own section (enforced by the typecheck above)', () => {
    expect([sectionsMatch, keysMatch, projectsMatch, projectKeysMatch, pluginsMatch, entriesAccepted, pluginKeysMatch]).toEqual([
      true, true, true, true, true, true, true,
    ])
  })

  it('a typo in `plugins` is a TYPE error through @pyreon/config', () => {
    // @ts-expect-error -- 'querys' is not a plugin; this line must not compile.
    const bad: ConfigSection = { plugins: ['querys'] }
    expect(bad).toBeDefined()
    expect(ALL_PLUGINS).not.toContain('querys')
  })

  it('a definePlugin() plugin is accepted by @pyreon/config, hooks and all', () => {
    const plugin = definePlugin({
      name: 'parity-probe',
      transformDocument: (doc) => doc,
      emit: ({ doc }) => [{ path: 'probe.txt', contents: String(doc.operations.length) }],
    })
    const section: ConfigSection = { plugins: ['schemas', plugin] }
    expect(section.plugins).toContain(plugin)
  })
})
