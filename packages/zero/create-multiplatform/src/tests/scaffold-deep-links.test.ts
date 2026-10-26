import { describe, expect, it } from 'vitest'
import { parseArgs, USAGE } from '../index'
import { buildScaffold, defaultScheme, validateScheme } from '../scaffold'

// Inbound deep links (#3984). The runtime receivers (`PyreonDeepLink.receive`)
// existed on both platforms; the generated HOSTS never called them and declared
// no scheme, so `myapp://item/42` neither opened the app nor reached the router.
// These specs pin each half of the glue, since each is a separate way for a
// link to silently go nowhere.
describe('buildScaffold — deep links', () => {
  const files = buildScaffold({ name: 'my-app' })
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? ''
  const activity = get('android/app/src/main/kotlin/com/example/myapp/MainActivity.kt')
  const manifest = get('android/app/src/main/AndroidManifest.xml')

  it('iOS forwards both a custom-scheme URL and a universal link to the router', () => {
    const main = get('ios/Sources/Main.swift')
    expect(main).toContain('import PyreonRouter')
    expect(main).toContain('.onOpenURL { PyreonDeepLink.receive($0) }')
    expect(main).toContain('.onContinueUserActivity(NSUserActivityTypeBrowsingWeb)')
    expect(main).toContain('PyreonDeepLink.receive(url)')
  })

  it('iOS declares the scheme in BOTH project.yml and Info.plist (XcodeGen regenerates the plist from project.yml)', () => {
    expect(get('ios/project.yml')).toMatch(/CFBundleURLSchemes:\n\s+- myapp/)
    const plist = get('ios/Info.plist')
    expect(plist).toContain('<key>CFBundleURLSchemes</key>')
    expect(plist).toContain('<string>myapp</string>')
  })

  it('Android registers a VIEW/BROWSABLE filter for the scheme on a singleTop activity', () => {
    expect(manifest).toContain('android:launchMode="singleTop"')
    expect(manifest).toContain('android.intent.action.VIEW')
    expect(manifest).toContain('android.intent.category.BROWSABLE')
    expect(manifest).toContain('android.intent.category.DEFAULT')
    expect(manifest).toContain('<data android:scheme="myapp" />')
    // The launcher filter is untouched: a deep-link filter must be a SEPARATE intent-filter,
    // or the app stops being launchable from the home screen.
    expect(manifest.match(/<intent-filter>/g)).toHaveLength(2)
  })

  it('Android forwards the launch intent (fresh start only) and onNewIntent', () => {
    expect(activity).toContain('import com.pyreon.router.PyreonDeepLink')
    expect(activity).toContain('if (savedInstanceState == null) PyreonDeepLink.receive(intent?.data)')
    expect(activity).toContain('override fun onNewIntent(intent: Intent)')
    expect(activity).toContain('PyreonDeepLink.receive(intent.data)')
  })

  it('the scheme is the one the manifest, the plist and the project file all agree on', () => {
    const schemes = new Set(
      [
        ...get('ios/project.yml').matchAll(/CFBundleURLSchemes:\n\s+- (\S+)/g),
        ...manifest.matchAll(/android:scheme="([^"]+)"/g),
        ...get('ios/Info.plist').matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>([^<]+)</g),
      ].map((m) => m[1]),
    )
    expect([...schemes]).toEqual(['myapp'])
  })
})

describe('--scheme', () => {
  it('overrides the default everywhere', () => {
    const files = buildScaffold({ name: 'my-app', scheme: 'Acme' })
    const all = files.map((f) => f.content).join('\n')
    expect(all).toContain('<data android:scheme="acme" />')
    expect(all).toContain('- acme')
    expect(all).not.toContain('android:scheme="myapp"')
  })

  it('defaults to the identifier, prefixed when it would not start with a letter', () => {
    expect(defaultScheme('myapp')).toBe('myapp')
    expect(defaultScheme('3dviewer')).toBe('app3dviewer')
    expect(buildScaffold({ name: '3d-viewer' }).map((f) => f.content).join('\n')).toContain(
      'android:scheme="app3dviewer"',
    )
  })

  it('rejects an invalid or platform-owned scheme before anything is generated', () => {
    expect(() => validateScheme('1abc')).toThrow(/invalid URL scheme/)
    expect(() => validateScheme('my app')).toThrow(/invalid URL scheme/)
    expect(() => validateScheme('')).toThrow(/invalid URL scheme/)
    for (const reserved of ['http', 'HTTPS', 'file', 'mailto', 'javascript']) {
      expect(() => validateScheme(reserved)).toThrow(/not a valid app URL scheme/)
    }
    expect(() => buildScaffold({ name: 'ok', scheme: 'https' })).toThrow(/not a valid app URL scheme/)
    expect(validateScheme('  Co.Acme-app+x ')).toBe('co.acme-app+x')
  })

  it('is parsed from both argv forms, and a missing value is an error rather than a swallowed flag', () => {
    expect(parseArgs(['my-app', '--scheme', 'acme']).scheme).toBe('acme')
    expect(parseArgs(['my-app', '--scheme=acme']).scheme).toBe('acme')
    expect(parseArgs(['my-app']).scheme).toBeUndefined()
    expect(() => parseArgs(['my-app', '--scheme'])).toThrow(/--scheme needs a value/)
    expect(() => parseArgs(['my-app', '--scheme', '--dir', 'x'])).toThrow(/--scheme needs a value/)
    expect(USAGE).toContain('--scheme')
  })
})
