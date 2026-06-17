// Escape-hatch primitives (`<Web>` / `<NativeIOS>` / `<NativeAndroid>`) —
// Layer-4 per-platform branch selection. On each native target, exactly
// the matching branch emits its children; the other two render nothing.
// This is the foundation for shipping a platform-specific subtree from one
// source (e.g. web-only-rich charts behind <Web>, a native equivalent or a
// <WebView> embed behind <NativeIOS>/<NativeAndroid>).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const APP = (body: string) =>
  `import { Stack, Text, NativeIOS, NativeAndroid, Web } from '@pyreon/primitives'
export function App() { return <Stack>${body}</Stack> }`

describe('escape-hatch primitives — per-platform branch selection', () => {
  describe('Swift target (iOS)', () => {
    it('<NativeIOS> emits its children; <NativeAndroid>/<Web> render EmptyView()', () => {
      const out = transform(
        APP(
          `<NativeIOS><Text>ios-only</Text></NativeIOS>` +
            `<NativeAndroid><Text>android-only</Text></NativeAndroid>` +
            `<Web><Text>web-only</Text></Web>`,
        ),
        { target: 'swift' },
      ).code
      // iOS branch content is present...
      expect(out).toContain('ios-only')
      // ...the other platforms' content is NOT emitted on iOS...
      expect(out).not.toContain('android-only')
      expect(out).not.toContain('web-only')
      // ...and the dropped branches become EmptyView().
      expect(out).toContain('EmptyView()')
    })

    it('empty <NativeIOS> emits EmptyView() (no dangling view)', () => {
      const out = transform(APP(`<NativeIOS></NativeIOS>`), { target: 'swift' }).code
      expect(out).toContain('EmptyView()')
    })
  })

  describe('Kotlin target (Android)', () => {
    it('<NativeAndroid> emits its children; <NativeIOS>/<Web> render a no-op', () => {
      const out = transform(
        APP(
          `<NativeIOS><Text>ios-only</Text></NativeIOS>` +
            `<NativeAndroid><Text>android-only</Text></NativeAndroid>` +
            `<Web><Text>web-only</Text></Web>`,
        ),
        { target: 'kotlin' },
      ).code
      expect(out).toContain('android-only')
      expect(out).not.toContain('ios-only')
      expect(out).not.toContain('web-only')
      // Dropped branches become a no-op comment (valid in any Composable).
      expect(out).toContain('escape-hatch:')
    })
  })

  it('no spurious warnings for the escape-hatch tags (they are intrinsic, not unknown components)', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(
        APP(`<NativeIOS><Text>x</Text></NativeIOS><Web><Text>y</Text></Web>`),
        { target },
      )
      expect(r.warnings.some((w) => w.toLowerCase().includes('escape') || w.includes('NativeIOS') || w.includes('<Web>'))).toBe(false)
    }
  })
})
