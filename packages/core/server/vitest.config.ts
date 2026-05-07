import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vite'
import { nodeExcludeBrowserTests, sharedConfig } from '../../../vitest.shared'

export default mergeConfig(
  mergeConfig(createVitestConfig(), sharedConfig),
  nodeExcludeBrowserTests,
)
