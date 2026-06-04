/**
 * Singleton sentinel — contract tests.
 *
 * The sentinel registers a marker on globalThis at module load. Two
 * registrations with the same package name but DIFFERENT normalized
 * locations trigger detection (throw / warn / silent based on the
 * PYREON_SINGLE_INSTANCE env var).
 *
 * These tests exercise the contract DIRECTLY by calling
 * `registerSingleton` with synthetic file:// URLs — no filesystem
 * dual-load harness needed. The sentinel compares normalized location
 * strings; it doesn't care HOW the two locations are different.
 *
 * Three concerns covered:
 *   1. Default-mode behaviour (throw on dual-load; HMR re-eval silent;
 *      error message names actionable fixes).
 *   2. PYREON_SINGLE_INSTANCE=warn / =silent escape hatches.
 *   3. Per-package coverage — every @pyreon/* with module-level state
 *      gets independent detection (cross-package isolation).
 *
 * Bisect-verify: neutralize the `throw new Error(message)` branch in
 * `singleton-sentinel.ts` → most positive-case tests fail; restored →
 * 30+/30+ pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetSentinel,
  registerSingleton,
  withSilent,
  withSilentSync,
} from '../singleton-sentinel'

// Cast through `unknown` — reactivity's env type only declares NODE_ENV;
// PYREON_SINGLE_INSTANCE is a runtime-only override used by the sentinel.
const env = process.env as unknown as Record<string, string | undefined>

beforeEach(() => {
  _resetSentinel()
  delete env.PYREON_SINGLE_INSTANCE
})

afterEach(() => {
  _resetSentinel()
  delete env.PYREON_SINGLE_INSTANCE
})

describe('Singleton sentinel — default mode', () => {
  it('first registration records the marker silently', () => {
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///workspace/reactivity/lib/index.js',
      )
    }).not.toThrow()
  })

  it('throws on duplicate load (different normalized locations)', () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/duplicate/reactivity/lib/index.js',
      )
    }).toThrow(/Multiple instances of @pyreon\/reactivity detected/)
  })

  it('error message names actionable fixes (Vite dedupe, npm ls, bun ls, env-var opt-outs)', () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    try {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/duplicate/reactivity/lib/index.js',
      )
      expect.fail('Expected sentinel to throw on duplicate load')
    } catch (err) {
      const msg = String((err as Error).message)
      expect(msg).toContain('resolve.dedupe')
      expect(msg).toContain('@pyreon/*')
      expect(msg).toContain('npm ls')
      expect(msg).toContain('bun pm ls')
      expect(msg).toContain('PYREON_SINGLE_INSTANCE=warn')
      expect(msg).toContain('PYREON_SINGLE_INSTANCE=silent')
    }
  })

  it('HMR re-eval (same normalized location + different Vite query) is allowed silently', () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    // Vite HMR re-eval adds ?v=<timestamp>, ?t=<timestamp>, or ?import.
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///workspace/reactivity/lib/index.js?v=12345',
      )
    }).not.toThrow()
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///workspace/reactivity/lib/index.js?t=67890&import',
      )
    }).not.toThrow()
  })
})

describe('Singleton sentinel — escape hatches', () => {
  it('warns instead of throwing under PYREON_SINGLE_INSTANCE=warn', () => {
    env.PYREON_SINGLE_INSTANCE = 'warn'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///workspace/reactivity/lib/index.js',
      )
      expect(() => {
        registerSingleton(
          '@pyreon/reactivity',
          '0.24.6',
          'file:///tmp/duplicate/reactivity/lib/index.js',
        )
      }).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
      const message = String(errorSpy.mock.calls[0]?.[0] ?? '')
      expect(message).toContain('Multiple instances of @pyreon/reactivity detected')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('silent under PYREON_SINGLE_INSTANCE=silent (no throw, no log)', () => {
    env.PYREON_SINGLE_INSTANCE = 'silent'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///workspace/reactivity/lib/index.js',
      )
      expect(() => {
        registerSingleton(
          '@pyreon/reactivity',
          '0.24.6',
          'file:///tmp/duplicate/reactivity/lib/index.js',
        )
      }).not.toThrow()
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('silent-mode demo — the bug class is LATENT (proves sentinel is load-bearing)', () => {
    // With the sentinel silenced, the registration succeeds — the
    // duplicate IS still there, just no longer detected. The sentinel
    // itself is the only thing standing between "duplicate exists" and
    // "user sees a clear error". This test is the empirical proof that
    // turning off the sentinel re-introduces the dual-instance scenario.
    env.PYREON_SINGLE_INSTANCE = 'silent'
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    // No throw — but the second location IS distinct from the first.
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/duplicate/reactivity/lib/index.js',
      )
    }).not.toThrow()
  })
})

// Every @pyreon/* package that calls registerSingleton at module load.
// This list must stay in sync with the actual registrations in each
// package's src/index.ts. Adding a new framework package = add its name
// here AND wire registerSingleton in the package's index.
const REGISTERED_PACKAGES = [
  '@pyreon/reactivity',
  '@pyreon/core',
  '@pyreon/router',
  '@pyreon/runtime-dom',
  '@pyreon/runtime-server',
  '@pyreon/head',
  '@pyreon/server',
  '@pyreon/store',
  '@pyreon/storage',
  '@pyreon/url-state',
  '@pyreon/hotkeys',
  '@pyreon/hooks',
  '@pyreon/toast',
  '@pyreon/dnd',
  '@pyreon/charts',
  '@pyreon/document',
  '@pyreon/form',
  '@pyreon/i18n',
  '@pyreon/state-tree',
  '@pyreon/ui-core',
  '@pyreon/elements',
  '@pyreon/styler',
  '@pyreon/rocketstyle',
  '@pyreon/zero',
] as const

describe('Singleton sentinel — per-package coverage', () => {
  for (const pkg of REGISTERED_PACKAGES) {
    it(`throws when ${pkg} is loaded from two different paths`, () => {
      registerSingleton(pkg, '0.24.6', `file:///workspace/${pkg}/lib/index.js`)
      expect(() => {
        registerSingleton(
          pkg,
          '0.24.6',
          `file:///tmp/duplicate/${pkg}/lib/index.js`,
        )
      }).toThrow(new RegExp(`Multiple instances of ${pkg.replace('/', '\\/')} detected`))
    })

    it(`${pkg} dual-load error message names the specific package`, () => {
      registerSingleton(pkg, '0.24.6', `file:///workspace/${pkg}/lib/index.js`)
      try {
        registerSingleton(
          pkg,
          '0.24.6',
          `file:///tmp/duplicate/${pkg}/lib/index.js`,
        )
        expect.fail(`Expected throw for ${pkg}`)
      } catch (err) {
        const msg = String((err as Error).message)
        expect(msg).toContain(pkg)
        expect(msg).toContain('resolve.dedupe')
      }
    })
  }
})

describe('Singleton sentinel — cross-package isolation', () => {
  it('registering @pyreon/core then @pyreon/router does NOT throw — different names', () => {
    expect(() => {
      registerSingleton(
        '@pyreon/core',
        '0.24.6',
        'file:///workspace/core/lib/index.js',
      )
      registerSingleton(
        '@pyreon/router',
        '0.24.6',
        'file:///workspace/router/lib/index.js',
      )
    }).not.toThrow()
  })

  it('a dual-load on one package does NOT affect a sibling package', () => {
    registerSingleton(
      '@pyreon/core',
      '0.24.6',
      'file:///workspace/core/lib/index.js',
    )
    registerSingleton(
      '@pyreon/router',
      '0.24.6',
      'file:///workspace/router/lib/index.js',
    )
    // Dual-load core only.
    expect(() => {
      registerSingleton(
        '@pyreon/core',
        '0.24.6',
        'file:///tmp/duplicate/core/lib/index.js',
      )
    }).toThrow(/Multiple instances of @pyreon\/core detected/)
    // Router can still re-register cleanly after sentinel reset.
    _resetSentinel()
    expect(() => {
      registerSingleton(
        '@pyreon/router',
        '0.24.6',
        'file:///workspace/router/lib/index.js',
      )
    }).not.toThrow()
  })
})

describe('withSilent — refcount opt-out (race-safe replacement for env-var dance)', () => {
  it('suppresses the throw INSIDE the scope; restores detection after', async () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    await withSilent(async () => {
      // Inside the scope: silent, no throw on dual-load.
      expect(() => {
        registerSingleton(
          '@pyreon/reactivity',
          '0.24.6',
          'file:///tmp/inside-scope/reactivity/lib/index.js',
        )
      }).not.toThrow()
    })
    // Outside the scope: throw mode restored.
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/outside-scope/reactivity/lib/index.js',
      )
    }).toThrow(/Multiple instances of @pyreon\/reactivity detected/)
  })

  it('CONCURRENT Promise.all of 5 scopes — no leak, detection restored after all settle', async () => {
    // The race-safety regression test. Under the prior env-var dance,
    // 5 concurrent scopes leaked PYREON_SINGLE_INSTANCE='silent'
    // permanently. Under the refcount, depth returns to 0 after all
    // 5 settle regardless of ordering.
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        withSilent(async () => {
          await new Promise((r) => setTimeout(r, i + 1))
          expect(() => {
            registerSingleton(
              '@pyreon/reactivity',
              '0.24.6',
              `file:///tmp/concurrent-${i}/reactivity/lib/index.js`,
            )
          }).not.toThrow()
        }),
      ),
    )
    // After all 5 settle — detection MUST be back.
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/after-all-scopes/reactivity/lib/index.js',
      )
    }).toThrow(/Multiple instances of @pyreon\/reactivity detected/)
  })

  it('nested scopes count correctly (push/pop, depth > 0 throughout)', async () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    await withSilent(async () => {
      await withSilent(async () => {
        await withSilent(async () => {
          expect(() => {
            registerSingleton(
              '@pyreon/reactivity',
              '0.24.6',
              'file:///tmp/inner/reactivity/lib/index.js',
            )
          }).not.toThrow()
        })
        expect(() => {
          registerSingleton(
            '@pyreon/reactivity',
            '0.24.6',
            'file:///tmp/middle/reactivity/lib/index.js',
          )
        }).not.toThrow()
      })
      expect(() => {
        registerSingleton(
          '@pyreon/reactivity',
          '0.24.6',
          'file:///tmp/outer-still/reactivity/lib/index.js',
        )
      }).not.toThrow()
    })
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/after-nested/reactivity/lib/index.js',
      )
    }).toThrow()
  })

  it('decrement on throw — finally restores depth even if fn throws', async () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    await expect(
      withSilent(async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/after-throw/reactivity/lib/index.js',
      )
    }).toThrow()
  })

  it('withSilentSync — same semantics, sync', () => {
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      'file:///workspace/reactivity/lib/index.js',
    )
    const result = withSilentSync(() => {
      expect(() => {
        registerSingleton(
          '@pyreon/reactivity',
          '0.24.6',
          'file:///tmp/sync-inside/reactivity/lib/index.js',
        )
      }).not.toThrow()
      return 42
    })
    expect(result).toBe(42)
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///tmp/sync-after/reactivity/lib/index.js',
      )
    }).toThrow()
  })
})

describe('workerd / undefined import.meta.url (Cloudflare Pages)', () => {
  // Cloudflare workerd passes `undefined` as `import.meta.url` at module init.
  // A bare `url.indexOf('?')` in normalizeLocation threw
  // `Cannot read properties of undefined (reading 'indexOf')` BEFORE any
  // handler ran — every @pyreon-based Worker crashed at startup. The guard
  // (`typeof url !== 'string' || url.length === 0 → '<unknown>'`) must let the
  // registration succeed. Bisect-verify: delete that guard line in
  // singleton-sentinel.ts → the first two specs throw the indexOf TypeError.

  it('registerSingleton does NOT throw when location is undefined', () => {
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        undefined as unknown as string,
      )
    }).not.toThrow()
  })

  it('registerSingleton does NOT throw when location is the empty string', () => {
    expect(() => {
      registerSingleton('@pyreon/reactivity', '0.24.6', '')
    }).not.toThrow()
  })

  it('re-registering the same package with undefined is idempotent (single workerd instance, no false-positive duplicate throw)', () => {
    // A single workerd bundle imports @pyreon/reactivity once, but a re-eval
    // (or a second module in the same heap re-running the index) must NOT be
    // mistaken for a dual-instance load: both normalize to '<unknown>' →
    // `existing.location === marker.location` → allowed silently.
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      undefined as unknown as string,
    )
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        undefined as unknown as string,
      )
    }).not.toThrow()
  })

  it('a defined location is still distinguished from an undefined one (detection preserved)', () => {
    // The guard only relaxes the bad-input case; genuine dual-instance
    // detection between a real file:// location and a second real location is
    // unchanged (covered exhaustively above). Here we confirm the guard didn't
    // collapse a REAL location into the '<unknown>' bucket: registering a real
    // location after an undefined one is a genuine location MISMATCH → throws.
    registerSingleton(
      '@pyreon/reactivity',
      '0.24.6',
      undefined as unknown as string,
    )
    expect(() => {
      registerSingleton(
        '@pyreon/reactivity',
        '0.24.6',
        'file:///workspace/reactivity/lib/index.js',
      )
    }).toThrow(/Multiple instances/)
  })
})
