import { describe, expect, it } from 'vitest'
import { buildScaffold } from '../scaffold'

// These guard the three things a Maestro flow silently depends on. Each was
// found by running the flow on a real emulator, not by reading code: without
// them `id:` selects nothing on Android and part of the screen is unreachable.
describe('buildScaffold — on-device E2E readiness', () => {
  const files = buildScaffold({ name: 'demo-app' })
  const get = (p: string) => files.find((f) => f.path === p)?.content ?? ''
  const activity = get('android/app/src/main/kotlin/com/example/demoapp/MainActivity.kt')

  it('MainActivity exposes test tags as resource ids, so Maestro id: works on Android', () => {
    expect(activity).toContain('testTagsAsResourceId = true')
    expect(activity).toContain('import androidx.compose.ui.semantics.testTagsAsResourceId')
    expect(activity).toContain('@OptIn(ExperimentalComposeUiApi::class)')
  })

  it('MainActivity keeps content out of the status bar (edge-to-edge on API 35+)', () => {
    expect(activity).toContain('safeDrawingPadding()')
    expect(activity).toContain('import androidx.compose.foundation.layout.safeDrawingPadding')
  })

  it('the sample app has the data-testid values the shipped flow selects', () => {
    const app = get('src/App.tsx')
    const flow = get('.maestro/counter.yaml')
    const ids = [...flow.matchAll(/id:\s*(\w+)/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(app).toContain(`data-testid="${id}"`)
  })

  it('the flow targets the same id the iOS bundle and the Android application use', () => {
    const appId = /appId:\s*(\S+)/.exec(get('.maestro/counter.yaml'))?.[1]
    expect(appId).toBe('com.example.DemoApp')
    expect(get('ios/project.yml')).toContain(`PRODUCT_BUNDLE_IDENTIFIER: ${appId}`)
    expect(get('android/app/build.gradle.kts')).toContain(`applicationId = "${appId}"`)
  })

  it('e2e scripts build and launch on the device before running the flows', () => {
    const scripts = (JSON.parse(get('package.json')) as { scripts: Record<string, string> }).scripts
    expect(scripts['e2e:ios']).toBe('pyreon-native dev --target=ios --once && maestro test .maestro')
    expect(scripts['e2e:android']).toBe('pyreon-native dev --target=android --once && maestro test .maestro')
  })
})
