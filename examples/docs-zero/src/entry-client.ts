import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import 'virtual:zero-content/collections'
import './styles/tokens.css'
import './styles/docs.css'

startClient({ routes })
