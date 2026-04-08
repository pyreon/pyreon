import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { layout } from './routes/_layout'

startClient({ routes, layout })
