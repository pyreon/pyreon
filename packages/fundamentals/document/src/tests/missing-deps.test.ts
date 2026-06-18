/**
 * Missing-dependency error paths for the heavy renderers.
 *
 * The PPTX/XLSX renderers `await import('pptxgenjs' | 'exceljs')` inside a
 * try/catch and throw an actionable "install X" error when the optional
 * peer dependency is absent. Those deps ARE installed in this repo, so the
 * catch arm is unreachable in the normal suite — here we mock each import
 * to throw, exercising the install-guidance throw honestly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Document, Page, Text } from '../nodes'

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('pptxgenjs')
  vi.doUnmock('exceljs')
})

const simpleDoc = Document({ children: Page({ children: Text({ children: 'hi' }) }) })

describe('heavy-renderer missing-dependency guards', () => {
  it('pptx renderer throws an install hint when pptxgenjs is missing', async () => {
    vi.doMock('pptxgenjs', () => {
      throw new Error('Cannot find module pptxgenjs')
    })
    const { pptxRenderer } = await import('../renderers/pptx')
    await expect(pptxRenderer.render(simpleDoc)).rejects.toThrow(
      /PPTX renderer requires "pptxgenjs"/,
    )
  })

  it('xlsx renderer throws an install hint when exceljs is missing', async () => {
    vi.doMock('exceljs', () => {
      throw new Error('Cannot find module exceljs')
    })
    const { xlsxRenderer } = await import('../renderers/xlsx')
    await expect(xlsxRenderer.render(simpleDoc)).rejects.toThrow(
      /XLSX renderer requires "exceljs"/,
    )
  })
})
