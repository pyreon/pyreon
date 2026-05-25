// Unit tests for the `isPyreonComponent` discriminator that gates
// `resolveSlot`'s "mount as component" (via `h()`) vs "call as reactive
// accessor" (bare invocation) paths.
//
// Bug class this protects against:
//   A bare-function user component using lifecycle hooks
//   (`useWindowResize`, `onMount`, `provide`, etc.) passed as a slot via
//   the shorthand `beforeContent={Header}` — if the discriminator misses
//   it (no marker, no convention), the function gets called bare without
//   a `runWithHooks` setup window, and any hook inside fires
//   `[Pyreon] onMount() called outside component setup` in dev-mode SSR.
//
// The fix: Tier 1 (markers) + Tier 2 (naming convention) catches both
// framework-factory components AND user-authored bare components.
import { describe, expect, it } from 'vitest'
import { isPyreonComponent } from '../helpers/isPyreonComponent'

describe('isPyreonComponent', () => {
  describe('non-function values fall through', () => {
    it('returns false for null', () => {
      expect(isPyreonComponent(null)).toBe(false)
    })
    it('returns false for undefined', () => {
      expect(isPyreonComponent(undefined)).toBe(false)
    })
    it('returns false for objects', () => {
      expect(isPyreonComponent({})).toBe(false)
      expect(isPyreonComponent({ IS_ROCKETSTYLE: true })).toBe(false)
    })
    it('returns false for strings / numbers', () => {
      expect(isPyreonComponent('Header')).toBe(false)
      expect(isPyreonComponent(42)).toBe(false)
    })
  })

  describe('Tier 1 — framework markers', () => {
    it('detects IS_ROCKETSTYLE', () => {
      const fn: any = () => null
      fn.IS_ROCKETSTYLE = true
      expect(isPyreonComponent(fn)).toBe(true)
    })

    it('detects PYREON__COMPONENT', () => {
      const fn: any = () => null
      fn.PYREON__COMPONENT = '@pyreon/elements/Element'
      expect(isPyreonComponent(fn)).toBe(true)
    })

    it('detects pkgName', () => {
      const fn: any = () => null
      fn.pkgName = '@pyreon/coolgrid'
      expect(isPyreonComponent(fn)).toBe(true)
    })

    it('ignores markers on the prototype (Object.hasOwn semantics)', () => {
      const proto: any = { IS_ROCKETSTYLE: true }
      const fn = Object.create(proto)
      fn.call = () => null
      // Not a function — but even if it were, the marker is inherited.
      expect(isPyreonComponent(fn)).toBe(false)
    })
  })

  describe('Tier 2 — naming convention (catches user-authored bare components)', () => {
    it('detects PascalCase function name (named function declaration)', () => {
      function Header() {
        return null
      }
      expect(isPyreonComponent(Header)).toBe(true)
    })

    it('detects PascalCase inferred from const arrow (bug-report shape)', () => {
      // Mirrors the bokisch.com Header.tsx: bare arrow, no marker, no
      // displayName initially — JS infers name "Header" from the const.
      const Header = () => null
      expect(isPyreonComponent(Header)).toBe(true)
    })

    it('detects explicit displayName even with no .name', () => {
      const fn: any = (() => null) // anonymous, name === ""
      fn.displayName = 'MyHeader'
      expect(isPyreonComponent(fn)).toBe(true)
    })

    it('displayName takes precedence over a camelCase .name', () => {
      const renderer = () => null
      ;(renderer as any).displayName = 'Renderer'
      expect(isPyreonComponent(renderer)).toBe(true)
    })

    it('detects PascalCase with displayName ALSO set (the bug-report exact shape)', () => {
      // Mirrors:
      //   const Header = () => { useWindowResize(...) ; return <div/> }
      //   Header.displayName = 'MyHeader'
      const Header = () => null
      ;(Header as any).displayName = 'MyHeader'
      expect(isPyreonComponent(Header)).toBe(true)
    })
  })

  describe('Tier 2 — falls through for accessor shapes', () => {
    it('returns false for anonymous arrow accessor', () => {
      // Anonymous arrows like `beforeContent={() => signal() ? <A/> : <B/>}`
      // — name === "", no marker, no displayName.
      expect(isPyreonComponent(() => null)).toBe(false)
    })

    it('returns false for camelCase helper', () => {
      const getContent = () => null
      expect(isPyreonComponent(getContent)).toBe(false)
    })

    it('returns false for `default` export name', () => {
      // `export default () => …` infers `name === "default"`. Lowercase
      // first letter → accessor path. Users wanting component semantics
      // should use a named binding before exporting.
      const realFn = (() => null) as any
      Object.defineProperty(realFn, 'name', { value: 'default' })
      expect(isPyreonComponent(realFn)).toBe(false)
    })

    it('returns false for empty-name function', () => {
      const fn = (() => null) as any
      Object.defineProperty(fn, 'name', { value: '' })
      expect(isPyreonComponent(fn)).toBe(false)
    })

    it('returns false for function whose .name is non-string', () => {
      const fn = (() => null) as any
      Object.defineProperty(fn, 'name', { value: undefined, configurable: true })
      expect(isPyreonComponent(fn)).toBe(false)
    })

    it('returns false for digit-prefixed name', () => {
      // Synthetic edge: numeric-prefixed identifiers aren't valid JS but
      // names CAN be assigned via Object.defineProperty. Guard against the
      // first-char-is-digit case.
      const fn = (() => null) as any
      Object.defineProperty(fn, 'name', { value: '1Header' })
      expect(isPyreonComponent(fn)).toBe(false)
    })

    it('returns false for unicode-letter-prefixed name (only A-Z counts)', () => {
      // The naming-convention check uses ASCII A-Z explicitly to avoid
      // matching helpers named with Cyrillic / Greek / fullwidth uppercase
      // letters that might shadow framework conventions in i18n-heavy
      // codebases.
      const fn = (() => null) as any
      Object.defineProperty(fn, 'name', { value: 'Ω' }) // Greek Omega
      expect(isPyreonComponent(fn)).toBe(false)
    })
  })

  describe('marker + convention coexist (markers take precedence semantically)', () => {
    it('rocketstyle component with PascalCase .name returns true (Tier 1 wins)', () => {
      const Header: any = function Header() {
        return null
      }
      Header.IS_ROCKETSTYLE = true
      expect(isPyreonComponent(Header)).toBe(true)
    })

    it('rocketstyle component with lowercase .name still returns true (marker overrides)', () => {
      const fn: any = function widget() {
        return null
      }
      fn.IS_ROCKETSTYLE = true
      expect(isPyreonComponent(fn)).toBe(true)
    })
  })
})
