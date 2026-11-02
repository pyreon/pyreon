// What a page hosted in `<WebView>` needs DECLARED by the app (#3982).
//
// The runtime cannot declare manifest / Info.plist entries itself: its sources
// are compiled into the app (Gradle `srcDir`, xcodegen `sources:`), so there is
// no library manifest to merge them from. Each is therefore a contract between
// the scaffold and the runtime, and this file holds both ends to it:
//
//   - the FileProvider a `capture` file input writes through — declared, at the
//     EXACT authority and cache path the Kotlin runtime looks up, or capture
//     silently degrades to the picker;
//   - location / camera / microphone — shipped COMMENTED OUT on both targets,
//     because a permission (or usage string) the app never uses is a store
//     review problem, and declaring one is the app's decision.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

const repo = new URL('../../../../../', import.meta.url)
const read = (path: string): string => readFileSync(new URL(path, repo), 'utf8')

const files = buildScaffold({ name: 'my-app' })
const get = (p: string): string => files.find((f) => f.path === p)?.content ?? ''
const manifest = get('android/app/src/main/AndroidManifest.xml')
const plist = get('ios/Info.plist')
const runtime = read('packages/fundamentals/hooks/native/kotlin/com/pyreon/runtime/PyreonWebChromeAndroid.kt')

/** The manifest with its XML comments removed — what Android actually reads. */
const live = (xml: string): string => xml.replace(/<!--[\s\S]*?-->/g, '')

describe('<WebView> host declarations', () => {
  it('the scaffold declares the FileProvider at the authority the runtime looks up', () => {
    const suffix = /"\$\{context\.packageName\}(\.[\w.]+)"/.exec(runtime)?.[1]
    expect(suffix, 'runtime authority suffix').toBe('.pyreon.fileprovider')
    const provider = /<provider\b[\s\S]*?<\/provider>/.exec(live(manifest))?.[0] ?? ''
    expect(provider).toContain('android:name="androidx.core.content.FileProvider"')
    expect(provider).toContain(`android:authorities="\${applicationId}${suffix}"`)
    expect(provider).toContain('android:exported="false"')
    expect(provider).toContain('android:grantUriPermissions="true"')
    expect(provider).toContain('android:resource="@xml/pyreon_webview_files"')
  })

  it('the provider paths cover the cache directory the runtime writes captures into', () => {
    const dir = /File\(context\.cacheDir, "([^"]+)"\)/.exec(runtime)?.[1]
    expect(dir, 'runtime capture dir').toBe('pyreon-webview')
    const paths = get('android/app/src/main/res/xml/pyreon_webview_files.xml')
    expect(paths).toContain(`<cache-path name="pyreon_webview" path="${dir}/" />`)
  })

  it('location / camera / microphone are offered, but NOT declared, on either target', () => {
    for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'RECORD_AUDIO']) {
      expect(manifest, `${p} offered`).toContain(`android.permission.${p}`)
      expect(live(manifest), `${p} not live`).not.toContain(`android.permission.${p}`)
    }
    for (const k of ['NSLocationWhenInUseUsageDescription', 'NSCameraUsageDescription', 'NSMicrophoneUsageDescription']) {
      expect(plist, `${k} offered`).toContain(k)
      expect(live(plist), `${k} not live`).not.toContain(k)
    }
  })

  it('the device-proven example declares what its hosted page uses', () => {
    // examples/native-tasks hosts a page that reads the location and takes a
    // file input; its device tests are the proof, so it must declare both.
    const m = live(read('examples/native-tasks-android/app/src/main/AndroidManifest.xml'))
    expect(m).toContain('android:authorities="${applicationId}.pyreon.fileprovider"')
    expect(m).toContain('android.permission.ACCESS_FINE_LOCATION')
    expect(read('examples/native-tasks-android/app/src/main/res/xml/pyreon_webview_files.xml')).toContain(
      'path="pyreon-webview/"',
    )
    expect(live(read('examples/native-tasks-ios/ios/Info.plist'))).toContain('NSLocationWhenInUseUsageDescription')
  })
})
