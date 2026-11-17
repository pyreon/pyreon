import '@pyreon/zero-content/blog.css'
import './global.css'
import 'virtual:zero-content/collections'
import { startClient } from '@pyreon/zero/client'
import { routes } from 'virtual:zero/routes'

startClient({ routes })
