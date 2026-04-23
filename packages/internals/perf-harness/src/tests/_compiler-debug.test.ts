import { transformJSX_JS } from '@pyreon/compiler'
import { describe, it } from 'vitest'

describe('compiler output debug', () => {
  it('print reactive text', () => {
    const src = `export default ({name}) => <div>Hello <b>{name}</b>!</div>`
    const out = transformJSX_JS(src, 'test.tsx').code
    // oxlint-disable-next-line no-console
    console.log('--- reactive text ---\n' + out + '\n---')
  })
  it('print map list', () => {
    const src = `export default ({items}) => <ul>{items.map(x => <li>{x}</li>)}</ul>`
    const out = transformJSX_JS(src, 'test.tsx').code
    // oxlint-disable-next-line no-console
    console.log('--- map ---\n' + out + '\n---')
  })
})
