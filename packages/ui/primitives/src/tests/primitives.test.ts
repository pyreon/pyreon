import { describe, expect, it } from 'vitest'
import * as exports from '../index'

describe('All primitives are exported', () => {
  const PRIMITIVES = [
    'CalendarBase',
    'CheckboxBase',
    'ColorPickerBase',
    'ComboboxBase',
    'FileUploadBase',
    'ModalBase',
    'RadioBase',
    'RadioGroupBase',
    'SelectBase',
    'SliderBase',
    'SwitchBase',
    'TabBase',
    'TabPanelBase',
    'TabsBase',
    'TreeBase',
  ] as const

  for (const name of PRIMITIVES) {
    it(`exports ${name}`, () => {
      expect((exports as Record<string, unknown>)[name]).toBeDefined()
      expect(typeof (exports as Record<string, unknown>)[name]).toBe('function')
    })
  }

  it('exports useRadioGroup hook', () => {
    expect(typeof exports.useRadioGroup).toBe('function')
  })

  it('exports useTabs hook', () => {
    expect(typeof exports.useTabs).toBe('function')
  })

  it('exports at least 15 primitives', () => {
    const fns = Object.values(exports).filter((v) => typeof v === 'function')
    expect(fns.length).toBeGreaterThanOrEqual(15)
  })
})
