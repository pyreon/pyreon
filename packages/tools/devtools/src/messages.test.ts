import { describe, expect, it } from 'vitest'
import {
  createBackgroundForward,
  createBackgroundToContent,
  createContentWire,
  createPageWire,
  createPanelToBackground,
  isBackgroundForward,
  isBackgroundToContent,
  isContentWireMessage,
  isPageWireMessage,
  isPanelToBackground,
} from './messages'

describe('message type guards', () => {
  describe('isPageWireMessage', () => {
    it('returns true for valid page wire messages', () => {
      expect(
        isPageWireMessage({
          source: 'pyreon-devtools-page',
          payload: { type: 'all-result', entries: [] },
        }),
      ).toBe(true)
    })

    it('returns false for wrong source', () => {
      expect(
        isPageWireMessage({
          source: 'pyreon-devtools-content',
          payload: {},
        }),
      ).toBe(false)
    })

    it('returns false for null', () => {
      expect(isPageWireMessage(null)).toBe(false)
    })

    it('returns false for primitives', () => {
      expect(isPageWireMessage('string')).toBe(false)
      expect(isPageWireMessage(42)).toBe(false)
      expect(isPageWireMessage(undefined)).toBe(false)
    })

    it('returns false for objects missing payload', () => {
      expect(isPageWireMessage({ source: 'pyreon-devtools-page' })).toBe(false)
    })
  })

  describe('isContentWireMessage', () => {
    it('returns true for valid content wire messages', () => {
      expect(
        isContentWireMessage({
          source: 'pyreon-devtools-content',
          payload: { type: 'get-all' },
        }),
      ).toBe(true)
    })

    it('returns false for wrong source', () => {
      expect(
        isContentWireMessage({
          source: 'pyreon-devtools-page',
          payload: {},
        }),
      ).toBe(false)
    })
  })

  describe('isBackgroundForward', () => {
    it('returns true for valid background forward messages', () => {
      expect(
        isBackgroundForward({
          source: 'pyreon-devtools-background',
          tabId: 1,
          payload: { type: 'all-result', entries: [] },
        }),
      ).toBe(true)
    })

    it('returns false for wrong source', () => {
      expect(isBackgroundForward({ source: 'other', payload: {} })).toBe(false)
    })
  })

  describe('isBackgroundToContent', () => {
    it('returns true for valid background-to-content messages', () => {
      expect(
        isBackgroundToContent({
          source: 'pyreon-devtools-background-forward',
          payload: { type: 'get-all' },
        }),
      ).toBe(true)
    })

    it('returns false for wrong source', () => {
      expect(
        isBackgroundToContent({
          source: 'pyreon-devtools-background',
          payload: {},
        }),
      ).toBe(false)
    })
  })

  describe('isPanelToBackground', () => {
    it('returns true for valid panel messages', () => {
      expect(
        isPanelToBackground({
          source: 'pyreon-devtools-panel',
          payload: { type: 'get-all' },
        }),
      ).toBe(true)
    })

    it('returns false for wrong source', () => {
      expect(isPanelToBackground({ source: 'other', payload: {} })).toBe(false)
    })
  })
})

describe('message factories', () => {
  it('createPageWire wraps a hook message', () => {
    const payload = { type: 'pyreon-detected' as const, version: '1.0.0' }
    const wire = createPageWire(payload)

    expect(wire.source).toBe('pyreon-devtools-page')
    expect(wire.payload).toBe(payload)
    expect(isPageWireMessage(wire)).toBe(true)
  })

  it('createContentWire wraps a panel message', () => {
    const payload = { type: 'get-all' as const }
    const wire = createContentWire(payload)

    expect(wire.source).toBe('pyreon-devtools-content')
    expect(wire.payload).toBe(payload)
    expect(isContentWireMessage(wire)).toBe(true)
  })

  it('createBackgroundForward wraps a hook message with tabId', () => {
    const payload = { type: 'all-result' as const, entries: [] }
    const forward = createBackgroundForward(42, payload)

    expect(forward.source).toBe('pyreon-devtools-background')
    expect(forward.tabId).toBe(42)
    expect(forward.payload).toBe(payload)
    expect(isBackgroundForward(forward)).toBe(true)
  })

  it('createBackgroundToContent wraps a panel message', () => {
    const payload = { type: 'get-all' as const }
    const msg = createBackgroundToContent(payload)

    expect(msg.source).toBe('pyreon-devtools-background-forward')
    expect(msg.payload).toBe(payload)
    expect(isBackgroundToContent(msg)).toBe(true)
  })

  it('createPanelToBackground wraps a panel message', () => {
    const payload = { type: 'highlight' as const, id: 'c-1' }
    const msg = createPanelToBackground(payload)

    expect(msg.source).toBe('pyreon-devtools-panel')
    expect(msg.payload).toBe(payload)
    expect(isPanelToBackground(msg)).toBe(true)
  })
})
