import pyreon from '@pyreon/vite-plugin'
import { defineConfig, type Plugin } from 'vite'

/**
 * Serves the Bookshelf API the generated client talks to.
 *
 * In-process dev middleware rather than a second server process: the e2e then
 * boots ONE thing, and the request path is still real HTTP through the real
 * generated client — a mock transport would prove the UI renders but not that
 * the generated URL, method and decode are right.
 */
function bookshelfApi(): Plugin {
  const books = [
    {
      id: '6f1c2b7e-0000-4000-8000-000000000001',
      title: 'The Left Hand of Darkness',
      status: 'available',
      pages: 304,
      subtitle: null,
      tags: ['scifi', 'classic'],
    },
    {
      id: '6f1c2b7e-0000-4000-8000-000000000002',
      title: 'Piranesi',
      status: 'borrowed',
      pages: 245,
      subtitle: 'A novel',
      tags: ['fantasy'],
    },
  ]
  const authors = [
    { id: '9a2d0000-0000-4000-8000-000000000001', name: 'Ursula K. Le Guin', email: 'ursula@example.com' },
    { id: '9a2d0000-0000-4000-8000-000000000002', name: 'Susanna Clarke', email: 'susanna@example.com' },
  ]
  return {
    name: 'bookshelf-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/v1/')) return next()
        const send = (body: unknown): void => {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(body))
        }
        if (url === '/v1/books') return send(books)
        if (url.startsWith('/v1/books/')) {
          const id = url.slice('/v1/books/'.length)
          const found = books.find((b) => b.id === id)
          if (!found) {
            res.statusCode = 404
            return res.end('{}')
          }
          return send(found)
        }
        if (url.startsWith('/v1/authors')) return send(authors)
        return next()
      })
    },
  }
}

export default defineConfig({
  plugins: [pyreon(), bookshelfApi()],
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
  resolve: { conditions: ['bun'] },
})
