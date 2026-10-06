// The REAL lazy loader's not-installed path for MCP `validate`. See the cli
// twin (`native-audit-gate-absent.test.ts`): an injected loader cannot prove
// the missing-peer detection inside `loadNativeDetector` itself.

import { describe, expect, it } from 'vitest'
import { detectNative, loadNativeDetector } from '../native-detect'

const ABSENT = '@pyreon/native-compiler-absent/audit'

describe('native detector — the real loader with the peer absent', () => {
  it('loadNativeDetector() resolves to undefined, it does not throw', async () => {
    expect(await loadNativeDetector(ABSENT)).toBeUndefined()
  })

  it('a multiplatform snippet reports the native checks SKIPPED through the REAL loader', async () => {
    const r = await detectNative(
      `import { Stack } from '@pyreon/primitives'\nclass C {}\n`,
      'a.tsx',
      () => loadNativeDetector(ABSENT),
    )
    expect(r).toEqual({ diags: [], skipped: true })
  })

  it('a pure-web snippet is unaffected', async () => {
    const r = await detectNative(`import { signal } from '@pyreon/reactivity'\n`, 'a.tsx', () =>
      loadNativeDetector(ABSENT),
    )
    expect(r).toEqual({ diags: [], skipped: false })
  })
})
