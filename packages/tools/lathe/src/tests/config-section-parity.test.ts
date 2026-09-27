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
import type { LathePluginName, LatheSection as ConfigSection } from '@pyreon/config'
import { ALL_PLUGINS, type LatheSection, type PluginName } from '../core/config'

/** `true` only when A and B are mutually assignable. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
/** `true` only when the two key sets are identical. */
type SameKeys<A, B> = [Exclude<keyof A, keyof B> | Exclude<keyof B, keyof A>] extends [never] ? true : false

const sectionsMatch: Mutual<LatheSection, ConfigSection> = true
const keysMatch: SameKeys<Required<LatheSection>, Required<ConfigSection>> = true
type Project = NonNullable<LatheSection['projects']>[number]
type ConfigProject = NonNullable<ConfigSection['projects']>[number]
const projectKeysMatch: SameKeys<Required<Project>, Required<ConfigProject>> = true
const pluginsMatch: Mutual<PluginName, LathePluginName> = true

describe('@pyreon/config LatheSection parity', () => {
  it('matches Lathe\'s own section (enforced by the typecheck above)', () => {
    expect([sectionsMatch, keysMatch, projectKeysMatch, pluginsMatch]).toEqual([true, true, true, true])
  })

  it('a typo in `plugins` is a TYPE error through @pyreon/config', () => {
    // @ts-expect-error -- 'querys' is not a plugin; this line must not compile.
    const bad: ConfigSection = { plugins: ['querys'] }
    expect(bad).toBeDefined()
    expect(ALL_PLUGINS).not.toContain('querys')
  })
})
