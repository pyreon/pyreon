// `useClipboard` was 1:1-INVERTED on its reactive reads — the third instance
// of this class, after `model()`'s state fields and (avoided by
// construction) `useBluetooth`'s.
//
// On the web `copied` and `text` are ACCESSORS:
//
//     copied: () => boolean
//     {() => copied() ? 'Copied!' : 'Copy'}     // the hook's own example
//
// Natively they are stored properties (`public private(set) var copied: Bool`
// on Swift, `val copied: Boolean get() = …` on Kotlin), so the web-correct
// spelling — taken verbatim from the hook's documentation — failed with
// `cannot call value of non-function type 'Bool'`. The spelling that DID
// compile natively (`c.copied`) renders the accessor function on the web.
//
// The class is worth naming because it keeps recurring: a hook whose web
// surface is accessors and whose native surface is fields needs a use-site
// rewrite, or the two spellings are mutually exclusive.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { useClipboard } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function App() {
  const c = useClipboard()
  return (
    <Stack>
      <Text>{c.copied() ? 'Copied!' : 'Copy'}</Text>
      <Text>{c.text()}</Text>
      <Button onPress={() => c.copy('hi')}>copy</Button>
    </Stack>
  )
}`

describe('the web-correct accessor spelling reaches the native field', () => {
  it('Swift drops the read parens', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('c.copied ?')
    expect(out).toContain('c.text)')
    // The shape that failed to compile.
    expect(out).not.toContain('c.copied()')
  })

  it('Kotlin drops them too — `copied` is a `val … get()` there', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('c.copied)')
    expect(out).not.toContain('c.copied()')
  })

  it('a METHOD keeps its parens and arguments', () => {
    // The rewrite must not swallow `copy(text)`, which really is a method
    // on both targets.
    expect(transform(APP, { target: 'swift' }).code).toContain('c.copy("hi")')
    expect(transform(APP, { target: 'kotlin' }).code).toContain('c.copy("hi")')
  })
})

describe('the emitted reads survive the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
