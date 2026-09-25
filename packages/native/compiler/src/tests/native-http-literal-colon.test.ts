// `\:` is `@pyreon/http`'s escape for a LITERAL colon in an endpoint path
// (Google-style custom verbs, `/v1/:name\:cancel`). The native compiler reads
// the same path template, so it must treat the escape exactly as the web's
// `applyPathParams` does — otherwise the native URL demands a second
// parameter (`cancel`) that the web never asks for, and the call stays web.
// Differential against the REAL web builder, like `native-http-url-parity`.

import { buildUrl } from '@pyreon/http'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const src = (path: string, args: string): string => `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
const api = createHttp({ baseUrl: 'https://api.test' })
const op = api.endpoint('POST ${path}')
export function S() {
  const u = useFetch<{ id: string }>(op(${args}))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`

function emittedUrl(code: string): string | undefined {
  return /\burl\s*[:=]\s*"([^"]*)"/.exec(code)?.[1]
}

describe('literal colon escape in an endpoint path', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: bakes the same URL as the web, with no phantom parameter`, () => {
      // Written for the SOURCE text: `\\\\:` here is `\\:` in the TSX, the JS
      // string literal for `\:`.
      const out = transform(src('/v1/:name\\\\:cancel', "{ params: { name: 'ops/1' } }"), { target })
      expect(out.warnings.join('\n')).not.toMatch(/cancel/)
      const web = buildUrl('https://api.test', '/v1/:name\\:cancel', { name: 'ops/1' }, undefined)
      expect(web).toBe('https://api.test/v1/ops%2F1:cancel')
      expect(emittedUrl(out.code)).toBe(web)
    })
  }
})
