import { describe, expect, it } from 'vitest'

// Eagerly import every route file via vite glob.
// This catches:
//   - Syntax errors in any demo
//   - Missing or broken imports
//   - Routes that forgot to export a default function component
const routeModules = import.meta.glob('../routes/**/*.tsx', { eager: true }) as Record<
  string,
  { default?: unknown }
>

describe('All route files', () => {
  it('imports at least 50 routes', () => {
    expect(Object.keys(routeModules).length).toBeGreaterThanOrEqual(50)
  })

  for (const [path, mod] of Object.entries(routeModules)) {
    // Skip _layout.tsx — it exports `layout` (named), not default
    if (path.includes('_layout')) continue

    it(`${path} exports a default function`, () => {
      expect(mod.default).toBeDefined()
      expect(typeof mod.default).toBe('function')
    })
  }
})

// Demo modules — same shape check (named exports must be functions)
const demoModules = import.meta.glob('../demos/*.tsx', { eager: true }) as Record<
  string,
  Record<string, unknown>
>

describe('All demo files', () => {
  it('imports at least 50 demos', () => {
    expect(Object.keys(demoModules).length).toBeGreaterThanOrEqual(50)
  })

  for (const [path, mod] of Object.entries(demoModules)) {
    it(`${path} exports at least one function`, () => {
      const fns = Object.values(mod).filter((v) => typeof v === 'function')
      expect(fns.length).toBeGreaterThan(0)
    })
  }
})
