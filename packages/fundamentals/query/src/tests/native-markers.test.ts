import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { QueryClientProvider } from '../query-client'
import { QueryErrorResetBoundary } from '../use-query-error-reset-boundary'

describe('native-compat markers — @pyreon/query', () => {
  it('QueryClientProvider is marked native', () => {
    expect(isNativeCompat(QueryClientProvider)).toBe(true)
  })
  it('QueryErrorResetBoundary is marked native', () => {
    expect(isNativeCompat(QueryErrorResetBoundary)).toBe(true)
  })
})
