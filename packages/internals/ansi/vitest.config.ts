import { defineNodeConfig } from '@pyreon/vitest-config'

// Pure constants + small helpers, no DOM env needed.
export default defineNodeConfig({ category: 'internals' })
