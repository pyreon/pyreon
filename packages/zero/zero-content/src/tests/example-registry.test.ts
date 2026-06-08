import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  _exampleCount,
  _exampleKeys,
  _resetExampleRegistry,
  loadExampleComponent,
  registerExamples,
  resolveExample,
} from '../components/example-registry'

describe('example-registry — registration + resolution', () => {
  afterEach(() => {
    _resetExampleRegistry()
  })

  it('starts empty', () => {
    expect(_exampleCount()).toBe(0)
    expect(_exampleKeys()).toEqual([])
  })

  it('registerExamples loads a glob shape', () => {
    const loader = async () => ({ default: () => null })
    registerExamples({ './examples/a.tsx': loader, './examples/b.tsx': loader })
    expect(_exampleCount()).toBe(2)
    expect(_exampleKeys()).toContain('./examples/a.tsx')
  })

  it('registerExamples is idempotent — second call replaces the first', () => {
    registerExamples({ './a.tsx': async () => ({ default: () => null }) })
    expect(_exampleCount()).toBe(1)
    registerExamples({
      './x.tsx': async () => ({ default: () => null }),
      './y.tsx': async () => ({ default: () => null }),
    })
    expect(_exampleCount()).toBe(2)
    expect(_exampleKeys()).not.toContain('./a.tsx')
  })

  describe('resolveExample — path resolution', () => {
    it('resolves an exact path key', () => {
      const loader = async () => ({ default: () => null })
      registerExamples({ './examples/foo.tsx': loader })
      expect(resolveExample('./examples/foo.tsx')).toBe(loader)
    })

    it('resolves a path WITHOUT extension by trying .tsx first', () => {
      const loader = async () => ({ default: () => null })
      registerExamples({ './examples/foo.tsx': loader })
      expect(resolveExample('./examples/foo')).toBe(loader)
    })

    it('falls back to .ts extension when .tsx is missing', () => {
      const loader = async () => ({ default: () => null })
      registerExamples({ './examples/foo.ts': loader })
      expect(resolveExample('./examples/foo')).toBe(loader)
    })

    it('falls back to .jsx then .js', () => {
      const jsx = async () => ({ default: () => 'jsx' })
      const js = async () => ({ default: () => 'js' })
      registerExamples({ './a.jsx': jsx })
      expect(resolveExample('./a')).toBe(jsx)
      registerExamples({ './b.js': js })
      expect(resolveExample('./b')).toBe(js)
    })

    it('extension priority: tsx beats ts beats jsx beats js', () => {
      const tsx = async () => ({ default: () => 'tsx' })
      const ts = async () => ({ default: () => 'ts' })
      const jsx = async () => ({ default: () => 'jsx' })
      const js = async () => ({ default: () => 'js' })
      registerExamples({
        './a.tsx': tsx,
        './a.ts': ts,
        './a.jsx': jsx,
        './a.js': js,
      })
      expect(resolveExample('./a')).toBe(tsx)
    })

    it('resolves bare paths by prepending ./', () => {
      const loader = async () => ({ default: () => null })
      registerExamples({ './examples/foo.tsx': loader })
      expect(resolveExample('examples/foo')).toBe(loader)
      expect(resolveExample('examples/foo.tsx')).toBe(loader)
    })

    it('returns null for unknown paths', () => {
      registerExamples({ './a.tsx': async () => ({ default: () => null }) })
      expect(resolveExample('./nope')).toBeNull()
      expect(resolveExample('./examples/missing')).toBeNull()
    })

    it('returns null when registry is empty', () => {
      expect(resolveExample('./anything')).toBeNull()
    })
  })

  describe('loadExampleComponent — async loading + safety', () => {
    it('extracts the default export as the component', async () => {
      const Comp = () => null
      const loader = async () => ({ default: Comp })
      const result = await loadExampleComponent(loader)
      expect(result).toBe(Comp)
    })

    it('returns null when the module has no default export', async () => {
      const loader = async () => ({ named: () => null }) as unknown as Record<string, unknown>
      const result = await loadExampleComponent(loader)
      expect(result).toBeNull()
    })

    it('returns null when the default is not a function', async () => {
      const loader = async () => ({ default: 'not a function' })
      const result = await loadExampleComponent(loader)
      expect(result).toBeNull()
    })

    it('returns null when the module is null/non-object', async () => {
      const loader = async () => null as unknown
      const result = await loadExampleComponent(loader)
      expect(result).toBeNull()
    })

    it('returns null + logs on loader error', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const loader = async () => {
        throw new Error('boom')
      }
      const result = await loadExampleComponent(loader)
      expect(result).toBeNull()
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })
})
