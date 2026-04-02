import { createVitestConfig } from '@vitus-labs/tools-vitest'
import { mergeConfig } from 'vitest/config'
import { sharedConfig } from '../../../vitest.shared'

export default mergeConfig(createVitestConfig(), sharedConfig)
