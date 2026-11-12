// Every Android host that mounts a PMTC-emitted app pads for the system bars and
// draws readable bar icons, the way the scaffold's MainActivity does it.
//
// The apps target SDK 35+, so Android 15+ draws them edge-to-edge: a host that
// calls `setContent { App() }` bare puts the top of the screen UNDER the status
// bar (the clock printed over the app's icon and title on an API 35 emulator).
// The emitted App() cannot pad for itself; the host owns the window. The light
// window theme keeps the strip under the bars light in dark mode too, so the
// bars must be the LIGHT style (dark icons) or the clock is white on white.
//
// The scaffold padded but left the icons white; the example hosts had neither. This file
// holds the scaffold AND every example host to the same contract, so a new
// example activity cannot ship without it.
//
// One deliberate difference: the scaffold pads with safeDrawingPadding() (bars,
// cutout AND the soft keyboard), the example hosts with
// systemBarsPadding().displayCutoutPadding() (no keyboard inset). With the window
// edge-to-edge, the keyboard inset re-lays the page out on every show/hide; the
// tasks example's fixed page is taller than what the keyboard leaves, so it is
// re-centred and slides while the keyboard animates, and the instrumented tests,
// which tap right after typing the login name, hit the wrong spot (four tasks
// tests failed on the API 33 emulator that way).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

const repo = fileURLToPath(new URL('../../../../../', import.meta.url))

/** The Kotlin with `//` line comments removed: the hosts' comments quote `setContent { App() }`. */
const code = (src: string): string => src.replace(/^\s*\/\/.*$/gm, '')

function activities(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'build' || name === 'generated' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...activities(p))
    else if (name.endsWith('Activity.kt') && p.includes('/src/main/')) out.push(p)
  }
  return out
}

/** Hosts = activities that mount a Compose tree (`setContent {`). */
const exampleHosts = readdirSync(join(repo, 'examples'))
  .filter((d) => d.endsWith('-android'))
  .flatMap((d) => activities(join(repo, 'examples', d)))
  .map((path) => ({ path: path.slice(repo.length), src: readFileSync(path, 'utf8') }))
  .filter((h) => code(h.src).includes('setContent {'))

const scaffold = buildScaffold({ name: 'demo-app' })
const scaffoldHost = {
  path: 'create-multiplatform scaffold MainActivity.kt',
  src: scaffold.find((f) => f.path.endsWith('/MainActivity.kt'))?.content ?? '',
}

type Padding = 'safeDrawing' | 'barsAndCutout'

function expectHostContract({ path, src: raw }: { path: string; src: string }, padding: Padding): void {
  const src = code(raw)
  const body = src.slice(src.indexOf('setContent {'))
  // the emitted root composable is mounted INSIDE a Box padded for the system bars
  if (padding === 'safeDrawing') {
    expect(body, `${path}: setContent must wrap the app in Box(Modifier.safeDrawingPadding()...)`).toMatch(
      /^setContent \{\s*Box\(Modifier\.safeDrawingPadding\(\)/,
    )
    expect(src, path).toContain('import androidx.compose.foundation.layout.safeDrawingPadding')
  } else {
    expect(
      body,
      `${path}: setContent must wrap the app in Box(Modifier.systemBarsPadding().displayCutoutPadding())`,
    ).toMatch(/^setContent \{\s*Box\(Modifier\.systemBarsPadding\(\)\.displayCutoutPadding\(\)\)/)
    expect(src, path).toContain('import androidx.compose.foundation.layout.systemBarsPadding')
    expect(src, path).toContain('import androidx.compose.foundation.layout.displayCutoutPadding')
    // no keyboard inset: it slides a fixed page while the keyboard animates
    expect(src, `${path}: no keyboard-inset padding in an example host`).not.toMatch(
      /safeDrawingPadding\(|imePadding\(|safeContentPadding\(/,
    )
  }
  // light (dark-icon) bars, set before the content is mounted
  const edge = src.indexOf('enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)')
  expect(edge, `${path}: enableEdgeToEdge with light bars`).toBeGreaterThan(-1)
  expect(edge, `${path}: enableEdgeToEdge before setContent`).toBeLessThan(src.indexOf('setContent {'))
  expect(src, path).toContain('val bars = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)')
}

describe('Android hosts: system bars', () => {
  it('finds the example hosts (a broken walk would pass vacuously)', () => {
    const paths = exampleHosts.map((h) => h.path)
    expect(paths).toContain('examples/native-tasks-android/app/src/main/kotlin/com/pyreon/MainActivity.kt')
    expect(paths).toContain('examples/native-router-demo-android/app/src/main/kotlin/com/pyreon/TabsDemoActivity.kt')
    expect(paths.length).toBeGreaterThanOrEqual(6)
  })

  it('the scaffold MainActivity pads for the bars and uses light bars', () => {
    expectHostContract(scaffoldHost, 'safeDrawing')
  })

  it.each(exampleHosts.map((h) => [h.path, h] as const))(
    '%s pads for the bars (not the keyboard) and uses light bars',
    (_, host) => {
      expectHostContract(host, 'barsAndCutout')
    },
  )

  it('every host keeps the light window theme the light bar style assumes', () => {
    const manifests = [
      scaffold.find((f) => f.path === 'android/app/src/main/AndroidManifest.xml')?.content ?? '',
      ...readdirSync(join(repo, 'examples'))
        .filter((d) => d.endsWith('-android'))
        .map((d) => readFileSync(join(repo, 'examples', d, 'app/src/main/AndroidManifest.xml'), 'utf8')),
    ]
    let hosts = 0
    for (const m of manifests) {
      // every activity except the runtime's own (the auth browser hand-off is translucent)
      for (const [tag] of m.matchAll(/<activity\b[^>]*android:name="(?!com\.pyreon\.runtime\.)[^"]+"[^>]*>/g)) {
        hosts++
        expect(tag).toContain('android:theme="@android:style/Theme.Material.Light.NoActionBar"')
      }
    }
    expect(hosts).toBeGreaterThanOrEqual(7)
  })
})
