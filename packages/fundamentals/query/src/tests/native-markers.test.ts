import { isNativeCompat } from '@pyreon/core'
import { describe, expect, it } from 'vitest'
import { QueryDevtools } from '../devtools'
import { HydrationBoundary } from '../hydration-boundary'
import { IsRestoringProvider } from '../is-restoring'
import { PersistQueryClientProvider } from '../persist-provider'
import { QueryClientProvider } from '../query-client'
import { QueryErrorResetBoundary } from '../use-query-error-reset-boundary'

describe('native-compat markers — @pyreon/query', () => {
  it('QueryClientProvider is marked native', () => {
    expect(isNativeCompat(QueryClientProvider)).toBe(true)
  })
  it('QueryErrorResetBoundary is marked native', () => {
    expect(isNativeCompat(QueryErrorResetBoundary)).toBe(true)
  })
  it('HydrationBoundary is marked native', () => {
    expect(isNativeCompat(HydrationBoundary)).toBe(true)
  })
  it('IsRestoringProvider is marked native', () => {
    expect(isNativeCompat(IsRestoringProvider)).toBe(true)
  })
  it('PersistQueryClientProvider is marked native', () => {
    expect(isNativeCompat(PersistQueryClientProvider)).toBe(true)
  })
  it('QueryDevtools is marked native', () => {
    expect(isNativeCompat(QueryDevtools)).toBe(true)
  })
})
