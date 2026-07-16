// Exercises the `/matchers` SOURCE entry the same way a consumer does:
// a bare import must register the jest-dom matchers on vitest's `expect`.
// (The BUILT artifact's shape is locked separately in shipped-entries.test.ts.)
import '../matchers'

describe('@pyreon/testing/matchers entry', () => {
  it('registers the jest-dom matchers on expect', () => {
    const el = document.createElement('div')
    el.textContent = 'hello'
    document.body.appendChild(el)
    try {
      expect(el).toBeInTheDocument()
      expect(el).toHaveTextContent('hello')
    } finally {
      el.remove()
    }
  })
})
