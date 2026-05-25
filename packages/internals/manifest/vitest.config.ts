import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure types + trivial helper. No DOM env needed.
export default defineNodeConfig({ category: 'internals' })
