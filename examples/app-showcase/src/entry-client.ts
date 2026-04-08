import { startClient } from '@pyreon/zero/client'
import { routes } from 'virtual:zero/routes'
import { layout } from './routes/_layout'

startClient({ routes, layout })
