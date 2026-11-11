/**
 * Compile-time tests: every Pyreon-authored optional option accepts an
 * explicit `undefined` under `exactOptionalPropertyTypes` (on in
 * `@pyreon/typescript`'s preset). Without `| undefined`, a forwarded or
 * conditional option (`invalidates: cond ? keys : undefined`), or an options
 * object built by a bridge such as `@pyreon/http`'s `endpoint.mutation()`,
 * is rejected (#4310). The bodies are type-checked by `tsc` (the package's
 * `typecheck`); they are never called at runtime.
 */

import type { QueryKey } from '@tanstack/query-core'
import { describe, it } from 'vitest'
import {
  mutationOptions,
  useMutation,
  useMutationState,
  useStream,
  useSubscription,
} from '../index'

const maybe = <T>(value: T): T | undefined => (Math.random() > 2 ? value : undefined)

describe('optional options accept an explicit undefined', () => {
  it('useMutation / mutationOptions: invalidates', () => {
    const typeOnly = () => {
      const invalidates: QueryKey[] | undefined = maybe([['posts']])
      useMutation({ mutationFn: async (n: number) => n, invalidates })
      useMutation(mutationOptions({ mutationFn: async (n: number) => n, invalidates }))
    }
    void typeOnly
  })

  it('useMutationState: filters / select', () => {
    const typeOnly = () => {
      useMutationState(() => ({ filters: undefined, select: undefined }))
    }
    void typeOnly
  })

  it('useSubscription: every optional', () => {
    const typeOnly = () => {
      useSubscription({
        url: 'wss://x',
        onMessage: () => {},
        protocols: maybe('p'),
        onOpen: undefined,
        onClose: undefined,
        onError: undefined,
        reconnect: maybe(true),
        reconnectDelay: maybe(1),
        maxReconnectDelay: maybe(1),
        maxReconnectAttempts: maybe(1),
        enabled: maybe(true),
      })
    }
    void typeOnly
  })

  it('useStream: every optional', () => {
    const typeOnly = () => {
      useStream(() => undefined, { enabled: undefined, maxEvents: maybe(10), onEvent: undefined })
    }
    void typeOnly
  })
})
