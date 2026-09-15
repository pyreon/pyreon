/**
 * `on-change-input` must read the `type` of an `<input>` written WITH a
 * closing tag.
 *
 * `findParentJsxElement` returns the OPENING element for a non-self-closing
 * `<input …></input>`, and `isTextLikeInput` only knew how to read attributes
 * off a self-closing element or a full element — so that shape had no `type`
 * probe and a checkbox was reported as text-like, telling the author to
 * rewrite a correct `onChange`.
 */
import { expect, it } from 'vitest'
import { detectReactPatterns } from '../react-intercept'

const codes = (src: string): string[] => detectReactPatterns(src, 'a.tsx').map((d) => d.code)

it('stays quiet on a checkbox written with a closing tag', () => {
  expect(codes(`const A = <input type="checkbox" onChange={f}></input>`)).not.toContain(
    'on-change-input',
  )
})

it('still fires on a text input written with a closing tag, and on the self-closing checkbox control', () => {
  expect(codes(`const A = <input type="text" onChange={f}></input>`)).toContain('on-change-input')
  expect(codes(`const A = <input type="checkbox" onChange={f} />`)).not.toContain('on-change-input')
})
