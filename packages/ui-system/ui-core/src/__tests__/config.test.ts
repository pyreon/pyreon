import { afterEach, describe, expect, it } from 'vitest'
import config, { init, resolveCssVariables } from '../config'

describe('Configuration', () => {
  it('has default component as div', () => {
    expect(config.component).toBe('div')
  })

  it('has default textComponent as span', () => {
    expect(config.textComponent).toBe('span')
  })

  it('has css function', () => {
    expect(config.css).toBeDefined()
    expect(typeof config.css).toBe('function')
  })

  it('has styled function', () => {
    expect(config.styled).toBeDefined()
    expect(typeof config.styled).toBe('function')
  })

  it('has keyframes function', () => {
    expect(config.keyframes).toBeDefined()
    expect(typeof config.keyframes).toBe('function')
  })

  describe('init', () => {
    const originalCss = config.css
    const originalStyled = config.styled
    const originalKeyframes = config.keyframes
    const originalComponent = config.component
    const originalTextComponent = config.textComponent
    const originalCreateMediaQueries = config.createMediaQueries

    afterEach(() => {
      // restore defaults
      config.css = originalCss
      config.styled = originalStyled
      config.keyframes = originalKeyframes
      config.component = originalComponent
      config.textComponent = originalTextComponent
      config.createMediaQueries = originalCreateMediaQueries
    })

    it('updates css engine', () => {
      const mockCss = (() => '') as any
      init({ css: mockCss })
      expect(config.css).toBe(mockCss)
    })

    it('updates styled engine', () => {
      const mockStyled = (() => '') as any
      init({ styled: mockStyled })
      expect(config.styled).toBe(mockStyled)
    })

    it('updates component', () => {
      init({ component: 'section' })
      expect(config.component).toBe('section')
    })

    it('updates textComponent', () => {
      init({ textComponent: 'p' })
      expect(config.textComponent).toBe('p')
    })

    it('updates keyframes', () => {
      const mockKeyframes = (() => 'anim') as any
      init({ keyframes: mockKeyframes })
      expect(config.keyframes).toBe(mockKeyframes)
    })

    it('updates createMediaQueries', () => {
      const mockCreateMQ = (() => ({})) as any
      init({ createMediaQueries: mockCreateMQ })
      expect(config.createMediaQueries).toBe(mockCreateMQ)
    })

    it('only updates provided fields', () => {
      init({ component: 'article' })
      expect(config.component).toBe('article')
      expect(config.textComponent).toBe('span')
      expect(config.css).toBe(originalCss)
    })

    it('does nothing with empty object', () => {
      init({})
      expect(config.component).toBe('div')
      expect(config.textComponent).toBe('span')
    })

    it('can be called multiple times to swap engine', () => {
      const first = (() => 'first') as any
      const second = (() => 'second') as any
      init({ css: first })
      expect(config.css).toBe(first)
      init({ css: second })
      expect(config.css).toBe(second)
    })
  })
})

describe('resolveCssVariables', () => {
  afterEach(() => {
    init({ cssVariables: false })
  })

  it('returns a STABLE reference under stable config, and re-resolves on an init() toggle', () => {
    init({ cssVariables: false })
    const a = resolveCssVariables()
    const b = resolveCssVariables()
    // Memoized by config identity → same object across calls (no per-call
    // allocation). Bisect: the pre-memo code allocated a fresh object each call,
    // so `a === b` was false.
    expect(a).toBe(b)
    expect(a.enabled).toBe(false)

    init({ cssVariables: true })
    const c = resolveCssVariables()
    expect(c.enabled).toBe(true) // an init() toggle is still observed
    expect(c).not.toBe(a)
    expect(resolveCssVariables()).toBe(c) // stable again under the new config

    init({ cssVariables: { prefix: 'v', attribute: 'data-x' } })
    const e = resolveCssVariables()
    expect(e).toEqual({ enabled: true, prefix: 'v', attribute: 'data-x' })
    expect(resolveCssVariables()).toBe(e)
  })
})
