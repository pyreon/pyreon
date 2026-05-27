import pyreon from '@pyreon/vite-plugin'
import zero, { nodeAdapter } from '@pyreon/zero/server'

export default {
  plugins: [pyreon(), zero({ mode: 'spa', adapter: nodeAdapter() })],
}
