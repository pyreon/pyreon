import { describe, expect, it } from 'vitest'
import DocButton from '../primitives/DocButton'
import DocCode from '../primitives/DocCode'
import DocColumn from '../primitives/DocColumn'
import DocDivider from '../primitives/DocDivider'
import DocDocument from '../primitives/DocDocument'
import DocHeading from '../primitives/DocHeading'
import DocImage from '../primitives/DocImage'
import DocLink from '../primitives/DocLink'
import DocList from '../primitives/DocList'
import DocListItem from '../primitives/DocListItem'
import DocPage from '../primitives/DocPage'
import DocPageBreak from '../primitives/DocPageBreak'
import DocQuote from '../primitives/DocQuote'
import DocRow from '../primitives/DocRow'
import DocSection from '../primitives/DocSection'
import DocSpacer from '../primitives/DocSpacer'
import DocTable from '../primitives/DocTable'
import DocText from '../primitives/DocText'

describe('document primitives _documentType markers', () => {
  const components = [
    { name: 'DocDocument', component: DocDocument, type: 'document' },
    { name: 'DocPage', component: DocPage, type: 'page' },
    { name: 'DocSection', component: DocSection, type: 'section' },
    { name: 'DocRow', component: DocRow, type: 'row' },
    { name: 'DocColumn', component: DocColumn, type: 'column' },
    { name: 'DocHeading', component: DocHeading, type: 'heading' },
    { name: 'DocText', component: DocText, type: 'text' },
    { name: 'DocLink', component: DocLink, type: 'link' },
    { name: 'DocImage', component: DocImage, type: 'image' },
    { name: 'DocTable', component: DocTable, type: 'table' },
    { name: 'DocList', component: DocList, type: 'list' },
    { name: 'DocListItem', component: DocListItem, type: 'list-item' },
    { name: 'DocCode', component: DocCode, type: 'code' },
    { name: 'DocDivider', component: DocDivider, type: 'divider' },
    { name: 'DocSpacer', component: DocSpacer, type: 'spacer' },
    { name: 'DocButton', component: DocButton, type: 'button' },
    { name: 'DocQuote', component: DocQuote, type: 'quote' },
    { name: 'DocPageBreak', component: DocPageBreak, type: 'page-break' },
  ]

  for (const { name, component, type } of components) {
    it(`${name} has _documentType = "${type}"`, () => {
      expect((component as any)._documentType).toBe(type)
    })
  }

  it('all 18 node types are covered', () => {
    expect(components).toHaveLength(18)
    const types = new Set(components.map((c) => c.type))
    expect(types.size).toBe(18)
  })
})

describe('document primitives have displayName', () => {
  it('DocHeading', () => {
    expect(DocHeading.displayName).toBe('DocHeading')
  })

  it('DocText', () => {
    expect(DocText.displayName).toBe('DocText')
  })

  it('DocSection', () => {
    expect(DocSection.displayName).toBe('DocSection')
  })

  it('DocTable', () => {
    expect(DocTable.displayName).toBe('DocTable')
  })
})

describe('document primitives are callable', () => {
  it('DocHeading is a function', () => {
    expect(typeof DocHeading).toBe('function')
  })

  it('DocText is a function', () => {
    expect(typeof DocText).toBe('function')
  })

  it('DocTable is a function', () => {
    expect(typeof DocTable).toBe('function')
  })

  it('DocDocument is a function', () => {
    expect(typeof DocDocument).toBe('function')
  })
})

describe('document primitives IS_ROCKETSTYLE', () => {
  it('DocHeading is a rocketstyle component', () => {
    expect((DocHeading as any).IS_ROCKETSTYLE).toBe(true)
  })

  it('DocText is a rocketstyle component', () => {
    expect((DocText as any).IS_ROCKETSTYLE).toBe(true)
  })

  it('DocSection is a rocketstyle component', () => {
    expect((DocSection as any).IS_ROCKETSTYLE).toBe(true)
  })
})
