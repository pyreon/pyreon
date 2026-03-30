import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

const { h, For } = await import('@pyreon/core')
const { signal } = await import('@pyreon/reactivity')
const { mount } = await import('@pyreon/runtime-dom')

let _id = 1
const el = document.createElement('div')
document.body.appendChild(el)
const rowsSig = signal<{ id: number; label: ReturnType<typeof signal<string>> }[]>([])
const toR = (row: { id: number; label: string }) => ({ id: row.id, label: signal(row.label) })
const makeRows = (n: number) => Array.from({ length: n }, () => ({ id: _id++, label: `row${_id}` }))

mount(
  h(
    'table',
    null,
    h(
      'tbody',
      null,
      For({
        each: rowsSig,
        by: (r) => r.id,
        children: (row) =>
          h(
            'tr',
            null,
            h('td', null, String(row.id)),
            h('td', null, () => row.label()),
          ),
      }),
    ),
  ),
  el,
)

// First fill 1k rows
rowsSig.set(makeRows(1000).map(toR))
console.log('initial 1k rows, now measuring replaceAll...')

// Time just the replaceAll signal set
const t0 = performance.now()
rowsSig.set(makeRows(1000).map(toR))
const t1 = performance.now()
console.log(`replaceAll (no class prop): ${(t1 - t0).toFixed(1)}ms`)

// Time clear
const t2 = performance.now()
rowsSig.set([])
const t3 = performance.now()
console.log(`clear: ${(t3 - t2).toFixed(1)}ms`)

// Now test with just range.deleteContents vs cleanup:
// Direct DOM test
const tbody2 = document.createElement('tbody')
document.body.appendChild(tbody2)
const rows2: HTMLElement[] = []
for (let i = 0; i < 1000; i++) {
  const tr = document.createElement('tr')
  tr.appendChild(document.createTextNode(`row${i}`))
  tbody2.appendChild(tr)
  rows2.push(tr)
}
const t4 = performance.now()
const range = document.createRange()
range.setStart(tbody2, 0)
range.setEnd(tbody2, tbody2.childNodes.length)
range.deleteContents()
const t5 = performance.now()
console.log(`range.deleteContents() 1000 trs: ${(t5 - t4).toFixed(1)}ms`)

// Test removeChild on detached subtree
const container = document.createElement('div')
const child = document.createElement('span')
const text = document.createTextNode('hi')
child.appendChild(text)
// DON'T attach to document — test detached removeChild
const t6 = performance.now()
for (let i = 0; i < 1000; i++) {
  child.removeChild(text)
  child.appendChild(text)
}
const t7 = performance.now()
console.log(`1000 detached removeChild+appendChild: ${(t7 - t6).toFixed(1)}ms`)

// Test attached removeChild
document.body.appendChild(container)
container.appendChild(child)
child.appendChild(text)
const t8 = performance.now()
for (let i = 0; i < 1000; i++) {
  child.removeChild(text)
  child.appendChild(text)
}
const t9 = performance.now()
console.log(`1000 attached removeChild+appendChild: ${(t9 - t8).toFixed(1)}ms`)
