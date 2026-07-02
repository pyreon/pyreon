/**
 * `zero({ image, font })` auto-wire contract.
 *
 * The original "out of the box optimization" goal: a user adds `pyreon()` +
 * `zero()` to their vite config and `<Image src={import('./hero.png?optimize')}/>`
 * Just Works — no need to know about `imagePlugin()` / `fontPlugin()`. This
 * test locks the contract:
 *
 *   - Default `zero()` auto-wires BOTH `imagePlugin()` and `fontPlugin()`
 *   - `zero({ image: false })` omits the imagePlugin
 *   - `zero({ font: false })` omits the fontPlugin
 *   - `zero({ image: {...} })` forwards the config object to imagePlugin
 *   - `zero({ font: {...} })` forwards the config object to fontPlugin
 *   - User-supplied imagePlugin in vite.config keeps working (no double-wire)
 *
 * Bisect-verifying this gate: removing the `if (userConfig.image !== false)`
 * push fails the default-auto-wire spec; setting `image: false` then asserting
 * the plugin is absent fails when the opt-out branch is removed.
 */
import { describe, expect, it } from 'vitest'
import { zeroPlugin } from '../vite-plugin'

function pluginNames(plugins: ReturnType<typeof zeroPlugin>): string[] {
  return plugins.map((p) => p.name)
}

describe('zero({ image, font }) — auto-wire contract', () => {
  it('default zero() auto-wires imagePlugin + fontPlugin + fontImportPlugin', () => {
    const plugins = zeroPlugin()
    const names = pluginNames(plugins)
    expect(names).toContain('pyreon-zero')
    expect(names).toContain('pyreon-zero-images')
    expect(names).toContain('pyreon-zero-fonts')
    // fontImportPlugin pairs with fontPlugin under the same opt-out flag.
    expect(names).toContain('pyreon-zero-font-import')
  })

  it('zero({ image: false }) skips the imagePlugin', () => {
    const plugins = zeroPlugin({ image: false })
    const names = pluginNames(plugins)
    expect(names).not.toContain('pyreon-zero-images')
    // font + font-import still on by default
    expect(names).toContain('pyreon-zero-fonts')
    expect(names).toContain('pyreon-zero-font-import')
  })

  it('zero({ font: false }) skips both fontPlugin AND fontImportPlugin', () => {
    const plugins = zeroPlugin({ font: false })
    const names = pluginNames(plugins)
    expect(names).not.toContain('pyreon-zero-fonts')
    // `?font` import support is part of the font integration — opting
    // out of `font` opts out of BOTH plugins (no good reason to keep
    // the `?font` transformer when build-time font emission is off).
    expect(names).not.toContain('pyreon-zero-font-import')
    // image still on by default
    expect(names).toContain('pyreon-zero-images')
  })

  it('zero({ image: false, font: false }) skips all three', () => {
    const plugins = zeroPlugin({ image: false, font: false })
    const names = pluginNames(plugins)
    expect(names).not.toContain('pyreon-zero-images')
    expect(names).not.toContain('pyreon-zero-fonts')
    expect(names).not.toContain('pyreon-zero-font-import')
    expect(names).toContain('pyreon-zero')
  })

  it('zero({ image: {} }) wires imagePlugin with default config', () => {
    const plugins = zeroPlugin({ image: {} })
    expect(pluginNames(plugins)).toContain('pyreon-zero-images')
  })

  it('zero({ image: { placeholder: "none" } }) wires imagePlugin with overrides', () => {
    // The config flows in; the plugin name is the same. This asserts the
    // user-supplied object doesn't break wiring. (The plugin's actual config
    // consumption is exercised by image-plugin.test.ts.)
    const plugins = zeroPlugin({ image: { placeholder: 'none' } })
    expect(pluginNames(plugins)).toContain('pyreon-zero-images')
  })

  it('zero({ font: { google: ["Inter:wght@400;700"] } }) wires fontPlugin', () => {
    const plugins = zeroPlugin({
      font: { google: ['Inter:wght@400;700'] },
    })
    expect(pluginNames(plugins)).toContain('pyreon-zero-fonts')
  })

  it('SSG mode still auto-wires both image + font plugins', () => {
    const plugins = zeroPlugin({ mode: 'ssg' })
    const names = pluginNames(plugins)
    expect(names).toContain('pyreon-zero')
    expect(names).toContain('pyreon-zero-images')
    expect(names).toContain('pyreon-zero-fonts')
    // SSG companion present
    expect(names.some((n) => n.includes('ssg'))).toBe(true)
  })

  it('SSR mode still auto-wires both image + font plugins', () => {
    const plugins = zeroPlugin({ mode: 'ssr' })
    const names = pluginNames(plugins)
    expect(names).toContain('pyreon-zero-images')
    expect(names).toContain('pyreon-zero-fonts')
  })
})

describe('zero({ seo, favicon, og, ai }) — config-present auto-wire contract', () => {
  // Unlike image/font these are NOT default-on: each needs user input to do
  // anything meaningful (an origin, a source icon, templates). `undefined`
  // means "not used"; supplying the config IS the opt-in.
  it('default zero() wires NONE of seo/favicon/og/ai', () => {
    const names = pluginNames(zeroPlugin())
    expect(names).not.toContain('pyreon-zero-seo')
    expect(names).not.toContain('pyreon-zero-favicon')
    expect(names).not.toContain('pyreon-zero-og-image')
    expect(names).not.toContain('pyreon-zero-ai')
  })

  it('zero({ seo }) wires seoPlugin', () => {
    const names = pluginNames(
      zeroPlugin({ seo: { sitemap: { origin: 'https://example.com' } } }),
    )
    expect(names).toContain('pyreon-zero-seo')
    // the others stay absent
    expect(names).not.toContain('pyreon-zero-favicon')
  })

  it('zero({ favicon }) wires faviconPlugin', () => {
    const names = pluginNames(zeroPlugin({ favicon: { source: './src/favicon.svg' } }))
    expect(names).toContain('pyreon-zero-favicon')
  })

  it('zero({ og }) wires ogImagePlugin', () => {
    const names = pluginNames(
      zeroPlugin({
        og: {
          templates: [
            { name: 'default', background: { color: '#111827' }, layers: [{ text: 'Hi' }] },
          ],
        },
      }),
    )
    expect(names).toContain('pyreon-zero-og-image')
  })

  it('zero({ ai }) wires aiPlugin', () => {
    const names = pluginNames(zeroPlugin({ ai: { name: 'My Site' } }))
    expect(names).toContain('pyreon-zero-ai')
  })

  it('all four together wire all four (one config surface)', () => {
    const names = pluginNames(
      zeroPlugin({
        seo: { sitemap: { origin: 'https://example.com' } },
        favicon: { source: './src/favicon.svg' },
        og: {
          templates: [
            { name: 'default', background: { color: '#111827' }, layers: [{ text: 'Hi' }] },
          ],
        },
        ai: { name: 'My Site' },
      }),
    )
    expect(names).toContain('pyreon-zero-seo')
    expect(names).toContain('pyreon-zero-favicon')
    expect(names).toContain('pyreon-zero-og-image')
    expect(names).toContain('pyreon-zero-ai')
  })
})
