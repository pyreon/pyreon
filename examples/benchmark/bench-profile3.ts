import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

// Test 1: how fast is isConnected on detached nodes?
const parent = document.createElement('div')
const children: HTMLElement[] = []
for (let i = 0; i < 5000; i++) {
  const el = document.createElement('span')
  parent.appendChild(el)
  children.push(el)
}
document.body.appendChild(parent)
const range = document.createRange()
range.setStart(parent, 0)
range.setEnd(parent, parent.childNodes.length)
range.deleteContents()

// Now all children are detached (parentNode = null)
const t0 = performance.now()
for (const el of children) {
  void el.isConnected // just reading isConnected
}
const t1 = performance.now()
console.log(`5000 el.isConnected reads (detached): ${(t1 - t0).toFixed(2)}ms`)

// Test 2: reading parentNode on detached nodes
const t2 = performance.now()
for (const el of children) {
  void el.parentNode
}
const t3 = performance.now()
console.log(`5000 el.parentNode reads (detached): ${(t3 - t2).toFixed(2)}ms`)

// Test 3: removeChild on detached nodes (after range deletion)
// Re-create structure
const parent2 = document.createElement('div')
const children2: HTMLElement[] = []
for (let i = 0; i < 1000; i++) {
  const span = document.createElement('span')
  const inner = document.createElement('em')
  span.appendChild(inner)
  parent2.appendChild(span)
  children2.push(span)
}
document.body.appendChild(parent2)
const range2 = document.createRange()
range2.setStart(parent2, 0)
range2.setEnd(parent2, parent2.childNodes.length)
range2.deleteContents()

// Now span.parentNode = null, inner.parentNode = span (detached)
const t4 = performance.now()
for (const span of children2) {
  const inner = span.firstChild as HTMLElement
  if (inner) span.removeChild(inner) // remove inner from detached span
}
const t5 = performance.now()
console.log(`1000 removeChild on detached subtree: ${(t5 - t4).toFixed(2)}ms`)

// Test 4: Does NOT calling removeChild save time?
const parent3 = document.createElement('div')
const children3: HTMLElement[] = []
for (let i = 0; i < 1000; i++) {
  const span = document.createElement('span')
  const inner = document.createElement('em')
  span.appendChild(inner)
  parent3.appendChild(span)
  children3.push(span)
}
document.body.appendChild(parent3)
const range3 = document.createRange()
range3.setStart(parent3, 0)
range3.setEnd(parent3, parent3.childNodes.length)
range3.deleteContents()

// Just iterate without doing anything
const t6 = performance.now()
for (const _span of children3) {
  // do nothing
}
const t7 = performance.now()
console.log(`1000 empty loop (no removeChild): ${(t7 - t6).toFixed(2)}ms`)
