// The Android root activity must handle its own configuration changes.
//
// Without `android:configChanges`, rotation or a dark-mode switch destroys and
// recreates MainActivity, and every compiler-emitted
// `remember { mutableStateOf(...) }` starts over: counters reset, forms empty,
// a flow graph reloads. Proven on a device by
// `examples/native-counter-android`'s `stateSurvivesRotationAndThemeSwitch`,
// which fails without the attribute. This locks the attribute in the scaffold
// AND in every example, since an example copied from an old one is how the
// gap spreads.

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

/** Every change Compose can absorb by recomposing; the React Native default set. */
const REQUIRED = ['orientation', 'screenSize', 'screenLayout', 'smallestScreenSize', 'uiMode', 'keyboard', 'keyboardHidden']

function launcherConfigChanges(manifest: string): string[] | null {
  const activity = /<activity\b[^>]*>(?:(?!<\/activity>)[\s\S])*android\.intent\.category\.LAUNCHER/.exec(manifest)?.[0]
  if (!activity) return null
  const attr = /android:configChanges="([^"]*)"/.exec(activity)
  return attr ? attr[1]!.split('|') : []
}

const examplesDir = new URL('../../../../../examples/', import.meta.url)
const exampleManifests = readdirSync(examplesDir)
  .filter((d) => /^native-.*-android$/.test(d))
  .map((d) => ({ name: d, text: readFileSync(new URL(`${d}/app/src/main/AndroidManifest.xml`, examplesDir), 'utf8') }))

describe('the Android launcher activity keeps its state across configuration changes', () => {
  it('the scaffold declares every change Compose absorbs', () => {
    const manifest = buildScaffold({ name: 'my-app' }).find((f) => f.path === 'android/app/src/main/AndroidManifest.xml')?.content ?? ''
    expect(launcherConfigChanges(manifest)).toEqual(expect.arrayContaining(REQUIRED))
  })

  it('finds the example apps', () => {
    expect(exampleManifests.length).toBeGreaterThanOrEqual(5)
  })

  for (const { name, text } of exampleManifests) {
    it(name, () => {
      expect(launcherConfigChanges(text), `${name}: the launcher activity has no configChanges`).toEqual(expect.arrayContaining(REQUIRED))
    })
  }
})
